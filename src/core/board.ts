import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Autobase from 'autobase'
import crypto from 'crypto'
import b4a from 'b4a'
import ram from 'random-access-memory'
import Protomux from 'protomux'
import c from 'compact-encoding'

import { Thread } from './thread.js'

function getTimestampInSeconds () {
    return Math.floor(Date.now() / 1000)
}

// Rounded to 1000 seconds. This is the Thread-Epoch
function getThreadEpoch () {
    return Math.floor(Date.now() / 1000000)
}

export class BulletinBoard {
    secret: string
    secretDigest: string
    corestore: any
    stores: {
        op: any
        reply: any
        outputs: any
    }
    threadsList: string[]
    threads: any
    _streams: any[]
    swarm: any
    topic: string
    _initSwarmPromise: Promise<void>
    channel: any

    constructor(secret: string, topic: string, memstore?: boolean) {
        this.secret = secret
        this.topic = topic
        this.secretDigest = crypto.createHash('sha256').update(secret).digest('hex')
        this.corestore = new Corestore(
            memstore ? ram : `./data/${this.secretDigest}-${topic}`, 
            {primaryKey: Buffer.from(this.secret)})
        this.stores = {
            op: this.corestore.namespace(topic).namespace('op'),
            reply: this.corestore.namespace(topic).namespace('reply'),
            outputs: this.corestore.namespace(topic).namespace('outputs')
        }
        this.threadsList = []
        this._streams = []
        this.threads = {}
        this._initSwarmPromise = this.initSwarm()
    }
    async initSwarm() {
        await this.corestore.ready()
        this.swarm = new Hyperswarm()
        this.swarm.on('connection', (conn: any, info: any) => {
            console.log('found peer', info.publicKey.toString('hex').slice(-6))
            const stream = this.corestore.replicate(conn)
            this._streams.push(stream)
            this.attachStreamToThreads(stream)
            stream.once('close', () => {
                this._streams = this._streams.filter((s) => s != stream)
            })
            conn.on('close', function () {
                console.log('Remote peer fully left')
            })
        })
        const topic = crypto.createHash('sha256').update(this.topic).digest()
        this.swarm.join(topic)
    }

    async ready() {
        await this._initSwarmPromise
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
            protocol: 'bulletin-board',
            id: Buffer.from(this.topic),
            unique: false
        })
        channel.open()

        const inputAnnouncer = channel.addMessage({
        encoding: c.array(c.string),
            async onmessage (msgs: any, session: any) {

            }
        })
    }

    async buildThread(opcore: any, inputCore: any) {
        const threadId = opcore.key.toString('hex')
        const output = this.stores.outputs.get(
            { 
                name: threadId
            })
        await output.ready()

        const base = new Autobase({
            inputs: opcore == inputCore ? [opcore] : [opcore,inputCore],
            localInput: inputCore,
            localOutput: output
        })

        const manager = new Thread(
            threadId,
            base,
            () => true,
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
            async apply(batch: any) {
                batch = batch.map(({ value }: any) => Buffer.from(value.toString('utf-8').toUpperCase(), 'utf-8'))
                await manager.base.view.append(batch)
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
        return opcore.key.toString('hex')
    }

    async newMessage(threadId: string, msg: string) {
        console.log(threadId)
        if (!this.threads[threadId]) {
            await this.joinThread(threadId)
        }
        await this.threads[threadId].base.append(msg)
    }

    async getThreadCausalStream(threadId: string) {
        const view = this.threads[threadId].base.view

        await view.ready()
        await view.update()

        const messages: string[] = []
        for (let i=0; i < view.length; i++) {
            const node = await view.get(i)
            messages.push(node.value.toString())
        }
        return messages
    }
}