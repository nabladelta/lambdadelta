import { RLNGFullProof, VerificationResult } from "@nabladelta/rln"
import { Logger } from "tslog"
import crypto from "crypto"
import { Libp2p } from "libp2p"
import { PubSub } from "@libp2p/interface/pubsub"
import { KadDHT } from "@libp2p/kad-dht"
import { toString as uint8ArrayToString } from "uint8arrays/to-string"
import { TimeoutController } from 'timeout-abort-controller'
import { pipe } from 'it-pipe'
import { Connection, Stream } from '@libp2p/interface/connection'
import { Message, SubscriptionChangeData } from '@libp2p/interface/pubsub'
import { PeerId } from '@libp2p/interface/peer-id'

import type { Datastore } from 'interface-datastore'
import { Key } from 'interface-datastore'
import { MemberTracker } from "../membershipTracker.js"
import { LambdadeltaSync } from "../sync.js"
import { LambdadeltaFeed } from "../feed.js"
import { FeedEventHeader, getEventHash } from "../verifyEventHeader.js"
import { RoutingTable } from "./routingTable.js"
import { coinFlip, getRandomInt } from "../utils.js"
import { deserializePeerMessage, deserializeStoredEvent, serializePeerMessage, serializeStoredEvent } from "../protobuf/serialize.js"
import { StoredEvent } from "../utils.js"
import { Crypter } from "../encrypt.js"

/**
 * Dandelion++ event relayer
 */
export class EventRelayer<Feed extends LambdadeltaFeed, Sync extends LambdadeltaSync<Feed>> {
    private store: Datastore
    private memberTracker: MemberTracker
    private sync: Sync
    private libp2p: Libp2p<{ pubsub: PubSub; dht: KadDHT }>
    private log: Logger<unknown>
    private relaying = false
    private peers: Map<string, PeerId> = new Map()
    private routingTable: RoutingTable
    private embargoedEvents: Set<string> = new Set()
    private embargoTimeMs: number = 5000
    private embargoJitterMs: number = 3000
    private feed: Feed
    private storePrefix: string
    private protocolPrefix: string
    private crypto: Crypter

    constructor(
        storePrefix: string,
        protocolPrefix: string,
        feed: Feed,
        sync: Sync,
        store: Datastore,
        memberTracker: MemberTracker,
        libP2P: Libp2p<{ pubsub: PubSub; dht: KadDHT }>,
        crypto: Crypter,
        logger: Logger<unknown>,
    ) {
        this.store = store
        this.memberTracker = memberTracker
        this.libp2p = libP2P
        this.log = logger
        this.sync = sync
        this.feed = feed
        this.routingTable = new RoutingTable(String(this.libp2p.peerId))
        this.storePrefix = storePrefix
        this.protocolPrefix = protocolPrefix
        this.crypto = crypto
    }

    public static create<Feed extends LambdadeltaFeed, Sync extends LambdadeltaSync<Feed>>(...args: ConstructorParameters<typeof EventRelayer<Feed, Sync>>) {
        const eventRelayer = new EventRelayer(...args)
        return eventRelayer
    }

    /**
     * Set the embargo timer for events
     * @param timeMs 
     * @param jitterMs Variance in embargo time 
     */
    public setEmbargoTimer(timeMs: number, jitterMs: number) {
        this.embargoJitterMs = jitterMs
        this.embargoTimeMs = timeMs
    }

    private addPeer(peerId: PeerId) {
        this.peers.set(String(peerId), peerId)
    }

    private removePeer(peerId: PeerId) {
        this.peers.delete(String(peerId))
    }

