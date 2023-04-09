import Corestore from 'corestore'
import Hyperswarm, { PeerInfo } from 'hyperswarm'
import crypto from 'crypto'
import ram from 'random-access-memory'
import path from 'path'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { RLN, deserializeProof, RLNGFullProof, serializeProof } from 'bernkastel-rln'
import { Lambdadelta } from './lambdadelta'
import { errorHandler, getMemberCIDEpoch } from './utils'
import { Logger } from "tslog"
import { generateMemberCID, verifyMemberCIDProof } from './membercid'
import Hyperbee from 'hyperbee'

const DATA_FOLDER = 'data'
const GROUP_FILE = 'testGroup.json'

interface NodePeerData {
    connection: {
        stream: NoiseSecretStream
        handshakeSender: any
    }
    topicsBee?: Hyperbee<string, Buffer>,
    topics: Set<string>
    memberCID?: string
    localMemberCID?: string
}

export class LDNode {
    public static appID = "LDD"
    public static protocolVersion = "1"

    private secret: string
    private groupID: string
    public corestore: Corestore
    public peerId: string
    private log: Logger<unknown>
    public topicFeeds: Map<string, Lambdadelta> // Topic => feed
    private peers: Map<string, NodePeerData>
    private memberCIDs: Map<string, string> // MCID => peerID
    public swarm: Hyperswarm
    private rln?: RLN
    private topicsBee: Hyperbee<string, Buffer>
    private pendingHandshakes: Map<string, Promise<boolean>>
    private _ready: Promise<void>
    constructor(secret: string, groupID: string, {memstore, swarmOpts, logger}: {memstore?: boolean, swarmOpts?: any, logger?: Logger<unknown>}) {
        this.secret = secret
        this.groupID = groupID
        this.topicFeeds = new Map()
        this.peers = new Map()
        this.memberCIDs = new Map()
        this.pendingHandshakes = new Map()

        this.log = logger || new Logger({
            prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t[{{name}}]\t",
        })

        this.peerId = ''

        const secretDigest = crypto.createHash('sha256')
            .update('USR>' + secret)
            .digest('hex')
        this.corestore = new Corestore(
            memstore ? ram : path.join(DATA_FOLDER, 'users', secretDigest),
            {primaryKey: Buffer.from(this.secret)})
        
        this.topicsBee = new Hyperbee(this.corestore.get({name: 'topics'}), {
            valueEncoding: 'binary',
            keyEncoding: 'utf-8'
        })

        const swarmKeySeed = crypto.createHash('sha256')
            .update('DHTKEY')
            .update(secret)
            .update(getMemberCIDEpoch().toString())
            .digest()
        this.swarm = new Hyperswarm({ seed: swarmKeySeed, ...swarmOpts})
        this.swarm.on('connection', this.onConnection.bind(this))
        const rln = RLN.load(this.secret, GROUP_FILE)
        this._ready = (async () => { this.rln = await rln })()
    }

    async destroy() {
        await this.swarm.destroy()
        await this.corestore.close()
        await this.topicsBee.close()
    }

    async ready() {
        await this._ready
        await this.corestore.ready()
        await this.topicsBee.ready()
    }

