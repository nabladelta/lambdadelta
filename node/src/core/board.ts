import Protomux from 'protomux'
import c from 'compact-encoding'
import { TypedEmitter } from 'tiny-typed-emitter'
import { Thread } from './thread'
import { BoardEvents } from './types/events'
import { Keystorage } from './keystorage'
import Hypercore from 'hypercore'
import BTree from 'sorted-btree'
import { getTimestampInSeconds } from './utils/utils'
import { FUTURE_TOLERANCE_SECONDS, UPDATE_STALE_SECONDS } from '../constants'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'

const MAX_THREADS = 256

export class BulletinBoard extends TypedEmitter<BoardEvents> {
    private corestore: any
    public threads: {[tid: string]: Thread}
    public peers: Map<string, {stream: NoiseSecretStream, inputAnnouncer: any}>
    public topic: string
    private keystore: Keystorage
    private _ready: Promise<void>
    private lastModified: BTree<number, string> // Timestamp (ms) => ThreadId
    private tidLastModified: Map<string, number> // ThreadId => Timestamp (ms)

    constructor(topic: string, corestore: any) {
        super()
        this.corestore = corestore
        this.topic = topic
        this.lastModified = new BTree()
        this.tidLastModified = new Map()
        this.peers = new Map()
        this.threads = {}
        this.keystore = new Keystorage(Hypercore.defaultStorage(corestore.storage), 'board/' + this.topic + '/')
        this._ready = this.readStorageKeys()
    }

    public ready() {
        return this._ready
    }

    public async attachStream(stream: NoiseSecretStream) {
        const remotePublicKey = stream.remotePublicKey.toString('hex')
        if (this.peers.has(remotePublicKey)) return // Already added peer

        const self = this
        const mux = Protomux.from(stream)

        const channel = mux.createChannel({
            protocol: 'bbs-board-rep',
            id: Buffer.from(this.topic),
            unique: true
        })
        channel.open()

        const inputAnnouncer = channel.addMessage({
            encoding: c.array(c.array(c.string)),
            async onmessage(cids: string[][], _: any) { await self.recv(cids) }
        })
        
        const streamData = {stream, inputAnnouncer}
        this.peers.set(remotePublicKey, streamData)
        this.announceAllInputs(streamData)
        this.emit('peerConnected', stream.remotePublicKey)
        stream.once('close', () => {
            this.peers.delete(remotePublicKey)
        })
    }

    private async recv(cids: string[][]) {
        const updated: string[][] = []
        for (let threadInputs of cids) {
            const threadId = threadInputs[0]
            let newThread = false
            try {
                if (!this.threads[threadId]) {
                    const t = await Thread.load(threadId, this.corestore)
                    await this._addThread(t)
                    this.emit("joinedThread", t.tid, t)
                    newThread = true
                }
    
                const thread = this.threads[threadId]
                const inputs = await thread.recv(threadInputs)
                if (inputs || newThread) updated.push(inputs || thread.allInputs())
            } catch (e) {
                console.log(`Thread rejected: ${(e as Error).message}`)
            }
        }
        if (updated.length > 0) {
            this.announceInputsToAll(updated)
            this.updateStorageKeys()
        }
    }

    private async announceInputsToAll(inputs: string[][]) {
        if (!inputs.length) return
        for (let [_, streamData] of this.peers) {
            await streamData.inputAnnouncer.send(inputs)
        }
    }

    private async announceAllInputs(streamData: {stream: NoiseSecretStream, inputAnnouncer: any}) {
        const inputs = this.lastModified.valuesArray().map(tid => this.threads[tid].allInputs())
        await streamData.inputAnnouncer.send(inputs)
    }

    private async _addThread(t: Thread) {
        if (!t.creationTime) throw Error("Missing thread creation time")
        // Avoid issue of storing two threads under the same creation time
        // Convert CT to ms
        let creationTime = t.creationTime * 1000

        while(!this.lastModified.setIfNotPresent(creationTime, t.tid)) {
            creationTime++ // Keep trying with a newer time until we find an empty spot
        }
        this.tidLastModified.set(t.tid, creationTime) // Set reverse

        this.threads[t.tid] = t
        this.bumpOff()
        t.on('receivedPost', (tid: string, post: IPost) => {
            this.bumpThread(tid, post)
        })
        await t.start()
    }

