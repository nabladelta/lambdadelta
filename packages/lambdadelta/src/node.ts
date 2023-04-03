import Corestore from 'corestore'
import Hyperswarm, { PeerInfo } from 'hyperswarm'
import crypto from 'crypto'
import ram from 'random-access-memory'
import path from 'path'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { RLN, deserializeProof, RLNGFullProof, serializeProof } from 'bernkastel-rln'
import { Lambdadelta, generateMemberCID, verifyMemberCIDProof } from 'lambdadelta'
import { getMemberCIDEpoch } from './utils'
import { Logger } from "tslog"

export const mainLogger = new Logger({
    prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t[{{name}}]\t",
})
const log = mainLogger.getSubLogger({name: 'node'})
const DATA_FOLDER = 'data'
const GROUP_FILE = 'testGroup.json'
const PROTO_VERSION = '1'

interface NodePeerData {
    connection: {
        stream: NoiseSecretStream
        topicAnnouncer: any
        handshakeSender: any
        coreAnnouncer: any
    }
    topics: Set<string>
    coresSent: Map<string, [string, string]>
    coresReceived: Map<string, [string, string]>
    memberCID?: string
}

export class LDNode {
    private secret: string
    public corestore: any
    public topicFeeds: Map<string, Lambdadelta> // Topic => feed
    private peers: Map<string, NodePeerData>
    public swarm: Hyperswarm
    private rln?: RLN

    constructor(secret: string, memstore?: boolean, swarmOpts?: any) {
        this.secret = secret
        this.topicFeeds = new Map()
        this.peers = new Map()

        const secretDigest = crypto.createHash('sha256')
            .update('USR>' + secret)
            .digest('hex')
        this.corestore = new Corestore(
            memstore ? ram : path.join(DATA_FOLDER, 'users', secretDigest),
            {primaryKey: Buffer.from(this.secret)})

        const swarmKeySeed = crypto.createHash('sha256')
            .update('DHTKEY' + secret)
            .update(getMemberCIDEpoch().toString())
            .digest()
        this.swarm = new Hyperswarm({ seed: swarmKeySeed, ...swarmOpts})
    }

    async destroy() {
        await this.swarm.destroy()
        await this.corestore.close()
    }

    async init() {
        this.rln = await RLN.load(this.secret, GROUP_FILE)

        await this.corestore.ready()
        this.swarm.on('connection', (socket: NoiseSecretStream, info: PeerInfo) => {
            log.info('Found peer', info.publicKey.toString('hex').slice(-6))

            this.handlePeer(socket)

            socket.once('close', () => {
                log.info('Peer left', info.publicKey.toString('hex').slice(-6))
            })
        })
    }

    private async handlePeer(stream: NoiseSecretStream) {
        // Always replicate corestore
        this.corestore.replicate(stream)

        const self = this
        const mux = Protomux.from(stream)

        const channel = mux.createChannel({
            protocol: 'ldd-topic-rep'
        })
        channel.open()

        const peerID = stream.remotePublicKey.toString('hex')

        const handshakeSender = channel.addMessage({
            encoding: c.buffer,
            async onmessage(proof: Buffer, _: any) { await self.recvHandshake(peerID, proof) }
        })

        const topicAnnouncer = channel.addMessage({
            encoding: c.array(c.string),
            async onmessage(topics: string[], _: any) { await self.recvTopics(peerID, topics) }
        })

        const coreAnnouncer = channel.addMessage({
            encoding: c.array(c.array(c.string)),
            async onmessage(cores: string[][], _: any) { await self.recvCores(peerID, cores) }
        })

        this.peers.set(peerID, {
                    topics: new Set(),
                    connection: {stream, topicAnnouncer, handshakeSender, coreAnnouncer},
                    coresSent: new Map(),
                    coresReceived: new Map()
                })
        this.sendHandshake(peerID)
    }