    private getPeer(peerID: string) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            throw new Error("Unknown peer")
        }
        return peer
    }

    public getPeerList() {
        const peers = []
        for (const [peerID, peer] of this.peers) {
            if (peer.memberCID) {
                peers.push(peerID)
            }
        }
        return peers
    }

    public peerHasTopic(peerID: string, topic: string) {
        return this.peers.get(peerID)?.topics.has(this.topicHash(topic, 'index').toString('hex'))
    }

    public getTopic(topic: string) {
        return this.topicFeeds.get(this.topicHash(topic, 'index').toString('hex'))
    }

    async onConnection(stream: NoiseSecretStream, info: PeerInfo) {
        this.log.info('Found peer', info.publicKey.toString('hex').slice(-6))
        this.peerId = stream.publicKey.toString('hex')
        this.handlePeer(stream)

        stream.once('close', async () => {
            const peerID = stream.remotePublicKey.toString('hex')
            this.log.info('Peer left', info.publicKey.toString('hex').slice(-6))
            await this.removePeer(peerID)
        })
    }

    private handlePeer(stream: NoiseSecretStream) {
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
            encoding: c.array(c.buffer),
            async onmessage(proof: Buffer[], _: any) { await errorHandler(self.recvHandshake(peerID, proof), self.log) }})

        this.peers.set(peerID, { topics: new Set(), connection: {stream, handshakeSender} })
        this.sendHandshake(peerID)
    }

    private async removePeer(peerID: string) {
        const peer = this.getPeer(peerID)
        this.peers.delete(peerID)

        const removePromises: Promise<boolean>[] = []
        for (const topicHash of peer.topics) {
            const feed = this.topicFeeds.get(topicHash)
            if (!feed) {
                continue
            }
            peer.topicsBee?.close()
            removePromises.push(feed.removePeer(peer.memberCID!))
        }
        await Promise.all(removePromises)
    }

    private async sendHandshake(peerID: string) {
        const peer = this.getPeer(peerID)
        this.log.info(`Sending MemberCID to ${peerID.slice(-6)}`)

        const proof = await generateMemberCID(this.secret, peer.connection.stream, this.rln!)
        const proofBuf = serializeProof(proof)
        const topicsCoreKey: Buffer = this.topicsBee.core.key!
        peer.localMemberCID = proof.signal

        await peer.connection.handshakeSender.send([proofBuf, topicsCoreKey])
    }

    private async recvHandshake(peerID: string, proofBuf: Buffer[]) {
        if (this.pendingHandshakes.has(peerID)) throw new Error("Send double handshake")

        const handshakePromise = this.handleHandshake(peerID, proofBuf)
        this.pendingHandshakes.set(peerID, handshakePromise)
        await handshakePromise
        this.pendingHandshakes.delete(peerID)
    }

    private async handleHandshake(peerID: string, proofBuf: Buffer[]) {
        console.error("HANDLE HANDSHAKE")
        const peer = this.getPeer(peerID)

        if (peer.memberCID) {
            this.log.error(`Received duplicate handshake from ${peerID.slice(-6)}`)
            throw new Error("Duplicate handshake")
        }
        const proof = deserializeProof(proofBuf[0])
        if (this.memberCIDs.has(proof.signal)) {
            this.log.error(`Received duplicate MemberCID from ${peerID.slice(-6)}`)
            throw new Error("Invalid handshake")
        }
        const result = await verifyMemberCIDProof(proof, peer.connection.stream, this.rln!)
        if (!result) {
            this.log.error(`Received invalid MemberCID from ${peerID.slice(-6)}`)
            throw new Error("Invalid handshake")
        }

        this.log.info(`Received MemberCID from ${peerID.slice(-6)}`)

        peer.memberCID = proof.signal
        const beeCore = this.corestore.get(proofBuf[1])
        if (!await Hyperbee.isHyperbee(beeCore)) {
            throw new Error("Invalid hyperbee")
        }
        peer.topicsBee = new Hyperbee(beeCore, {
            valueEncoding: 'binary',
            keyEncoding: 'utf-8'
        })

        this.memberCIDs.set(peer.memberCID, peerID)
        await this.syncTopics(peerID)
        return true
    }

    private async syncTopics(peerID: string) {
        const addPromises: Promise<boolean>[] = []
        for (const [topicHash, feed] of this.topicFeeds) {
            addPromises.push(this.syncTopicData(peerID, topicHash, feed))
        }
        // this.continuousTopicSync(peerID)
        const nAdded = (await Promise.all(addPromises)).filter(r => r).length
        this.log.info(`Added ${nAdded} topic(s) from ${peerID.slice(-6)}`)
    }

    private async continuousTopicSync(peerID: string) {
        const peer = this.getPeer(peerID)
        for await (const { key, type, value } of peer.topicsBee!
                .createHistoryStream({ gte: -1, live: true })) {

            this.log.warn(`Update: ${type}: ${key} -> ${value}`)

            const feed = this.topicFeeds.get(key)
            if (!feed) continue

            if (type === 'del') {
                peer.topics.delete(key)
                feed.removePeer(peerID)
            }

            if (type === 'put') {
                this.syncTopicData(peerID, key, feed)
            }
        }
    }

    private async syncTopicData(peerID: string, topicHash: string, feed: Lambdadelta) {
        const peer = this.getPeer(peerID)
        const result = await peer.topicsBee?.get(topicHash)
        if (!result) {
            return false
        }
        peer.topics.add(topicHash)
        const { feedCore, drive } = JSON.parse(result.value.toString())
        return feed.addPeer(peerID, feedCore, drive)
    }

    private async addPeersToTopic(topicHash: string, feed: Lambdadelta) {
        const addPromises: Promise<boolean>[] = []
        for (const [peerID, peer] of this.peers) {
            addPromises.push(this.syncTopicData(peerID, topicHash, feed))
        }
        const nAdded = (await Promise.all(addPromises)).filter(r => r).length
        this.log.info(`Added a topic from ${nAdded} peers`)
    }

    private async _join(topic: string) {
        if (topic.length == 0) return false
        if (this.topicFeeds.has(topic)) return false

        const feed = new Lambdadelta(
            topic,
            this.corestore,
            this.rln!
        )
        await feed.ready()

        const topicHash = this.topicHash(topic, 'index').toString('hex')
        this.topicFeeds.set(topicHash, feed)
        this.swarm.join(this.topicHash(topic, "DHT"))
    }

    private async publishTopic(topic: string) {
        const feed = this.getTopic(topic)
        if (!feed) throw new Error("Publishing inexistent topic")
        const topicHash = this.topicHash(topic, 'index').toString('hex')

        // Make sure we are synced with all peers before publishing our topic cores
        await this.addPeersToTopic(topicHash, feed)

        const [feedCore, drive] = feed.getCoreIDs()
        const topicData = {feedCore, drive}
        await this.topicsBee.put(
            topicHash,
            Buffer.from(JSON.stringify(topicData))
        )
    }

    private async _leave(topic: string) {
        const feed = this.topicFeeds.get(topic)
        if (!feed) return false

        await feed.close()
        this.topicFeeds.delete(topic)
        for (let [_, peer] of this.peers) {
            peer.topics.delete(topic)
        }
        await this.topicsBee.del(this.topicHash(topic, 'index').toString('hex'))
        await this.swarm.leave(this.topicHash(topic, "DHT"))
    }

    public async join(topics: string[]) {
        await Promise.all(topics.map(topic => this._join(topic)))
        await this.swarm.flush()
        await Promise.all(this.pendingHandshakes.values())
        await Promise.all(topics.map(topic => this.publishTopic(topic)))
    }

    public async leave(topics: string[]) {
        await Promise.all(topics.map(topic => this._leave(topic)))
        await this.swarm.flush()
    }

    private topicHash(topic: string, namespace: string) {
        return crypto
            .createHash('sha256')
            .update(LDNode.appID)
            .update(LDNode.protocolVersion)
            .update(this.groupID)
            .update(namespace)
            .update(topic).digest()
    }
}