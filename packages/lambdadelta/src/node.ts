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
    info: PeerInfo
}

export class LDNode {
    public static appID = "LDD"
    public static protocolVersion = "1"

    public peerId: string
    public groupID: string

    private secret: string

    private log: Logger<unknown>
    private swarm: Hyperswarm
    public corestore: Corestore
    private rln?: RLN

    private peers: Map<string, NodePeerData>
    private memberCIDs: Map<string, string> // MCID => peerID

    private topicsBee: Hyperbee<string, Buffer>
    public topicFeeds: Map<string, Lambdadelta> // Topic => feed

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
        this.swarm.on('connection', this.handlePeer.bind(this))
        this.peerId = this.swarm.keyPair.publicKey.toString('hex')
        const rln = RLN.load(this.secret, GROUP_FILE)
        this._ready = (async () => { this.rln = await rln })()
    }

    public async destroy() {
        await this.swarm.destroy()
        await this.corestore.close()
        await this.topicsBee.close()
        for (const [_, peer] of this.peers) {
            await peer.topicsBee?.close()
        }
        for (const [_, feed] of this.topicFeeds) {
            await feed.close()
        }
    }

    public async ready() {
        await this._ready
        await this.corestore.ready()
        await this.topicsBee.ready()
    }

    public async awaitPending() {
        await Promise.all(this.pendingHandshakes.values())
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
        return (await Promise.all(removePromises)).map(r => r).length
    }

    private handlePeer(stream: NoiseSecretStream, info: PeerInfo) {
        this.log.info(`Found peer ${info.publicKey.toString('hex').slice(-6)}`)
        const peerID = stream.remotePublicKey.toString('hex')

        stream.once('close', async () => {
            const peerID = stream.remotePublicKey.toString('hex')
            this.log.info(`Peer ${info.publicKey.toString('hex').slice(-6)} left`)
            await this.removePeer(peerID)
        })

        // Always replicate corestore
        this.corestore.replicate(stream)

        const self = this
        const mux = Protomux.from(stream)

        const channel = mux.createChannel({
            protocol: 'ldd-topic-rep'
        })
        channel.open()


        const handshakeSender = channel.addMessage({
            encoding: c.array(c.buffer),
            async onmessage(proof: Buffer[], _: any) { await errorHandler(self.recvHandshake(peerID, proof), self.log) }})

        this.peers.set(peerID, { info, topics: new Set(), connection: {stream, handshakeSender} })
        this.sendHandshake(peerID)
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
        if (this.pendingHandshakes.has(peerID)) throw new Error("Received double handshake")

        const handshakePromise = this.handleHandshake(peerID, proofBuf)
        this.pendingHandshakes.set(peerID, handshakePromise)
        await handshakePromise
        this.pendingHandshakes.delete(peerID)
    }

    private async handleHandshake(peerID: string, proofBuf: Buffer[]) {
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
        this.log.info(`Accepted MemberCID from ${peerID.slice(-6)}`)
        await this.syncTopics(peerID)
        return true
    }

    private async syncTopics(peerID: string) {
        const addPromises: Promise<boolean>[] = []
        for (const [topicHash, feed] of this.topicFeeds) {
            addPromises.push(this.syncTopicData(peerID, topicHash, feed))
        }
        this.continuousTopicSync(peerID)
        const nAdded = (await Promise.all(addPromises)).filter(r => r).length
        this.log.info(`Added ${nAdded} topic(s) from ${peerID.slice(-6)}`)
    }

    private async continuousTopicSync(peerID: string) {
        const peer = this.getPeer(peerID)
        try {
            for await (const { key, type, value } of peer.topicsBee!
                    .createHistoryStream({ gte: -1, live: true })) {
                const feed = this.topicFeeds.get(key)

                this.log.warn(`Update from ${peerID.slice(-6)}: ${type}: ${feed ? feed.topic : key.slice(-6)} -> ${value}`)

                if (!feed) continue

                if (type === 'del') {
                    peer.topics.delete(key)
                    if (await feed.removePeer(peerID)) {
                        this.log.info(`Removed topic ${feed.topic} from peer ${peerID.slice(-6)}`)
                    }
                }

                if (type === 'put') {
                    if (await this.syncTopicData(peerID, key, feed)) {
                        this.log.info(`Added topic "${feed.topic}" from peer ${peerID.slice(-6)}`)
                    }
                }
            }
        } catch (e) {
            if ((e as any).code === "REQUEST_CANCELLED") {
                this.log.warn(`Closed topic stream for ${peerID.slice(-6)}`)
            } else {
                this.log.error(e)
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
        const topicHash = this.topicHash(topic, 'index').toString('hex')
        const feed = this.topicFeeds.get(topicHash)
        if (!feed) return false

        await feed.close()
        this.topicFeeds.delete(topicHash)
        for (let [_, peer] of this.peers) {
            peer.topics.delete(topicHash)
        }
        await this.topicsBee.del(topicHash)
        await this.swarm.leave(this.topicHash(topic, "DHT"))
        this.log.info(`Left topic ${topic}`)
        return true
    }

    public async join(topics: string[]) {
        this.log.info(`Joining topics: ${topics.join(',')}`)
        await Promise.all(topics.map(topic => this._join(topic)))
        await this.swarm.flush()
        await this.awaitPending()
        await Promise.all(topics.map(topic => this.publishTopic(topic)))
    }

    public async leave(topics: string[]) {
        const nRemoved = (await Promise.all(topics.map(topic => this._leave(topic)))).filter(r => r).length
        this.log.info(`Left ${nRemoved} topic(s)`)
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