import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import ram from 'random-access-memory'
import { BulletinBoard } from './board'
import { Filestore } from './filestore'


export class BBNode {
    secret: string
    secretDigest: string
    corestore: any
    boards: Map<string, BulletinBoard>
    _streams: Set<any>
    swarm: Hyperswarm
    filestore: Filestore
    _initSwarmPromise: Promise<void>

    constructor(secret: string, memstore?: boolean, swarmOpts?: any) {
        this.secret = secret
        this.secretDigest = crypto.createHash('sha256').update(secret).digest('hex')
        this.corestore = new Corestore(
            memstore ? ram : `./data/${this.secretDigest}`, 
            {primaryKey: Buffer.from(this.secret)})
        this.boards = new Map()
        this._streams = new Set()
        this.swarm = new Hyperswarm(swarmOpts)
        this.filestore = new Filestore(this.corestore)
        this._initSwarmPromise = this.initSwarm()
    }
    async ready() {
        await this.corestore.ready()
        await this._initSwarmPromise
    }
    async destroy() {
        await this.swarm.destroy()
        await this.corestore.close()
    }

    async initSwarm() {
        this.swarm.on('connection', (socket, info) => {
            console.log('found peer', info.publicKey.toString('hex').slice(-6))
            
            this.corestore.replicate(socket)
            this._streams.add(socket)
            this.attachStreamToBoards(socket)

            socket.once('close', () => {
                this._streams.delete(socket)
                console.log('Remote peer left')
            })
        })
    }

    async join(topic: string) {
        const board = new BulletinBoard(topic, this.corestore.namespace(topic))
        await board.ready()
        this._streams.forEach(s => {
            board.attachStream(s)
        })
        this.boards.set(topic, board)
        const htopic = crypto.createHash('sha256').update("BBS>"+topic).digest()
        this.swarm.join(htopic)
        await this.swarm.flush()
    }

    async attachStreamToBoards(stream: any) {
        this.boards.forEach((board, _topic)=> {
            board.attachStream(stream)
        })
    }
}