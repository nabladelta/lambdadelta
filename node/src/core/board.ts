import Autobase from 'autobase'
import b4a from 'b4a'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { TypedEmitter } from 'tiny-typed-emitter'

import { Thread } from './thread'
import { difference, getThreadEpoch } from './utils/utils'
import { BoardEvents } from './events'

export class BulletinBoard extends TypedEmitter<BoardEvents> {
    corestore: any
    stores: {
        op: any
        reply: any
        outputs: any
    }
    threadsList: string[]
    threads: {[tid: string]: Thread}
    _streams: Set<{stream: any, inputAnnouncer: any}>
    swarm: any
    topic: string
    channel: any

    constructor(topic: string, corestore: any) {
        super()
        this.corestore = corestore
        this.topic = topic
        this.stores = {
            op: corestore.namespace('op'),
            reply: corestore.namespace('reply'),
            outputs: corestore.namespace('outputs')
        }
        this.threadsList = []
        this._streams = new Set()
        this.threads = {}
    }

    async attachStream(stream: any) {
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
            async onmessage(cids: string[][], session: any) {
                console.log("msg")
                const updated: string[][] = []
                for (let threadInputs of cids) {
                    let nt = false
                    if (!self.threads[threadInputs[0]]) {
                        await self._addThreads([threadInputs[0]])
                        nt = true
                    }
                    const inputs = await self.threads[threadInputs[0]].recv(threadInputs)
                    if (inputs || nt) updated.push(inputs || [threadInputs[0]])
                }
                if (updated.length > 0) self.announceInputsToAll(updated)
            }
        })
        
        const streamData = {stream, inputAnnouncer}
        this._streams.add(streamData)
        this.announceAllInputs(streamData)

        stream.once('close', () => {
            this._streams.delete(streamData)
        })
    }

    async announceInputsToAll(inputs: string[][]) {
        if (!inputs.length) return
        for (let streamData of this._streams) {
            await streamData.inputAnnouncer.send(inputs)
        }
    }

    async announceAllInputs(streamData: {stream: any, inputAnnouncer: any}) {
        const inputs = this.threadsList.map(tid => this.threads[tid].allInputs())
        await streamData.inputAnnouncer.send(inputs)
    }

    async _addThreads(threadIds: string[] | Set<string>) {
        for (let threadId of threadIds) {
            await this.joinThread(threadId)
        }
    }

    async allow(msg: string, session: any) {
        return true
    }

    async buildThread(opcore: any, inputCore: any) {
        const threadId = opcore.key.toString('hex')
        const output = this.stores.outputs.get({name: threadId})
        await output.ready()

        const manager = new Thread(threadId, this.corestore, opcore, inputCore, output)
        
        this.threadsList.push(threadId)
        this.threads[threadId] = manager
        await manager.ready()
        await manager.start()
        this.announceInputsToAll([manager.allInputs()])
        return manager
    }

    async joinThread(threadId: string) {
        const opcore = this.corestore.get(b4a.from(threadId, 'hex'))
        const input = this.stores.reply.get({ name: threadId })
        await opcore.ready()
        await input.ready()
        const thread = await this.buildThread(opcore, input)
        this.emit("joinedThread", threadId, thread)
        return thread
    }

    async newThread(): Promise<string> {
        const opcore = this.stores.op.get(
            { name: `${getThreadEpoch()}`})
        await opcore.ready()
        await this.buildThread(opcore, opcore)
        const threadId = opcore.key.toString('hex')
        return threadId
    }

    async _getUpdatedView(threadId: string) {
        const view = this.threads[threadId].base.view

        await view.ready()
        await view.update()
        return view
    }

    async newMessage(threadId: string, post: IPost) {
        if (!this.threads[threadId]) {
            return false
        }
        await this._getUpdatedView(threadId)
        await this.threads[threadId].base.append(JSON.stringify(post))

        return this.threads[threadId].base.localInput.key.toString('hex')
    }

    async getThreadContent(threadId: string, start?: number, end?: number) {
        if (!this.threads[threadId]) return undefined

        const view = this.threads[threadId].base.view

        await view.ready()
        await view.update()

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

    async getThreadLength(threadId: string) {
        const view = this.threads[threadId].base.view

        await view.ready()
        await view.update()
        return view.length
    }

    getThreadList() {
        return this.threadsList
    }

    async getCatalog() {
        const catalog: {page: number, threads: IPost[]}[] = []
        const threads = []
        for (let threadId of this.threadsList) {
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
}