import { RLN, RLNGFullProof, VerificationResult } from "@nabladelta/rln"
import { Logger } from "tslog"
import { Libp2p } from "libp2p"
import { PubSub } from "@libp2p/interface/pubsub"
import { KadDHT } from "@libp2p/kad-dht"
import { toString as uint8ArrayToString } from "uint8arrays/to-string"
import { TimeoutController } from 'timeout-abort-controller'
import { pipe } from 'it-pipe'
import { Connection, Stream } from '@libp2p/interface/connection'
import { TopicValidatorResult } from '@libp2p/interface/pubsub'
import { Message, SubscriptionChangeData } from '@libp2p/interface/pubsub'
import { PeerId } from '@libp2p/interface/peer-id'
import { FeedEventHeader, NullifierSpec, verifyEventHeader } from "./verifyEventHeader.js"
import { generateMemberCID, verifyMemberCIDProof } from "./membercid.js"
import { LambdadeltaFeed, OutgoingEvent, QueueControl } from "./feed.js"
import { getMemberCIDEpoch, getTimestampInSeconds } from "./utils.js"
import { MemberTracker } from "./membershipTracker.js"
import type { Datastore } from 'interface-datastore'
import { Key } from 'interface-datastore'
import { deserializeFullProof, deserializePeerMessage, serializeFullProof, serializePeerMessage } from "./protobuf/serialize.js"
import { Crypter } from "./encrypt.js"

/**
 * An Event received from a peer
 */
export type PeerEvent = {
    type: 'event'
    /**
     * Membership proof of the peer that sent the event
     */
    membershipProof: RLNGFullProof
    /**
     * Time at which the peer claims to have first received the event
     */
    received: number
    /**
     * RLN proof of the event
     */
    eventProof: RLNGFullProof
    /**
     * Event header
     */
    header: FeedEventHeader
    /**
     * The topic the event belongs to
     */
    topic: string
}

/**
 * A membership renewal message received from a peer.
 * Sent periodically at every new membership epoch by peers to renew their membership proof,
 * unless they have already published an event with a new membership proof.
 */
export type PeerMembershipRenewal = {
    type: 'membership'
    /**
     * Membership proof of the peer that sent the message
     */
    membershipProof: RLNGFullProof
}

/**
 * A message received from a peer
 */
export type PeerMessage = PeerEvent | PeerMembershipRenewal

/**
 * Self-explanatory
 */
type EventWithProof = {
    type: 'event'
    eventProof: RLNGFullProof
    header: FeedEventHeader
}

/**
 * Handles P2P network synchronization for a Lambdadelta feed
 * @typeParam Feed Type of the feed for this instance
 */
export class LambdadeltaSync<Feed extends LambdadeltaFeed> {    
    protected rln: RLN
    protected libp2p: Libp2p<{ pubsub: PubSub; dht: KadDHT }>
    private log: Logger<unknown>
    private feed: Feed
    private memberTracker: MemberTracker
    private ownMembershipProof: RLNGFullProof | null = null
    private peerMembershipProofs = new Map<string, RLNGFullProof>()
    private memberCIDToleranceMs: number
    private verifiedEvents = new Set<string>()
    private nullifierSpecs: Map<string, NullifierSpec[]>
    private syncedPeers = new Set<string>()
    private syncing: boolean = false
    private store: Datastore
    private storePrefix: string
    private protocolPrefix: string
    private lastPublishedMembershipProofEpoch: string | undefined = undefined
    private crypto: Crypter

    // How long to wait before starting to process messages from the initial sync
    private bufferPeriodMs: number = 0

    constructor(
        storePrefix: string,
        protocolPrefix: string,
        feed: Feed,
        store: Datastore,
        memberTracker: MemberTracker,
        rln: RLN,
        crypto: Crypter,
        nullifierSpecs: Map<string, NullifierSpec[]>,
        libP2P: Libp2p<{ pubsub: PubSub; dht: KadDHT }>,
        logger: Logger<unknown>,
        initialSyncBufferPeriodMs: number = 0,
        memberCIDToleranceMs: number = 60000,  // 1 minute
    ) {
        this.nullifierSpecs = nullifierSpecs
        this.memberCIDToleranceMs = memberCIDToleranceMs
        this.rln = rln
        this.libp2p = libP2P
        this.feed = feed
        this.log = logger
        this.memberTracker = memberTracker
        this.store = store
        this.storePrefix = storePrefix
        this.protocolPrefix = protocolPrefix
        this.bufferPeriodMs = initialSyncBufferPeriodMs
        this.crypto = crypto
    }

