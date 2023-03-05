import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Autobase from 'autobase'
import crypto from 'crypto'
import b4a from 'b4a'
import ram from 'random-access-memory'
import Protomux from 'protomux'
import c from 'compact-encoding'

import { Thread } from './thread'
import { difference, getThreadEpoch } from './utils/utils'
import { BBNode } from './node'


export class BulletinBoard {
    corestore: any
    stores: {
        op: any
        reply: any
        outputs: any
    }
    threadsList: string[]
    threads: any
    _streams: Set<{stream: any, threadAnnouncer: any}>
    swarm: any
    topic: string
    channel: any

    constructor(topic: string, corestore: any) {
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

    async attachStreamToThreads(stream: any) {
        this.threadsList.forEach((tid: string) => {
            this.threads[tid].attachStream(stream)
        })
    }

    async attachStream(stream: any) {
        const self = this
        const mux = Protomux.from(stream)

        const channel = mux.createChannel({
            protocol: 'bbs-board-rep',
            id: Buffer.from(this.topic),
            unique: false
        })
        channel.open()

        const threadAnnouncer = channel.addMessage({
            encoding: c.array(c.string),
            async onmessage (msgs: string[], session: any) {
              const allowedKeys = msgs.filter((msg: string) => self.allow(msg, session))
              console.log("session", session)
              if (allowedKeys.length) {
                // Find new threads
                const newKeys = difference(allowedKeys, self.threadsList)
                if (newKeys.size > 0) {
                  await self._addThreads(newKeys)
                  await self.announceAllThreadsToAll()
                }
              }
            }
        })
        const streamData = {stream, threadAnnouncer}
        this._streams.add(streamData)
        this.announceAllThreads(streamData)

        this.attachStreamToThreads(stream)
        stream.once('close', () => {
            this._streams.delete(streamData)
        })
    }

    async announceAllThreads(streamData: {stream: any, threadAnnouncer: any}) {
        if (this.threadsList.length) await streamData.threadAnnouncer.send(this.threadsList)
    }

    async announceThreadsToAll(threadIds: string[] | Set<string>) {
        if (!this.threadsList.length) return
        for (let streamData of this._streams){
            await streamData.threadAnnouncer.send(threadIds)
        }
    }

    async announceAllThreadsToAll() {
        for (let streamData of this._streams){
            await this.announceAllThreads(streamData)
        }
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

        const base = new Autobase({
            inputs: opcore == inputCore ? [opcore] : [opcore,inputCore],
            localInput: inputCore,
            localOutput: output
        })

        const manager = new Thread(
            threadId,
            base,
            this.corestore.get.bind(this.corestore),
            this.corestore.storage
        )
        
        this.threadsList.push(threadId)
        this.threads[threadId] = manager
        this._streams.forEach((s) => {
            manager.attachStream(s)
        })
        await manager.ready()
        await manager.base.start({
            async apply(batch: OutputNode[], clocks: any, change: any, view: any) {
                const pBatch = batch.map((node) => {
                    const post: IPost = JSON.parse(node.value.toString())
                    post.no = node.id + '>' + node.seq
                    console.log(post)
                    return Buffer.from(JSON.stringify(post), 'utf-8')
                })
                await view.append(pBatch)
            }
        })
        await manager.base.view.update()
        return manager
    }

    async joinThread(threadId: string) {
        const opcore = this.corestore.get(b4a.from(threadId, 'hex'))
        const input = this.stores.reply.get({ name: threadId })
        await opcore.ready()
        await input.ready()
        return await this.buildThread(opcore, input)
    }

    async newThread(): Promise<string> {
        const opcore = this.stores.op.get(
            { name: `${getThreadEpoch()}`})
        await opcore.ready()
        await this.buildThread(opcore, opcore)
        const threadId = opcore.key.toString('hex')
        // Announce new thread
        await this.announceThreadsToAll([threadId])
        return threadId
    }

    async newMessage(threadId: string, post: IPost) {
        console.log(threadId)
        if (!this.threads[threadId]) {
            await this.joinThread(threadId)
        }
        await this.threads[threadId].base.append(JSON.stringify(post))
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
            thread.posts[0].replies = view.length
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