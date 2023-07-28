import Corestore from 'corestore'
import Hyperswarm, { PeerInfo } from 'hyperswarm'
import crypto from 'crypto'
import ram from 'random-access-memory'
import path from 'path'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { RLN, deserializeProof, RLNGFullProof, serializeProof, VerificationResult } from '@nabladelta/rln'
import { PayloadVerificationResult, HeaderVerificationError, Lambdadelta, SyncError } from './lambdadelta'
import { decrypt, deserializeTopicData, encrypt, getMemberCIDEpoch, serializeTopicData } from './utils'
import { ISettingsParam, Logger } from "tslog"
import { generateMemberCID, verifyMemberCIDProof } from './membercid'
import Hyperbee from 'hyperbee'
import { TypedEmitter } from 'tiny-typed-emitter'

const DATA_FOLDER = 'data'

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
export enum HandshakeErrorCode {
    DoubleHandshake,
    DuplicateHandshake,
    FailedDeserialization,
    DuplicateMemberCID,
    InvalidProof,
    BannedPeer,
    InvalidHyperbee,
    SyncFailure
}

class HandshakeError extends Error {
    public code: HandshakeErrorCode
    public peerID: string
    constructor(message: string, code: HandshakeErrorCode, peerID: string) {
      super(message)
      Object.setPrototypeOf(this, HandshakeError.prototype)
      this.code = code
      this.peerID = peerID
    }
}

interface LDNodeEvents {
    'handshakeFailure': (code: HandshakeErrorCode, peerID: string) => void
}

export abstract class LDNodeBase<Feed extends Lambdadelta> extends TypedEmitter<LDNodeEvents> {
    public static appID = "LDD"
    public static protocolVersion = "1"

    public peerId: string
    public groupID: string

    private secret: string

    private log: Logger<unknown>
    private swarm: Hyperswarm
    public corestore: Corestore
    protected rln?: RLN

    private peers: Map<string, NodePeerData>
    private memberCIDs: Map<string, string> // MCID => peerID
    private bannedMCIDs: Map<string, VerificationResult | HeaderVerificationError | PayloadVerificationResult | undefined | SyncError>

    private topicsBee: Hyperbee<string, Buffer>
    public topicFeeds: Map<string, Feed> // Topic => feed
    private topicNames: Map<string, string>

    private pendingHandshakes: Map<string, Promise<boolean>>
    private _ready: Promise<void>

    constructor(secret: string, groupID: string, rln: RLN, {memstore, swarmOpts, logger, dataFolder}: {memstore?: boolean, swarmOpts?: any, logger?: Logger<unknown>, dataFolder?: string}) {
        super()
        this.secret = secret
        this.groupID = groupID
        this.topicFeeds = new Map()
        this.peers = new Map()
        this.memberCIDs = new Map()
        this.pendingHandshakes = new Map()
        this.topicNames = new Map()
        this.bannedMCIDs = new Map()

        this.log = logger || new Logger({
            prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t[{{name}}]\t",
        })

        const secretDigest = crypto.createHash('sha256')
            .update('USR>' + secret)
            .digest('hex')
        this.corestore = new Corestore(
            memstore ? ram : path.join(dataFolder || DATA_FOLDER, 'users', secretDigest),
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
        this._ready = (async () => { this.rln = await rln })()
    }

    public getSubLogger(settings?: ISettingsParam<unknown>) {
        return this.log.getSubLogger(settings)
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
    /**
     * Wait for all pending handshakes to be completed
     */
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

    public getTopicList() {
        const topics = []
        for (const [topicHash, _] of this.topicFeeds) {
            const name = this.topicNames.get(topicHash)
            if (name) {
                topics.push(name)
            }
        }
        return topics
    }

    public peerHasTopic(peerID: string, topic: string) {
        return this.peers.get(peerID)?.topics.has(this.topicHash(topic, 'index').toString('hex'))
    }

    public getTopic(topic: string) {
        return this.topicFeeds.get(this.topicHash(topic, 'index').toString('hex'))
    }

    /**
     * Removes a peer form all topics he is connected to
     * @param peerID ID of the peer to remove
     * @returns Number of topics the peer was removed from
     */
    private async removePeer(peerID: string) {
        const peer = this.getPeer(peerID)
        this.peers.delete(peerID)
        this.memberCIDs.delete(peer.memberCID || "")

        const removePromises: Promise<boolean>[] = []
        for (const topicHash of peer.topics) {
            const feed = this.topicFeeds.get(topicHash)
            if (!feed) {
                continue
            }
            peer.topicsBee?.close()
            removePromises.push(feed.removePeer(peerID))
        }
        return (await Promise.all(removePromises)).map(r => r).length
    }

    /**
     * Handles a new peer connection
     * @param stream The encrypted socket used for communication
     * @param info An object containing metadata regarding this peer
     */
    protected handlePeer(stream: NoiseSecretStream, info: PeerInfo) {
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
            async onmessage(proof: Buffer[], _: any) {
                    await self.handleHandshakeError(
                        self.recvHandshake(peerID, proof),
                        stream
                    )
            }})

        this.peers.set(peerID, { info, topics: new Set(), connection: {stream, handshakeSender} })
        this.sendHandshake(peerID)
        return channel
    }