    public static create<Feed extends LambdadeltaFeed>(...args: ConstructorParameters<typeof LambdadeltaSync<Feed>>) {
        const instance = new LambdadeltaSync<Feed>(...args)
        return instance
    }

    /**
     * Handles a change in peer subscriptions
     * Tries to sync our events with peers that have subscribed to the topic
     */
    private async handlePeerSubscription(event: CustomEvent<SubscriptionChangeData>) {
        const subscriptionChange = event.detail
        const { peerId: remotePeer, subscriptions } = subscriptionChange
        const peerId = String(remotePeer)

        const subscription = subscriptions.find(e => e.topic === this.feed.topic)
        if (!subscription) {
            return
        }

        if (!subscription.subscribe) {
            this.log.info(`Peer ${peerId} unsubscribed`)
            this.syncedPeers.delete(peerId)
            return
        }
        if (this.syncedPeers.has(peerId)) {
            return
        }
        this.log.info(`Peer ${peerId} subscribed`)

        this.log.info(`Syncing with peer ${peerId}`)
        const timeoutController = new TimeoutController(5000)
        const { signal } = timeoutController
        try {
            this.syncedPeers.add(peerId)
            const stream = await this.libp2p.dialProtocol(remotePeer, `${this.protocolPrefix}/directSync`, { signal })
            await pipe(
                this.sendDirectSync(),
                stream,
                this.receiveDirectSync(remotePeer)
            )
        } catch (e) {
            if ((e as any).code === 'ERR_UNSUPPORTED_PROTOCOL') {
                // Peer does not have this topic
            } else {
                this.log.error('Failed to sync with peer', e)
            }
            this.syncedPeers.delete(peerId)
        } finally {
            if (timeoutController) {
                timeoutController.clear()
            }
        }
    }

    /**
     * Handles a direct sync request from a peer
     * Receives events from the peer and sends our own events
     */
    private async handleDirectSync({ connection, stream }: { connection: Connection, stream: Stream }) {
        const peerId = String(connection.remotePeer)
        this.log.info(`Sync from peer ${peerId}`)
        try {
            this.syncedPeers.add(peerId)
            await pipe(
                stream,
                this.receiveDirectSync(connection.remotePeer),
                (_) => this.sendDirectSync(),
                stream
            )
        } catch (e) {
            this.log.error('Failed to sync with peer', e)
            this.syncedPeers.delete(peerId)
        }
    }

    private sendDirectSync() {
        const self = this
        return (async function * () {
            for await (const event of self.feed.publishedEvents()) {
                yield self.crypto.encrypt(await self.processOutgoingMessage(event))
            }
        })()
    }

    private receiveDirectSync(peerId: PeerId) {
        return async (source: AsyncGenerator<any, void, unknown>) => {
            for await (const message of source) {
                try {
                    const decrypted = this.crypto.decrypt(message.subarray())
                    const result = this.validateMessage(peerId, decrypted)
                    if (!result) {
                        continue
                    }
                    const event = deserializePeerMessage(decrypted)
                    if (!event) {
                        continue
                    }
                    this.handleIncomingMessage(event, null)
                } catch (e) {
                    this.log.error('Failed to handle direct sync message', e)
                }
            }
        }
    }

    /**
     * Handles a message received from the libp2p gossipsub network
     * @param evt 
     */
    private async handlePubSubMessage(evt: CustomEvent<Message>) {
        const msg = evt.detail
        if (msg.type == 'unsigned') {
            return
        }
        try {
            const event = deserializePeerMessage(this.crypto.decrypt(msg.data))
            if (!event) {
                return
            }
            this.handleIncomingMessage(event, getTimestampInSeconds())
        } catch (e) {
            this.log.error('Failed to handle pubsub message', e)
        }
    }

    /**
     * Handles an incoming message regardless of the source (direct or gossipsub)
     * @param event 
     * @param received Timestamp of when the message was received (null if received through direct sync)
     */
    private handleIncomingMessage(event: PeerMessage, received: number | null) {
        this.memberTracker.add(event.membershipProof.signal, parseInt(event.membershipProof.externalNullifiers[0].nullifier))

        if (event.type === 'membership') {
            this.log.info(`Received membership proof from ${event.membershipProof.signal}`)
            return
        }
        this.log.info(`Received: ${event.eventProof.signal.slice(-6)} at time ${received}`)

        this.feed.recvEvent({
            received: received,
            eventProof: event.eventProof,
            header: event.header,
            peerReceived: {
                memberID: event.membershipProof.signal,
                received: event.received
            }
        })
    }

