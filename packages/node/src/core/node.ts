import Corestore from 'corestore'
import Hyperswarm, { PeerInfo } from 'hyperswarm'
import crypto from 'crypto'
import ram from 'random-access-memory'
import { BulletinBoard } from './board'
import { Filestore } from './filestore'
import path from 'path'
import { DATA_FOLDER, GROUP_FILE } from '../constants'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { mainLogger } from './logger'
import { Delta, deserializeProof, Lambda, RLNGFullProof, serializeProof } from 'bernkastel-rln'
import { generateMemberCID, verifyMemberCIDProof } from './membercid'
import { getMemberCIDEpoch } from './utils/utils'

const log = mainLogger.getSubLogger({name: 'node'})

export class BBNode {
    private secret: string
    private secretDigest: string
    public corestore: any
    public boards: Map<string, BulletinBoard>
    public swarm: Hyperswarm
    public filestore: Filestore
    private lambda?: Lambda
    private delta?: Delta

    constructor(secret: string, memstore?: boolean, swarmOpts?: any) {
        this.secret = secret
        this.secretDigest = crypto.createHash('sha256').update('USR>' + secret).digest('hex')
        this.corestore = new Corestore(
            memstore ? ram : path.join(DATA_FOLDER, 'users', this.secretDigest), 
            {primaryKey: Buffer.from(this.secret)})
        this.boards = new Map()

        const swarmKeySeed = crypto.createHash('sha256').update('DHTKEY' + secret).update(getMemberCIDEpoch().toString()).digest()
        this.swarm = new Hyperswarm({ seed: swarmKeySeed, ...swarmOpts})
        this.filestore = new Filestore(this.corestore)
    }

    async destroy() {
        await this.swarm.destroy()
        await this.corestore.close()
    }

    async init() {
        const [lambda, delta] = await Lambda.load(this.secret, GROUP_FILE)
        this.lambda = lambda
        this.delta = delta

        await this.corestore.ready()
        this.swarm.on('connection', (socket: NoiseSecretStream, info: PeerInfo) => {
            log.info('Found peer', info.publicKey.toString('hex').slice(-6))

            this.handlePeer(socket)

            socket.once('close', () => {
                log.info('Peer left', info.publicKey.toString('hex').slice(-6))
            })
        })

        for (let [topic, _] of this.boards) {
            const htopic = crypto.createHash('sha256').update('1').update("BBS>"+topic).digest()
            this.swarm.join(htopic)
        }
        await this.swarm.flush()
    }

    private async handlePeer(stream: NoiseSecretStream) {
        // Always replicate corestore
        this.corestore.replicate(stream)

        const self = this
        const mux = Protomux.from(stream)

        const channel = mux.createChannel({
            protocol: 'bbs-topic-rep'
        })
        channel.open()

        const boardAnnouncer = channel.addMessage({
            encoding: c.array(c.buffer),
            async onmessage(topics: Buffer[], _: any) { await self.recv(topics, stream) }
        })

        const handshakeSender = channel.addMessage({
            encoding: c.buffer,
            async onmessage(proof: Buffer, _: any) { await self.handshakeRecv(proof, stream, boardAnnouncer) }
        })
        
        const streamData = {stream, boardAnnouncer, handshakeSender}
        this.handshakeSend(streamData)
    }

    private async handshakeRecv(proofBuf: Buffer, stream: NoiseSecretStream, boardAnnouncer: any) {
        const proof = deserializeProof(proofBuf)
        const result = await verifyMemberCIDProof(proof, stream, this.lambda!)
        log.info(`Received MemberCID from ${stream.remotePublicKey.toString('hex').slice(-8)} (Valid: ${result})`)
        if (result) await this.announceBoards({stream, boardAnnouncer})
    }

    private async handshakeSend(streamData: {stream: NoiseSecretStream, boardAnnouncer: any, handshakeSender: any}) {
        log.info(`Sending MemberCID to ${streamData.stream.remotePublicKey.toString('hex').slice(-8)}`)
        const proof = await generateMemberCID(this.secret, streamData.stream, this.delta!)
        const proofBuf = serializeProof(proof)
        await streamData.handshakeSender.send(proofBuf)
    }

    private async getTopicCommitments(key: Buffer) {
        const comms: Map<string, BulletinBoard> = new Map()
        for (let [topic, board] of this.boards) {
            // Hash of own pubkey + topic is our commitment
            // Is used to verify that other node knows the topic without revealing it to them
            const topicCommitment = crypto.createHash('sha256')
                .update(key)
                .update(topic)
                .digest()
            comms.set(topicCommitment.toString('hex'), board)
        }
        return comms
    }

    private async recv(topicComms: Buffer[], stream: NoiseSecretStream) {
        log.info(`Received ${topicComms.length} topic commitments from ${stream.remotePublicKey.toString('hex').slice(-6)}`)
        const ownTopicCommitments = await this.getTopicCommitments(stream.publicKey)
        for (let tc of topicComms) {
            // We search for the topic corresponding to this commitment
            const board = ownTopicCommitments.get(tc.toString('hex'))
            if (board) {
                board.attachStream(stream)
            }
        }
    }

    private async announceBoards({ boardAnnouncer, stream }: {stream: NoiseSecretStream, boardAnnouncer: any}) {
        const tComms = []
        for (let [topic, _] of this.boards) {
            // We compute a hash of peerPubkey + topic to send to the peer
            // We don't want to reveal our topics to peers unless they already know them
            const topicCommitment = crypto.createHash('sha256')
                .update(stream.remotePublicKey)
                .update(topic)
                .digest()
            tComms.push(topicCommitment)
        }
        log.info(`Announcing all ${tComms.length} topic commitments to ${stream.remotePublicKey.toString('hex').slice(-6)}`)
        await boardAnnouncer.send(tComms)
    }

    private async _join(topic: string) {
        if (topic.length == 0) return
        if (this.boards.has(topic)) return

        const board = new BulletinBoard(topic, this.corestore.namespace(topic))
        await board.ready()
        this.boards.set(topic, board)
    }

    public async join(topics: string[]) {
        await Promise.all(topics.map(topic => this._join(topic)))
    }
}