    private async recvCores(peerID: string, cores: string[][]) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            throw new Error("Unknown peer")
        }
        if (!peer.memberCID) {
            log.error(`Received cores from peer ${peerID} before handshake`)
            throw new Error("Cannot received cores from peer without CID")
        }
        let added = 0
        for (let [topic, feedCore, drive] of cores) {
            if (!peer.topics.has(topic)) {
                log.warn(`Received cores for unexpected topic ${topic} from peer ${peerID.slice(-8)}`)
                continue
            }
            const previous = peer.coresReceived.get(topic)
            peer.coresReceived.set(topic, [feedCore, drive])
            const feed = this.topicFeeds.get(topic)
            if (!previous && feed) { // Add peer if this is the first core we receive
                await feed.addPeer(peer.memberCID, feedCore, drive)
                added++
            }
        }
        log.info(`Received cores for ${cores.length} topics from peer ${peerID.slice(-8)} (Added: ${added})`)
    }

    private async sendCores(peerID: string) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            throw new Error("Unknown peer")
        }
        if (!peer.memberCID) {
            throw new Error("Cannot send cores to peer without CID")
        }

        const cores: string[][] = []
        for (let topic of peer.topics) {
            const feed = this.topicFeeds.get(topic)
            if (!feed) continue
            const [feedCore, drive] = feed.getCoreIDs()
            cores.push([topic, feedCore, drive])
        }
        await peer.connection.coreAnnouncer.send(cores)
    }

    private async recvHandshake(peerID: string, proofBuf: Buffer) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            log.error(`Received handshake from unknown peer ${peerID}`)
            throw new Error("Unknown peer")
        }
        if (peer.memberCID) {
            log.error(`Received duplicate handshake from ${peerID}`)
            throw new Error("Duplicate handshake")
        }
        const proof = deserializeProof(proofBuf)
        const result = await verifyMemberCIDProof(proof, peer.connection.stream, this.rln!)
        if (!result) {
            log.error(`Received invalid MemberCID from ${peerID.slice(-8)}`)
            throw new Error("Invalid handshake")
        }

        log.info(`Received MemberCID from ${peerID.slice(-8)}`)
        peer.memberCID = proof.signal
        this.peers.set(peerID, peer)

        await this.announceTopics(peerID)
    }

    private async sendHandshake(peerID: string) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            throw new Error("Unknown peer")
        }
        log.info(`Sending MemberCID to ${peerID.slice(-8)}`)
        const proof = await generateMemberCID(this.secret, peer.connection.stream, this.rln!)
        const proofBuf = serializeProof(proof)
        await peer.connection.handshakeSender.send(proofBuf)
    }

    private async recvTopics(peerID: string, topicComms: string[]) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            throw new Error("Unknown peer")
        }
        if (!peer.memberCID) {
            log.error(`Received topics from peer ${peerID} before handshake`)
            return
        }

        const ownTopicCommitments = this.getTopicCommitments(peer.connection.stream.publicKey)
        let newTopicsAmount = 0
        const newTopicList: Set<string> = new Set()
        for (let tc of topicComms) {
            // We search for the topic corresponding to this commitment
            const feed = ownTopicCommitments.get(tc)
            if (!feed) continue

            newTopicList.add(feed.topic)

            if (!peer.topics.has(feed.topic)) {
                peer.topics.add(feed.topic)
                newTopicsAmount++
            }
        }
        let deletedTopicsAmount = 0
        // Check which topics are no longer relevant to this peer
        for (let topic of peer.topics) {
            if (!newTopicList.has(topic)) { // Previously subscribed topic is no longer
                peer.topics.delete(topic)
                deletedTopicsAmount++
                const feed = this.topicFeeds.get(topic)
                if (feed) {
                    await feed.removePeer(peer.memberCID)
                }
            }
        }
        this.peers.set(peerID, peer)
        log.info(`Received ${topicComms.length} topic commitments from ${peerID.slice(-6)} (Added: ${newTopicsAmount} Removed: ${deletedTopicsAmount})`)

        if (newTopicsAmount > 0) {
            // If we got any new topics, we need to reannounce ours to the peer
            // Otherwise they will not know to attach us for them on the other side
            await this.announceTopics(peerID)
            await this.sendCores(peerID)
        }
    }

    private getTopicCommitments(key: Buffer) {
        const comms: Map<string, Lambdadelta> = new Map()
        for (let [topic, board] of this.topicFeeds) {
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

    private async announceTopics(peerID: string) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            throw new Error("Unknown peer")
        }
        const peerPubKey = peer.connection.stream.remotePublicKey
        const comms = Array.from((this.getTopicCommitments(peerPubKey)).keys())

        log.info(`Announcing all ${comms.length} topic commitments to ${peerID.slice(-6)}`)
        await peer.connection.topicAnnouncer.send(comms)
    }

    private async announceTopicsToAll() {
        await Promise.all(Array.from(this.peers.keys()).map(peerID => this.announceTopics(peerID)))
    }

    private topicHash(topic: string) {
        return crypto
            .createHash('sha256')
            .update(PROTO_VERSION)
            .update("LDD>"+topic).digest()
    }

    private async _join(topic: string) {
        if (topic.length == 0) return false
        if (this.topicFeeds.has(topic)) return false

        const feed = new Lambdadelta(
            topic,
            this.corestore,
            this.rln!
        )
        this.topicFeeds.set(topic, feed)
        this.swarm.join(this.topicHash(topic))
    }

    private async _leave(topic: string) {
        const feed = this.topicFeeds.get(topic)
        if (!feed) return false

        await feed.close()
        this.topicFeeds.delete(topic)
        for (let [_, peer] of this.peers) {
            peer.topics.delete(topic)
        }
        await this.swarm.leave(this.topicHash(topic))
    }

    public async join(topics: string[]) {
        await Promise.all(topics.map(topic => this._join(topic)))
        await this.swarm.flush()
        await this.announceTopicsToAll()
    }

    public async leave(topics: string[]) {
        await Promise.all(topics.map(topic => this._leave(topic)))
        await this.swarm.flush()
        await this.announceTopicsToAll()
    }
}