    /**
     * Sends a handshake message to a peer
     * @param peerID ID of the peer to send the handshake to
     */
    private async sendHandshake(peerID: string) {
        const peer = this.getPeer(peerID)
        this.log.info(`Sending MemberCID to ${peerID.slice(-6)}`)

        const proof = await generateMemberCID(this.secret, peer.connection.stream.remotePublicKey, this.rln!)
        const proofBuf = serializeProof(proof)
        const topicsCoreKey: Buffer = this.topicsBee.core.key!
        peer.localMemberCID = proof.signal

        await peer.connection.handshakeSender.send([proofBuf, topicsCoreKey])
    }

    /**
     * Handler for receiveing a handshake from a peer
     * @param peerID ID of the peer
     * @param proofBuf Buffer containing the RLN zkSnarks proof for the handshake
     */
    private async recvHandshake(peerID: string, proofBuf: Buffer[]) {
        if (this.pendingHandshakes.has(peerID)) {
            this.pendingHandshakes.delete(peerID)
            this.emit('handshakeFailure', HandshakeErrorCode.DoubleHandshake, peerID)
            throw new Error("Received double handshake")
        }

        const handshakePromise = this.handleHandshake(peerID, proofBuf)
        this.pendingHandshakes.set(peerID, handshakePromise)
        handshakePromise.catch(() => { this.pendingHandshakes.delete(peerID) })
        await handshakePromise
        this.pendingHandshakes.delete(peerID)
    }

    /**
     * Handles verification of a handshake proof and completion or failure of the handshake
     * Establishes the peer's MemberCID
     * @param peerID ID of the peer
     * @param proofBuf  Buffer containing the RLN zkSnarks proof for the handshake
     * @returns True if successful. Throws an exception otherwise
     */
    private async handleHandshake(peerID: string, proofBuf: Buffer[]) {
        const peer = this.getPeer(peerID)

        if (peer.memberCID) {
            throw new HandshakeError(`Received duplicate handshake from ${peerID.slice(-6)}`, HandshakeErrorCode.DuplicateHandshake, peerID)
        }
        let proof
        try {
            proof = deserializeProof(proofBuf[0])
        } catch {
            throw new HandshakeError(`Failed to deserialize proof from ${peerID.slice(-6)}`, HandshakeErrorCode.FailedDeserialization, peerID)
        }
        if (this.memberCIDs.has(proof.signal)) {
            throw new HandshakeError(`Received duplicate MemberCID from ${peerID.slice(-6)}`, HandshakeErrorCode.DuplicateMemberCID, peerID)
        }
        const result = await verifyMemberCIDProof(proof, peer.connection.stream.publicKey, this.rln!)
        if (!result) {
            throw new HandshakeError(`Received invalid MemberCID from ${peerID.slice(-6)}`, HandshakeErrorCode.InvalidProof, peerID)
        }

        this.log.info(`Received MemberCID from ${peerID.slice(-6)}`)

        peer.memberCID = proof.signal

        if (this.bannedMCIDs.has(peer.memberCID)) {
            peer.info.ban(true)
            peer.connection.stream.destroy()
            throw new HandshakeError("Banned peer", HandshakeErrorCode.BannedPeer, peerID)
        }

        try {
            const beeCore = this.corestore.get(proofBuf[1])
            if (!await Hyperbee.isHyperbee(beeCore)) {
                throw new HandshakeError("Invalid hyperbee", HandshakeErrorCode.InvalidHyperbee, peerID)
            }
            peer.topicsBee = new Hyperbee(beeCore, {
                valueEncoding: 'binary',
                keyEncoding: 'utf-8'
            })
        } catch (e) {
            throw new HandshakeError(`Invalid hyperbee (${(e as any).message})`, HandshakeErrorCode.InvalidHyperbee, peerID)
        }

        this.memberCIDs.set(peer.memberCID, peerID)
        this.log.info(`Accepted MemberCID from ${peerID.slice(-6)}`)
        try {
            await this.syncTopics(peerID)
        } catch (e) {
            throw new HandshakeError((e as any).message, HandshakeErrorCode.SyncFailure, peerID)
        }
        return true
    }