    /**
     * Event was received from a peer
     * @param senderPeerId
     * @param eventBuf 
     */
    private async eventReceived(senderPeerId: PeerId, eventBuf: Uint8Array) {
        this.updatePeers()
        const hash = crypto.createHash('sha256').update(eventBuf).digest('hex')

        const result = await this.verifyEvent(eventBuf)
        if (!result) {
            this.log.warn(`Event (hash: ${hash}) is invalid, not relaying`)
            return
        }
        const [eventID, _] = result
        if (this.feed.eventExists(eventID)) {
            this.log.warn(`Event (ID: ${eventID.slice(-6)}) already fluffed, not relaying`)
            return
        }

        this.log.info(`Received stem event from ${String(senderPeerId)} (ID: ${eventID.slice(-6)}`)
        const totalPeers = this.peers.size
        const chance = 1 / Math.min(totalPeers, 10) // 1 in 10 chance or better of fluffing
        const fluffEvent = coinFlip(chance)

        if (fluffEvent) {
            // Publish event (fluff phase)            
            const result = await this.fluffEvent(eventBuf)
            if (result.exists) {
                this.log.debug(`Skip fluff (already existing event) (ID: ${eventID.slice(-6)})`)
            } else {
                this.log.info(`Fluff result: ${result.result} existing: ${result.exists} (ID: ${eventID.slice(-6)})`)
            }
        } else {
            // Relay event (stem phase)
            this.log.info(`Relaying stem event (ID: ${eventID.slice(-6)})`)
            const sendResult = await this.sendEventToRelay(String(senderPeerId), eventBuf)
            if (!sendResult) {
                this.log.error(`Failed to relay event (ID: ${eventID.slice(-6)})`)
                return
            }

            if (this.embargoedEvents.has(eventID)) {
                this.log.debug(`Event ${eventID.slice(-6)} is embargoed, not embargoing again`)
                return
            }
            this.embargoedEvents.add(eventID)
            // Publish event after the embargo timer expires
            setTimeout(() => {
                this.embargoedEvents.delete(eventID.slice(-6))

                const result = this.fluffEvent(eventBuf)
                result.then((r) => {
                    if (r.exists) {
                        this.log.debug(`Skip fluff after embargo (already existing event) (ID: ${eventID.slice(-6)})`)
                    } else {
                        this.log.info(`Fluff result: ${r.result} existing: ${r.exists} (ID: ${eventID.slice(-6)})`)
                    }
                })
            },
            this.embargoTimeMs + getRandomInt(this.embargoJitterMs))
        }
    }

    /**
     * Fluff an event. We publish it as if we originated it ourselves.
     * @param eventBuf Event to fluff
     * @returns Object with the result of the operation, and a boolean indicating if the event already existed
     */
    protected async fluffEvent(eventBuf: Uint8Array) {
        const result = this.verifyEvent(eventBuf)
        if (!result) {
            return {result: 'invalid', exists: false}
        }
        const event = deserializeStoredEvent(eventBuf)
        if (!event) {
            return {result: 'invalid', exists: false}
        }
        return this.feed.addEvent(event.proof, event.header)
    }

    /**
     * Update the Dandelion++ routing table with the current set of peers
     */
    private updatePeers() {
        const peers: string[] = []
        for (const peer of this.peers.keys()) {
            if (this.memberTracker.isMember(peer)) {
                peers.push(peer)
            }
        }
        this.log.info(`Updating peers: ${peers.length}`)
        this.routingTable.updatePeers(peers)
    }

    /**
     * Verify an event
     * @param eventBuf 
     * @returns Event ID if the event is valid, false otherwise
     */
    protected async verifyEvent(eventBuf: Uint8Array): Promise<false | [string, StoredEvent]> {
        const event = deserializeStoredEvent(eventBuf)
        if (!event) {
            return false
        }
        const result = await this.sync.verifyHeader({
            type: 'event',
            header: event.header,
            eventProof: event.proof
        })
        if (result !== VerificationResult.VALID) {
            return false
        }
        return [getEventHash(event.header, this.feed.topic), event]
    }

    /**
     * Relay an event to the Dandelion++ network
     * @param header Event header
     * @param eventProof Event proof
     * @returns Object with the result of the operation, and a boolean indicating if the event already existed locally
     */
    public async relayEvent(header: FeedEventHeader, eventProof: RLNGFullProof) {
        if (this.peers.size === 0) {
            this.log.warn('No peers to relay event to, publishing directly')
            return await this.feed.addEvent(eventProof, header)
        }
        const eventBuf = serializeStoredEvent({proof: eventProof, header})
        return {result: await this.sendEventToRelay(String(this.libp2p.peerId), eventBuf), exists: false}
    }

    /**
     * Send an event to the correct peer on the Dandelion++ network based on our routing table.
     * @param senderPeerId Peer we received the event from
     * @param event Event to relay
     * @returns Boolean indicating if the event was successfully relayed
     */
    private async sendEventToRelay(senderPeerId: string, event: Uint8Array) {
        this.updatePeers()
        const destination = this.routingTable.getDestination(senderPeerId)
        if (!destination) {
            this.log.error(`No destination found for event. Sender: ${senderPeerId}, peers: ${this.peers.size}`)
            return false
        }
        const peerId = this.peers.get(destination)
        if (!peerId) {
            this.log.error(`No peer found for destination ${destination}`)
            return false
        }
        this.log.info(`Relaying event to ${destination}`)
        return await this.sendRelayedEventsToPeer(peerId, [event])
    }

