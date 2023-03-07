import Protomux from 'protomux'
import c from 'compact-encoding'
import { TypedEmitter } from 'tiny-typed-emitter'
import { Thread } from './thread'
import { BoardEvents } from './types/events'
import { Keystorage } from './keystorage'
import Hypercore from 'hypercore'

const MAX_THREADS = 256

export class BulletinBoard extends TypedEmitter<BoardEvents> {
    private corestore: any
    public threadsList: string[]
    public threads: {[tid: string]: Thread}
    private _streams: Set<{stream: any, inputAnnouncer: any}>
    public topic: string
    private keystore: Keystorage
    private _ready: Promise<void>

    constructor(topic: string, corestore: any) {
        super()
        this.corestore = corestore
        this.topic = topic
        this.threadsList = []
        this._streams = new Set()
        this.threads = {}
        this.keystore = new Keystorage(Hypercore.defaultStorage(corestore.storage), 'board/' + this.topic + '/')
        this._ready = this.readStorageKeys()
    }

    public ready() {
        return this._ready
    }

    public async attachStream(stream: any) {
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
        this._streams.add(streamData)
        this.announceAllInputs(streamData)

        stream.once('close', () => {
            this._streams.delete(streamData)
        })
    }

    private async recv(cids: string[][]) {
        const updated: string[][] = []
        for (let threadInputs of cids) {
            const threadId = threadInputs[0]

            let newThread = false
            if (!this.threads[threadId]) {
                const t = await Thread.load(threadId, this.corestore)
                await this._addThread(t)
                this.emit("joinedThread", t.tid, t)
                newThread = true
            }

            const thread = this.threads[threadId]
            const inputs = await thread.recv(threadInputs)
            if (inputs || newThread) updated.push(inputs || thread.allInputs())
        }
        if (updated.length > 0) {
            this.announceInputsToAll(updated)
            this.updateStorageKeys()
        }
    }

    private async announceInputsToAll(inputs: string[][]) {
        if (!inputs.length) return
        for (let streamData of this._streams) {
            await streamData.inputAnnouncer.send(inputs)
        }
    }

    private async announceAllInputs(streamData: {stream: any, inputAnnouncer: any}) {
        const inputs = this.threadsList.map(tid => this.threads[tid].allInputs())
        await streamData.inputAnnouncer.send(inputs)
    }

    private async _addThread(t: Thread) {
        this.threadsList.push(t.tid)
        this.threads[t.tid] = t
        this.bumpOff()
        await t.start()
    }
    
    private async bumpOff() {
        if (this.threadsList.length < MAX_THREADS) {
            return
        }
        const removed = this.threadsList.shift()!
        await this.threads[removed].destroy()
        delete this.threads[removed]
    }

    public async newThread(op: IPost): Promise<string> {
        const t = await Thread.create(this.corestore, op)
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

        for (let i = start || 0; i < (end || view.length); i++) {
            const node = await view.get(i)
            thread.posts.push(JSON.parse(node.value.toString()))
        }

        if (!start && thread.posts.length) {
            thread.posts[0].replies = view.length - 1
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
        for (let threadId of this.threadsList.slice().reverse()) {
            const thread = (await this.getThreadContent(threadId))!
            const op = thread.posts[0]
            op.last_replies = thread.posts.slice(1).slice(-3)
            threads.push(op)
        }
        for (let i = 0; i <= 16; i++)  {
            if (threads.slice(i*16).length == 0) {
                break
            }
            catalog.push({
                page: i+1,
                threads: threads.slice(i*16, (i*16)+16)
            })
        }
        return catalog
    }

    private async readStorageKeys() {
        const loadedInputs = new Set<string>()
        await this.keystore._readStorageKey('inputs', loadedInputs)
        for (let threadId of loadedInputs) {
            const t = await Thread.load(threadId, this.corestore)
            await this._addThread(t)
        }
    }
    
    private async updateStorageKeys() {
        await this.keystore._updateStorageKey('inputs', new Set(this.threadsList))
    }
}