    private async handleHandshakeError(promise: Promise<any>, stream: NoiseSecretStream) {
        try {
            return await promise
        } catch (e) {
            if (e instanceof HandshakeError) {
                this.emit("handshakeFailure", e.code, e.peerID)
            }
            this.log.error(`Failed handshake: ${(e as any).message}`)
            stream.destroy()
        }
    }
    /**
     * Handler for a fatal synchronization error from an event feed.
     * Bans the peer responsible and disconnects.
     * @param peerID ID of the peer
     * @param error The fatal error that triggered this handler
     */
    private async fatalSyncError(peerID: string, error: VerificationResult | HeaderVerificationError | PayloadVerificationResult | SyncError) {
        const peer = this.getPeer(peerID)
        if (error !== HeaderVerificationError.UNAVAILABLE) {
            this.bannedMCIDs.set(peerID, error)
            peer.info.ban(true)
        }
        peer.connection.stream.destroy()
    }

    /**
     * Synchronizes the list of topics from a peer
     * @param peerID ID of the peer
     */
    private async syncTopics(peerID: string) {
        const addPromises: Promise<boolean>[] = []
        for (const [topicHash, feed] of this.topicFeeds) {
            addPromises.push(this.syncTopicData(peerID, topicHash, feed))
        }
        this.continuousTopicSync(peerID)
        const nAdded = (await Promise.all(addPromises)).filter(r => r).length
        this.log.info(`Added ${nAdded} topic(s) from ${peerID.slice(-6)}`)
    }