    /**
     * Handle a peer subscription change event
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
            this.removePeer(remotePeer)
            return
        }
        if (this.peers.has(peerId)) {
            return
        }
        this.log.info(`Peer ${peerId} subscribed`)

        const timeoutController = new TimeoutController(5000)
        const { signal } = timeoutController
        try {
            const stream = await this.libp2p
                .dialProtocol(remotePeer, `${this.protocolPrefix}/handshake`, { signal })
            await pipe(
                this.sendHandshake(),
                stream,
                this.receiveHandshake(remotePeer)
            )
        } catch (e) {
            if ((e as any).code === 'ERR_UNSUPPORTED_PROTOCOL') {
                // Peer does not have this topic/protocol
                this.log.warn(`Peer ${peerId} does not have the relay protocol`)
            } else {
                this.log.error('Failed to sync with peer', e)
            }
            this.removePeer(remotePeer)
        } finally {
            if (timeoutController) {
                timeoutController.clear()
            }
        }
    }

    private sendHandshake() {
        const self = this
        return (async function * () {
                const buf = serializePeerMessage({
                    type: 'membership',
                    membershipProof: await self.sync.getMembershipProof()
                })
                yield self.crypto.encrypt(buf)
        })()
    }

    private receiveHandshake(peerId: PeerId) {
        return async (source: AsyncGenerator<any, void, unknown>) => {
            for await (const message of source) {
                try {
                    const decrypted = this.crypto.decrypt(message.subarray())
                    const handshake = deserializePeerMessage(decrypted)
                    if (!handshake) {
                        continue
                    }
                    const result = await this.sync.verifyMembershipProof(peerId, handshake.membershipProof)
                    if (result !== VerificationResult.VALID) {
                        continue
                    }
                    this.memberTracker.add(handshake.membershipProof.signal, parseInt(handshake.membershipProof.externalNullifiers[0].nullifier))
                    this.addPeer(peerId)
                    this.log.info(`Added peer ${peerId} to dandelion peer list`)
                } catch (e) {
                    this.log.error(`Failed to verify membership proof from peer ${peerId}`, e)
                }
            }
        }
    }

    /**
     * Protocol to send and receive handshake messages
     */
    private async handleHandshake({ connection, stream }: { connection: Connection, stream: Stream }) {
        try {
            await pipe(
                stream,
                this.receiveHandshake(connection.remotePeer),
                (_) => this.sendHandshake(),
                stream
            )
        } catch (e) {
            this.removePeer(connection.remotePeer)
        }
    }

    /**
     * Directly sends some events to a peer
     * @param peerId 
     * @param events 
     * @returns 
     */
    private async sendRelayedEventsToPeer(peerId: PeerId, events: Uint8Array[]) {
        const timeoutController = new TimeoutController(5000)
        const { signal } = timeoutController
        try {
            const stream = await this.libp2p
                .dialProtocol(peerId, `${this.protocolPrefix}/relay`, { signal })
            await pipe(
                this.sendEvents(events),
                stream
            )
        } catch (e) {
            if ((e as any).code === 'ERR_UNSUPPORTED_PROTOCOL') {
                // Peer does not have this topic
            } else {
                this.log.error('Failed to sync with peer', e)
            }
            this.removePeer(peerId)
            return false
        } finally {
            if (timeoutController) {
                timeoutController.clear()
            }
        }
        return true
    }

    private sendEvents(events: Uint8Array[]) {
        const self = this
        return (async function * () {
            for (const event of events) {
                yield self.crypto.encrypt(event)
            }
        })()
    }

    private receiveRelayedEvents(peerId: PeerId) {
        return async (source: AsyncGenerator<any, void, unknown>) => {
            for await (const message of source) {
                try {
                    await this.eventReceived(peerId, this.crypto.decrypt(message.subarray()))
                } catch (e) {
                    this.log.error(`Failed to decrypt event from peer ${peerId}`, e)
                }
            }
        }
    }

    /**
     * Protocol to send and receive Dandelion++ relayed events
     */
    private async handleRelay({ connection, stream }: { connection: Connection, stream: Stream }) {
        try {
            await pipe(
                stream,
                this.receiveRelayedEvents(connection.remotePeer)
            )
        } catch (e) {
            this.removePeer(connection.remotePeer)
        }
    }

    /**
     * Begin handling Dandelion++ relayed events and handshake messages
     */
    public async start() {
        if (this.relaying) {
            return
        }

        await this.libp2p
            .handle(`${this.protocolPrefix}/handshake`,
            this.handleHandshake.bind(this)
        )
        await this.libp2p
            .handle(`${this.protocolPrefix}/relay`,
            this.handleRelay.bind(this)
        )
        this.libp2p.services.pubsub
            .addEventListener('subscription-change', 
                this.handlePeerSubscription.bind(this)
            )

        this.relaying = true
    }

    /**
     * Stop handling Dandelion++ relayed events and handshake messages
     */
    public async stop() {
        if (!this.relaying) {
            return
        }
        this.libp2p.services.pubsub
            .removeEventListener('subscription-change',
                this.handlePeerSubscription.bind(this)
            )
        await this.libp2p
            .unhandle(`${this.protocolPrefix}/handshake`)
        await this.libp2p
            .unhandle(`${this.protocolPrefix}/relay`)
        this.relaying = false
    }
}