    private async bumpThread(threadId: string, post: IPost) {
        const localPresentTime = getTimestampInSeconds()
        if (post.time > (localPresentTime + FUTURE_TOLERANCE_SECONDS)) {
            return // Not bumping, post is from the future
        }
        if (post.time < (localPresentTime - UPDATE_STALE_SECONDS)) {
            return // Update is stale, ie, we received it too late. Ignore.
        }

        const lastModified = this.tidLastModified.get(threadId)
        if (!lastModified) return // Thread not on board?

        let newLastModified = ( // Even if within tolerance, we do not set lastModified to a future time.
                post.time <= localPresentTime ? post.time : localPresentTime
            ) * 1000 // Convert to ms
        if (lastModified > newLastModified) return // Post is from before last bump, Ignore

        // Bump the thread
        if (!this.lastModified.delete(lastModified)){
            console.error("LastModified storage discrepancy")
        }
        while(!this.lastModified.setIfNotPresent(newLastModified, threadId)) {
            newLastModified++ // Keep trying with a newer time until we find an empty spot
        }
        this.tidLastModified.set(threadId, newLastModified)
        console.log(`Bumped ${threadId.slice(0,8)} to ${newLastModified}`)
    }

    private async bumpOff() {
        if (this.lastModified.length < MAX_THREADS) {
            return
        }
        // Get the oldest last modified time
        const oldestTime = this.lastModified.minKey()
        if (!oldestTime) return // No threads?

        const toRemove = this.lastModified.get(oldestTime)!
        this.lastModified.delete(oldestTime)
        this.tidLastModified.delete(toRemove)
        
        await this.threads[toRemove].destroy()
        delete this.threads[toRemove]
    }

    public async newThread(op: IPost | ((tid: string) => Promise<IPost | false>)) {
        const t = await Thread.create(this.corestore, async (tid) => {
            if (this.threads[tid]) return false
            if (typeof op == 'function') return await op(tid)
            return op
        })
        if (!t) return false
        await this._addThread(t)
        this.announceInputsToAll([t.allInputs()])
        this.updateStorageKeys()
        return t.tid
    }

    public async newMessage(threadId: string, post: IPost) {
        const t = this.threads[threadId]
        if (!t) return false

        if (await t.newMessage(post)) {
            this.announceInputsToAll([t.allInputs()])
        }
        return t.localInput
    }

    public async getThreadContent(threadId: string, start?: number, end?: number) {
        if (!this.threads[threadId]) return undefined

        const view = await this.threads[threadId].getUpdatedView()

        const thread: IThread = {posts: []}

        if (view.length == 0) {
            thread.posts.push(await this.threads[threadId].getOp())
        }
        end = end || (view.length as number)

        if (end > view.length) {
            end = view.length as number
        }
        let images = 0
        for (let i = start || 0; i < end; i++) {
            const node = await view.get(i)
            const post: IPost = JSON.parse(node.value.toString())
            if (post.tim) images++

            thread.posts.push(post)
        }

        if (!start && thread.posts.length) {
            thread.posts[0].replies = (view.length || 1) - 1
            thread.posts[0].images = images
        }
        return thread
    }

    public async getThreadLength(threadId: string) {
        const view = this.threads[threadId].base.view

        await view.ready()
        await view.update()
        return view.length
    }

    public async getCatalog() {
        const catalog: {page: number, threads: IPost[]}[] = []
        const threads = []
        // Iterate from newest to oldest
        for (let [lastModified, threadId] of this.lastModified.entriesReversed()) {
            const thread = (await this.getThreadContent(threadId))!
            const op = thread.posts[0]
            op.last_replies = thread.posts.slice(1).slice(-3)
            op.last_modified = lastModified
            threads.push(op)
        }
        for (let i = 0; i <= 16; i++)  {
            const page = {
                page: i+1,
                threads: threads.slice(i*16, (i*16)+16)
            }
            if (page.threads.length == 0) {
                break
            }
            catalog.push(page)
        }
        return catalog
    }

    private async readStorageKeys() {
        const loadedInputs = new Set<string>()
        await this.keystore._readStorageKey('tids', loadedInputs)
        for (let threadId of loadedInputs) {
            const t = await Thread.load(threadId, this.corestore)
            await this._addThread(t)
        }
    }
    
    private async updateStorageKeys() {
        await this.keystore._updateStorageKey('tids', new Set(this.lastModified.valuesArray()))
    }
}