    /**
     * Continuously synchronizes updates to the peer's topic list.
     * Reacts to topic addition and removal.
     * @param peerID ID of the peer
     */
    private async continuousTopicSync(peerID: string) {
        try {
            const peer = this.getPeer(peerID)
            for await (const { key, type, value } of peer.topicsBee!
                    .createHistoryStream({ gte: -1, live: true })) {
                const feed = this.topicFeeds.get(key)

                this.log.info(`Update from ${peerID.slice(-6)}: ${type}: ${feed ? this.topicNames.get(key) : key.slice(-6)} -> ${value}`)

                if (!feed) continue

                if (type === 'del') {
                    peer.topics.delete(key)
                    if (await feed.removePeer(peerID)) {
                        this.log.info(`Removed topic ${this.topicNames.get(key)} from peer ${peerID.slice(-6)}`)
                    }
                }

                if (type === 'put') {
                    if (await this.syncTopicData(peerID, key, feed)) {
                        this.log.info(`Added topic "${this.topicNames.get(key)}" from peer ${peerID.slice(-6)}`)
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

    /**
     * Attempts to add a peer to a specific topic feed we are currently participating in.
     * @param peerID ID of the peer
     * @param topicHash Hash for the topic
     * @param feed Lambdadelta event feed object for this topic
     * @returns True if the peer was added successfully, false if the peer is not participating in the topic.
     */
    private async syncTopicData(peerID: string, topicHash: string, feed: Feed) {
        const peer = this.getPeer(peerID)
        const result = await peer.topicsBee?.get(topicHash)
        if (!result) {
            return false
        }
        peer.topics.add(topicHash)
        const topicKey = this.topicHash(this.topicNames.get(topicHash)!, 'key').toString('hex')
        const { feedCore, drive } = deserializeTopicData(decrypt(result.value, topicKey))
        return feed.addPeer(peerID, feedCore, drive)
    }

    /**
     * Attempts to add all peers to a specific topic we are currently participating in.
     * @param topicHash Hash for the topic
     * @param feed Lambdadelta event feed object for this topic
     */
    private async addPeersToTopic(topicHash: string, feed: Feed) {
        const addPromises: Promise<boolean>[] = []
        for (const [peerID, peer] of this.peers) {
            addPromises.push(this.syncTopicData(peerID, topicHash, feed))
        }
        const nAdded = (await Promise.all(addPromises)).filter(r => r).length
        this.log.info(`Added a topic from ${nAdded} peers`)
    }

    /**
     * Creates a new Lambdadelta instance.
     * Override to replace with a class that inherits from it.
     * @param topicHash topich for this feed
     * @returns A new Lambdadelta instance
     */
    protected abstract newFeed(topicHash: string): Feed

    private async _join(topic: string) {
        if (topic.length == 0) return false
        if (this.topicFeeds.has(topic)) return false

        const topicHash = this.topicHash(topic, 'index').toString('hex')
        const feed = this.newFeed(topicHash)
        feed.on('syncFatalError', (peerId, error) => {this.fatalSyncError(peerId, error)})
        await feed.ready()

        this.topicFeeds.set(topicHash, feed)
        this.topicNames.set(topicHash, topic)
        this.swarm.join(this.topicHash(topic, "DHT"))
    }

    /**
     * Announce our participation in a topic feed to our peers.
     * @param topic The topic we intend to participate in.
     */
    private async publishTopic(topic: string) {
        const feed = this.getTopic(topic)
        if (!feed) throw new Error("Publishing inexistent topic")
        const topicHash = this.topicHash(topic, 'index').toString('hex')

        // Make sure we are synced with all peers before publishing our topic cores
        await this.addPeersToTopic(topicHash, feed)

        const [feedCore, drive] = feed.getCoreIDs()
        const topicData = {feedCore, drive}
        const topicKey = this.topicHash(topic, 'key').toString('hex')
        await this.topicsBee.put(
            topicHash,
            encrypt(serializeTopicData(topicData), topicKey)
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

    /**
     * Join new topic(s) and find peers for them
     * @param topics The list of topics we want to join
     */
    public async join(topics: string[]) {
        this.log.info(`Joining topics: ${topics.join(',')}`)
        await Promise.all(topics.map(topic => this._join(topic)))
        await this.swarm.flush()
        await this.awaitPending()
        await Promise.all(topics.map(topic => this.publishTopic(topic)))
    }

    /**
     * Leave topic(s) we have previously joined
     * @param topics The list of topics we want to leave
     */
    public async leave(topics: string[]) {
        const nRemoved = (await Promise.all(topics.map(topic => this._leave(topic)))).filter(r => r).length
        this.log.info(`Left ${nRemoved} topic(s)`)
        await this.swarm.flush()
    }

    /**
     * Returns a namespaced identifier for a given topic and namespace.
     * Ensures that different applications based on this library, 
     * as well as incompatible versions of the same app,
     * will generate different hashes for the same topic.
     * Topic hashes are used by nodes in order to find each other through the DHT.
     * Thanks to this, incompatible nodes will not try to connect to each other.
     * @param topic Topic name
     * @param namespace Namespace for the hash
     * @returns A hash commitment to this topic
     */
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

export class LDNode extends LDNodeBase<Lambdadelta> {
    protected newFeed(topicHash: string) {
        return new Lambdadelta(
            topicHash,
            this.corestore,
            this.rln!
        )
    }
}