    /**
     * Handles outgoing messages from the feed.
     * Adds the membership proof to the messages and publishes them to the network
     */
    private async handleOutgoingMessages() {
        while (true) {
            const eventOut = await this.feed.nextOutgoingEvent()
            if (eventOut == QueueControl.STOP) return
            const eventID = eventOut.eventProof.signal
            const eventBuf = await this.processOutgoingMessage(eventOut)
            const publishResult = await this.libp2p.services.pubsub.publish(this.feed.topic, this.crypto.encrypt(eventBuf))
            this.log.info(`Sent ${eventID.slice(-6)}  to ${publishResult.recipients.length} peers`)
            if (publishResult.recipients.length > 0) {
                // We have published an event to the network with a new membership proof for the current epoch
                this.lastPublishedMembershipProofEpoch = this.ownMembershipProof?.externalNullifiers[0].nullifier
            }
        }
    }
    /**
     * Adds the membership proof to an outgoing message and serializes it
     * @param eventOut Outgoing message
     * @returns Buffer containing the outgoing message
     */
    private async processOutgoingMessage(eventOut: OutgoingEvent) {
        const event: PeerMessage = {
            type: 'event',
            membershipProof: await this.getMembershipProof(),
            received: eventOut.received,
            eventProof: eventOut.eventProof,
            header: eventOut.header,
            topic: this.feed.topic
        }
        return serializePeerMessage(event)
    }

    /**
     * Periodically publishes the latest membership proof to the network
     */
    private async periodicMembershipRenewal() {
        while (this.syncing) {
            await new Promise(resolve => setTimeout(resolve, 600 * 1000)) // Attempt every 10 minutes
            if (!this.syncing) {
                return
            }
            const membershipEpoch = getMemberCIDEpoch()
            // If we have already published a membership proof for this epoch, we don't need to do it again
            if (this.lastPublishedMembershipProofEpoch === membershipEpoch.toString()) {
                continue
            }
            await this.publishMembershipRenewal()
            this.purgeMembershipProofs()
        }
    }

    /**
     * Purges membership proofs that are no longer valid from the cache
     */
    private purgeMembershipProofs() {
        const membershipEpoch = getMemberCIDEpoch()
        this.peerMembershipProofs.forEach((proof, peerId) => {
            if (proof.externalNullifiers[0].nullifier !== membershipEpoch.toString()) {
                this.peerMembershipProofs.delete(peerId)
            }
        })
    }

    /**
     * Publishes the membership proof to the network
     */
    private async publishMembershipRenewal() {
        const membershipProof = await this.getMembershipProof()
        const event: PeerMessage = {
            type: 'membership',
            membershipProof
        }
        const eventBuf = serializePeerMessage(event)
        await this.libp2p.services.pubsub.publish(this.feed.topic, this.crypto.encrypt(eventBuf))
        this.log.info(`Published membership proof for epoch ${membershipProof.externalNullifiers[0].nullifier}`)
    }

    /**
     * Get our membership proof for the current epoch
     * @returns Membership proof
     */
    public async getMembershipProof() {
        const key = new Key(`${this.storePrefix}/membershipProof`)
        if (!this.ownMembershipProof) {
            try {
                const buf = await this.store.get(key)
                if (buf) {
                    this.ownMembershipProof = deserializeFullProof(buf) || null
                }
            } catch (e) {
                if ((e as any).code !== "ERR_NOT_FOUND") {
                    throw e
                }
            }
        }
        if (!this.ownMembershipProof || this.ownMembershipProof.externalNullifiers[0].nullifier !== getMemberCIDEpoch().toString()) {
            this.ownMembershipProof = await generateMemberCID(this.libp2p.peerId.toString(), this.rln, this.feed.topic)
            await this.store.put(key, serializeFullProof(this.ownMembershipProof))
        }
        return this.ownMembershipProof
    }

    /**
     * Verify a membership proof from a peer
     * @param peerId Peer ID of the peer that sent the membership proof
     * @param proof Membership proof
     * @returns Verification result
     */
    public async verifyMembershipProof(peerId: PeerId, proof: RLNGFullProof) {
        const nullifier = proof.externalNullifiers[0].nullifier
        if (this.peerMembershipProofs.has(peerId.toString()) && this.peerMembershipProofs.get(peerId.toString())?.externalNullifiers[0].nullifier === nullifier) {
            return VerificationResult.VALID
        }
        const result = await verifyMemberCIDProof(proof, peerId.toString(), this.rln, this.feed.topic, this.memberCIDToleranceMs)
        if (result == VerificationResult.VALID) {
            this.peerMembershipProofs.set(peerId.toString(), proof)
        }
        return result
    }

    /**
     * Verify an event header
     * @param event Event with proof
     * @returns Verification result
     */
    public async verifyHeader(event: EventWithProof) {
        if (event.type !== 'event') return VerificationResult.INVALID

        if (this.verifiedEvents.has(event.eventProof.signal)) return VerificationResult.VALID

        const headerResult = await verifyEventHeader(event.eventProof, event.header, this.feed.topic, this.nullifierSpecs, this.rln)
        if (headerResult === VerificationResult.VALID || headerResult === VerificationResult.DUPLICATE) {
            this.verifiedEvents.add(event.eventProof.signal)
            return VerificationResult.VALID
        }
        return headerResult
    }

    /**
     * Validate a message received from a peer
     * @param peerId Peer ID of the peer that sent the message
     * @param message Message data
     * @returns boolean indicating if the message is valid
     */
    private async validateMessage(peerId: PeerId, message: Uint8Array) {
        const event = deserializePeerMessage(message)
        if (!event) return false
        const membershipResult = await this.verifyMembershipProof(peerId, event.membershipProof)
        this.log.debug(`Validated message membership for ${peerId.toString()}: ${membershipResult}`)
        if (membershipResult !== VerificationResult.VALID) return false
        if (event.type === 'membership') return true

        const headerResult = await this.verifyHeader(event)
        this.log.debug(`Validated message header for event ${event.eventProof.signal.slice(-6)} from ${peerId.toString()}: ${headerResult}`)
        return headerResult === VerificationResult.VALID
    }

    /**
     * Validate a message received from a peer through pubsub
     * @param msg Pubsub message
     * @returns Enum indicating if the message is valid
     */
    private async validatePubSubMessage(_: PeerId, msg: Message): Promise<TopicValidatorResult> {
        if (msg.type == 'unsigned') {
            return TopicValidatorResult.Reject
        }
        try {
            const result = await this.validateMessage(msg.from, this.crypto.decrypt(msg.data))
            if (!result) {
                return TopicValidatorResult.Reject
            }
            return TopicValidatorResult.Accept
        } catch (e) {
            this.log.error('Failed to validate pubsub message', e)
            return TopicValidatorResult.Reject
        }
    }

    /**
     * Start syncing with the network
     */
    public async start() {
        if (this.syncing) {
            return
        }
        this.handleOutgoingMessages().catch(e => this.log.error('Failed to handle outgoing messages', e))
        await this.libp2p.handle(`${this.protocolPrefix}/directSync`,this.handleDirectSync.bind(this))
        this.libp2p.services.pubsub.addEventListener("message", this.handlePubSubMessage.bind(this))
        this.libp2p.services.pubsub.addEventListener('subscription-change', this.handlePeerSubscription.bind(this))
        this.libp2p.services.pubsub
            .topicValidators
            .set(this.feed.topic, async (peerId, msg) => await this.validatePubSubMessage(peerId, msg))

        this.libp2p.services.pubsub.subscribe(this.feed.topic)
        await this.feed.ready()
        this.periodicMembershipRenewal().catch(e => this.log.error('Failed to renew membership', e))
        this.syncing = true

        if (this.bufferPeriodMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.bufferPeriodMs))
        }
        this.feed.start()
    }

    /**
     * Stop syncing with the network. Unsubscribes from the pubsub topic. Removes event and protocol listeners.
     */
    public async stop() {
        if (!this.syncing) {
            return
        }
        this.libp2p.services.pubsub.unsubscribe(this.feed.topic)
        this.libp2p.services.pubsub.removeEventListener("message", this.handlePubSubMessage.bind(this))
        this.libp2p.services.pubsub.removeEventListener('subscription-change', this.handlePeerSubscription.bind(this))
        await this.libp2p.unhandle(`${this.protocolPrefix}/directSync`)
        this.syncing = false
    }

    // private async peerDiscovery() {
    //     // Peer discovery
    //     await Promise.all(this.getTopicList().map(async (topic) => {
    //         this.libp2p.contentRouting.provide(await this.topicCID(topic))
    //     }))
    //     await Promise.all(this.getTopicList().map(async (topic) => {
    //         for (const peerInfo of await all(this.libp2p.contentRouting.findProviders(await this.topicCID(topic)))) {
    //             console.log(`Found peer providing topic: ${peerInfo.id.toString()}`);
    //             console.log(`Addresses: ${peerInfo.multiaddrs.toString()}`);
    //             await this.libp2p.dial(peerInfo.id)
    //         }
    //     }))
    // }

    // private async topicCID(topic: string) {
    //     return CID.create(1, json.code, await sha256.digest(json.encode({ hash: this.topicHash(topic, 'cid').toString('hex') })))
    // }
}