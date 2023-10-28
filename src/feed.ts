import { RLN, RLNGFullProof, VerificationResult } from '@nabladelta/rln'
import WaitQueue from 'wait-queue'
import { calculateConsensusTime } from './consensusTime.js'
import { Timeline } from './timeline.js'
import { FeedEventHeader, getEventHash } from './verifyEventHeader.js'
import type { Datastore } from 'interface-datastore'
import { Key } from 'interface-datastore'
import { getTimestampInSeconds } from './utils.js'
import { MemberTracker } from './membershipTracker.js'
import { Logger } from 'tslog'
import {  deserializeStoredEvent, numberToUint8Array, serializeStoredEvent, uint8ArrayToNumber } from './protobuf/serialize.js'

/**
 * Event received from a peer
 */
export interface FeedReceivedEvent {
    /**
     * Time we received this event from our peer.
     * If this is `null`, it means we did not receive this event live through gossipsub,
     * rather, we received it from an initial direct peer sync, and have no idea
     * when it was actually created.
     */
    received: number | null
    /**
     * RLN proof for this event
     */
    eventProof: RLNGFullProof
    /**
     * Event header
     */
    header: FeedEventHeader
    /**
     * Time our peer claims to have received this event
     */
    peerReceived: MemberReceivedTime
}

/**
* Represents a single peer's "vote" on when an event was first seen.
* Used to calculate consensus.
*/
interface MemberReceivedTime {
    /**
     * Peer ID of the member.
     * Used to deduplicate received times.
     */
    memberID: string
    /**
     * Time the member claims to have first seen the event
     */
    received: number
}

/**
 * Event to be sent to our peers.
 * Contains the event header and the time we claim to have first seen the event
 */
export interface OutgoingEvent {
    /**
     * Time we claim to have first seen the event
     */
    received: number
    /**
     * RLN proof for this event
     */
    eventProof: RLNGFullProof
    /**
     * Event header
     */
    header: FeedEventHeader
}

/**
 * Control messages for the event queues.
 */
export enum QueueControl {
    /**
     * Stop processing further events
     */
    STOP = "STOP"
}

/**
 * In-memory metadata for an event.
 * Used to keep track of consensus votes and whether or not we have published a received time for this event.
 */
interface EventMetadata {
    /**
     * Whether we have published a received time for this event
     */
    published: boolean
    /**
     * The time we claim to have first seen the event.
     * Only set if `published` is `true`, otherwise it is `-1`.
     */
    received: number
    /**
     * The intrinsic timestamp of the event.
     * This is the time the event claims to have been created,
     * set by the event creator.
     * The purpose of consensus is to determine if this timestamp is accurate.
     */
    claimed: number
    /**
     * Map of peer IDs to the time they claim to have first seen the event.
     * Used to calculate consensus.
     */
    membersReceived: Map<string, number> // peerID => time received
}

/**
 * Represents a Lambdadelta feed of events but without the networking synchronization or RLN verification.
 * Receives a stream of events from peers, produces a stream of events to be propagated of peers, persists events, calculates consensus, and keeps track of the timeline
 */
export class LambdadeltaFeed {
    private _topic: string

    public get topic(): string {
        return this._topic
    }

    private receivedQueue: WaitQueue<FeedReceivedEvent | QueueControl> = new WaitQueue()
    private outgoingQueue: WaitQueue<OutgoingEvent | QueueControl> = new WaitQueue()
    private metadata: Map<string, EventMetadata> = new Map()
    private timeline: Timeline = new Timeline()
    private unconfirmedTimeline: Timeline = new Timeline()
    private deletionTimeline: Timeline = new Timeline()
    private peerTolerance: number = 15
    private claimedTolerance: number = 60
    private quorum: number = 66/100
    private store: Datastore
    private storePrefix: string
    private memberTracker: MemberTracker
    private log: Logger<unknown>
    private deletionDelaySeconds: number = 100 // Over 1.5 minutes
    private unconfirmedEventDeletionDelaySeconds: number = 600 // 10 minutes
    private deadlockPreventionDelaySeconds: number = 300 // 5 minutes
    private failsafeActive: Set<string> = new Set()

    private inflightReceivedTimes: Map<string, MemberReceivedTime[]> = new Map()
    private processing = false
    private _ready: Promise<void>

    constructor(
        storePrefix: string,
        topic: string,
        memberTracker: MemberTracker,
        store: Datastore,
        logger: Logger<unknown>,
        config?: {
            peerTolerance?: number,
            claimedTolerance?: number,
            quorum?: number
            delays?: {
                deletion?: number,
                unconfirmedDeletion?: number,
                deadlockFailsafe?: number
            }
        }) {
        this.peerTolerance = config?.peerTolerance ?? this.peerTolerance
        this.claimedTolerance = config?.claimedTolerance ?? this.claimedTolerance
        this.quorum = config?.quorum ?? this.quorum
        this.store = store
        this._topic = topic
        this.memberTracker = memberTracker
        this.storePrefix = storePrefix
        this.log = logger
        this.deletionDelaySeconds = config?.delays?.deletion ?? this.deletionDelaySeconds
        this.unconfirmedEventDeletionDelaySeconds = config?.delays?.unconfirmedDeletion ?? this.unconfirmedEventDeletionDelaySeconds
        this.deadlockPreventionDelaySeconds = config?.delays?.deadlockFailsafe ?? this.deadlockPreventionDelaySeconds
        this._ready = (async () => {
            await this.reloadEventLog()
        })()
    }

    public static create(...args: ConstructorParameters<typeof LambdadeltaFeed>) {
        const feed = new LambdadeltaFeed(...args)
        return feed
    }

    public async ready() {
        await this._ready
    }

    /**
     * Clears the pending events queue and stops processing new events
     * If another event is received after this, it will be ignored.
     * Non-reversible.
     */
    public close() {
        this.receivedQueue.empty()
        this.receivedQueue.push(QueueControl.STOP)
        this.outgoingQueue.empty()
        this.outgoingQueue.push(QueueControl.STOP)
        this.inflightReceivedTimes.clear()
    }

    /**
     * Starts processing events from the queue.
     * @returns Boolean indicating if the feed was started
     */
    public start() {
        if (this.processing) {
            return false
        }
        this.processEventQueue().catch(this.log.error)
        this.processing = true
        return true
    }

    /**
     * Stops processing events from the queue. Reversible.
     * @returns Boolean indicating if the feed was stopped
     */
    public stop() {
        if (!this.processing) {
            return false
        }
        this.outgoingQueue.unshift(QueueControl.STOP)
        this.processing = false
        return true
    }

    /**
     * Public API for deleting an event.
     * Schedule the event for deletion after a delay.
     * This delay is to allow for the event to expire
     * before it is deleted, making sure it is not re-added to the timeline if received again.
     * @param eventID ID of the event to be deleted
     * @param maxDelaySeconds (Optional) Maximum delay in seconds before the event is deleted
     * @returns The timestamp the event is scheduled to be deleted (in seconds)
     */
    public scheduleEventDeletion(eventID: string, maxDelaySeconds: number = 120) {
        const metadata = this.metadata.get(eventID)
        if (!metadata) {
            return
        }
        const currentTime = Date.now() / 1000
        const deletionSchedule = Math.min(metadata.claimed + this.deletionDelaySeconds, currentTime + maxDelaySeconds)
        this.deletionTimeline.setTime(eventID, deletionSchedule)
        return deletionSchedule
    }

    /**
     * Deletes an event immediately and removes all associated resources.
     * @param eventID ID of the event to be deleted
     */
    private async deleteEvent(eventID: string) {
        this.log.info(`Deleting event ${eventID.slice(-6)}`)
        this.metadata.delete(eventID)
        this.timeline.unsetTime(eventID)
        this.unconfirmedTimeline.unsetTime(eventID)
        this.failsafeActive.delete(eventID)
        await this.store.delete(new Key(`${this.storePrefix}/events/${eventID}`))
        await this.store.delete(new Key(`${this.storePrefix}/received/${eventID}`))
        this.deletionTimeline.unsetTime(eventID)
    }

    /**
     * Run garbage collection.
     * Deletes events that have been scheduled for deletion,
     * Deletes events that have been unconfirmed for too long
     */
    private async gc() {
        const currentTime = Date.now()
        // Delete events that have been scheduled for deletion now
        const eventsToDelete = this.deletionTimeline.getEvents(0, currentTime, undefined, true)
        for (const [_, eventID] of eventsToDelete) {
            await this.deleteEvent(eventID)
        }
        // Delete events that have been unconfirmed for too long
        const timeOfDeletableEvents = currentTime - (this.unconfirmedEventDeletionDelaySeconds * 1000)
        const unconfirmedEvents = this.unconfirmedTimeline.getEvents(0, timeOfDeletableEvents, undefined, true)
        for (const [_, eventID] of unconfirmedEvents) {
            await this.deleteEvent(eventID)
        }
    }

    /**
     * Reloads the event log from the store
     * This is called on initialization
     */
    private async reloadEventLog() {
        for await (const {key, value} of this.store.query({prefix: `${this.storePrefix}/events`})) {
            const eventID = key.toString().split('/').pop()
            if (!eventID) {
                continue
            }
            const {header, proof} = deserializeStoredEvent(value) || {}
            if (!header || !proof) {
                continue
            }
            const metadata = {
                published: false,
                received: -1,
                claimed: header.claimed,
                membersReceived: new Map()
            }
            this.metadata.set(eventID, metadata)
            await this.onEventHeaderSync(eventID, header)
        }
        for await (const {key, value} of this.store.query({prefix: `${this.storePrefix}/received`})) {
            const eventID = key.toString().split('/').pop()
            if (!eventID) {
                continue
            }
            const received = uint8ArrayToNumber(value)
            if (received === false || isNaN(received)) {
                continue
            }
            const metadata = this.metadata.get(eventID)
            if (!metadata) {
                continue
            }
            metadata.published = true
            metadata.received = received
            this.unconfirmedTimeline.setTime(eventID, getTimestampInSeconds())
            await this.onMemberReceivedTime(eventID, metadata)
        }
    }

    /**
     * Receive an event from the P2P sync protocol
     * It is added to the queue for further processing
     * @param event Event received from our peer
     * @param received Time we received this event from our peer 
     */
    public recvEvent(event: FeedReceivedEvent) {
        // Condense multiple received times for the same event into one event and a list of inflight received times
        const eventID = event.eventProof.signal
        const receivedTimes = this.inflightReceivedTimes.get(eventID) ?? []
        receivedTimes.push(event.peerReceived)
        this.inflightReceivedTimes.set(eventID, receivedTimes)

        // First instance of this event currently in the queue
        if (receivedTimes.length == 1) {
            this.receivedQueue.push(event)
        }
    }

    /**
     * Get the next event to be sent to our peers
     * Consumes said event from the queue
     * @returns Event to be sent to our peers
     */
    public async nextOutgoingEvent() {
        return await this.outgoingQueue.shift()
    }

    /**
     * Process the event queue
     */
    private async processEventQueue() {
        while (true) {
            const event = await this.receivedQueue.shift()
            if (event === QueueControl.STOP) {
                break
            }
            await this.processQueueEvent(event)
            // Run garbage collection
            await this.gc()
        }
    }

    /**
     * Process an event from the queue
     * @param event Event received from our peer
     */
    private async processQueueEvent(event: FeedReceivedEvent) {
        const eventID = event.eventProof.signal
        await this.insertEventHeader(event.eventProof, event.header)
        await this.onEventHeaderSync(eventID, event.header)

        let metadata = this.metadata.get(eventID)
        if (!metadata) { // Is a new event
            metadata = {
                published: false,
                received: -1,
                claimed: event.header.claimed,
                membersReceived: new Map()
            }
            this.metadata.set(eventID, metadata)
            /**
             * We use the time we actually received this update from our peer
             * if event was received live, not from an initial peer sync
             */
            if (event.received !== null) {
                // If our peer's received time is close to our current time, use their time
                // This makes it harder to tell who first saw an event
                metadata.received = (Math.abs(event.received - event.peerReceived.received) <= this.peerTolerance)
                                                ? event.peerReceived.received : event.received
                await this.publishReceived(
                    eventID,
                    metadata.received
                )
                metadata.published = true
                
                // If the claimed time is close to our current time
                if (Math.abs(metadata.received - metadata.claimed) <= this.claimedTolerance) {
                    // Optimistically add the event to the timeline
                    this.timeline.setTime(eventID, metadata.claimed)
                    await this.onTimelineAdd(eventID, metadata.claimed)
                }
            }
            if (!this.isEventInTimeline(eventID)) {
                this.unconfirmedTimeline.setTime(eventID, metadata.claimed)
            }
        }

        this.registerMemberReceivedTimestamps(eventID, metadata)
        // Called after we have added all received times to the metadata
        await this.onMemberReceivedTime(eventID, metadata)
        await this.onEventSync(eventID, event.header)
    }

    private registerMemberReceivedTimestamps(eventID: string, metadata: EventMetadata) {
        // Add received times from our peers
        const inflightReceivedTimes = this.inflightReceivedTimes.get(eventID) ?? []
        this.inflightReceivedTimes.delete(eventID)
        this.log.debug(`Received ${inflightReceivedTimes.length} timestamps for event ${eventID.slice(-6)}`)
        for (const {memberID, received} of inflightReceivedTimes) {
            // It's the first time we get a timestamp for this event from this member
            if (!metadata.membersReceived.has(memberID)) {
                this.memberTracker.receiveEventTimestamp(memberID)
            }
            // Store the received time for this member in the event metadata
            metadata.membersReceived.set(memberID, received)
        }
        // Ensure any members that have left the network are removed from the metadata
        this.memberTracker.updateMemberList()
        // Delete any expired members before recalculating consensus
        for (const [memberID, _] of metadata.membersReceived.entries()) {
            if (!this.memberTracker.isMember(memberID)) {
                metadata.membersReceived.delete(memberID)
            }
        }
    }

    /**
     * To be called after we add another peer's `received` time to an event
     * It recalculates our consensus timestamp and then acts appropriately
     * @param eventID The event's ID
     */
    private async onMemberReceivedTime(eventID: string, metadata: EventMetadata, ignoreActiveMembers: boolean = false) {
        const collectedTimestamps = Array.from(metadata.membersReceived.values())
        
        const activeMembers = Math.max(this.memberTracker.getNActiveMembers(), collectedTimestamps.length)

        const totalPeers = (ignoreActiveMembers ? collectedTimestamps.length : activeMembers) // Override necessary for deadlock scenario
            + (metadata.published ? 1 : 0) // Adding our own timestamp if it's been published
        // If we have a received time of our own
        if (metadata.published) {
            // Add our contribution
            collectedTimestamps.push(metadata.received)
        }
        const { consensusTime, acceptable } = calculateConsensusTime(collectedTimestamps, totalPeers, metadata.claimed, this.claimedTolerance, this.quorum)
        
        // If no consensus could be reached
        if (consensusTime == -1) {
            if (!this.isEventInTimeline(eventID)) {
                this.deadlockFailsafe(eventID, metadata).catch(this.log.error)
            }
            return
        }

        this.log.info(`Consensus for ${eventID.slice(-6)} (${acceptable ? 'acceptable' : 'unacceptable'}) calculated based on ${collectedTimestamps.length} out of ${totalPeers} expected peers.`)

        if (acceptable) {
            this.unconfirmedTimeline.unsetTime(eventID)
        }

        // We have not yet published a received time
        if (!metadata.published) {
            await this.publishReceived(
                eventID,
                consensusTime
            )
            metadata.received = consensusTime
            metadata.published = true
        }

        // Message is determined to have been published at a false claimed time
        // if the consensus time differs too much from claimed time
        if (!acceptable) {
            // Remove from timeline
            const prevTime = this.timeline.unsetTime(eventID)
            this.unconfirmedTimeline.setTime(eventID, getTimestampInSeconds())
            if (prevTime) {
                // Removed event
                await this.onTimelineRemove(eventID, metadata.claimed)
            } else {
                // Rejected event
                await this.onTimelineReject(eventID, metadata.claimed)
            }
            return
        }

        const currentEventTime = this.timeline.getTime(eventID)
        // Event is not in timeline yet
        if (!currentEventTime) {
            this.timeline.setTime(eventID, metadata.claimed)
            await this.onTimelineAdd(eventID, metadata.claimed)
        }
    }

    /**
     * Gets called if an event fails to reach consensus
     * Forces consensus after a delay by ignoring the number of active members
     * @param eventID ID of the event
     * @param metadata Metadata for the event
     */
    private async deadlockFailsafe(eventID: string, metadata: EventMetadata) {
        if (this.failsafeActive.has(eventID)) return
        this.failsafeActive.add(eventID)
        // Wait for a period of time
        await new Promise(resolve => setTimeout(resolve, this.deadlockPreventionDelaySeconds * 1000))
        this.failsafeActive.delete(eventID)
        if (!this.metadata.has(eventID)) return
        if (this.isEventInTimeline(eventID)) return
        // Recalculate consensus without considering the number of active members
        await this.onMemberReceivedTime(eventID, metadata, true)
    }

    /**
     * Publish our received time for an event along with the event itself
     * @param eventID ID of the event
     * @param received Time the event was received by us
     * @returns Boolean indicating if the event was published
     */
    private async publishReceived(eventID: string, received: number) {
        const { proof, header } = await this.getEventByID(eventID) || {}
        if (!proof || !header) {
            return false
        }
        await this.store.put(new Key(`${this.storePrefix}/received/${proof.signal}`), numberToUint8Array(received))
        this.outgoingQueue.push({
            received,
            eventProof: proof,
            header
        })
        return true
    }

    /**
     * Inserts an event header into our store
     * @param proof RLN proof for this event
     * @param header Event header
     * @returns Enum indicating the verification result
     */
    private async insertEventHeader(proof: RLNGFullProof, header: FeedEventHeader) {
        if (await this.store.has(new Key(`${this.storePrefix}/events/${proof.signal}`))) {
            return
        }
        await this.store.put(new Key(`${this.storePrefix}/events/${proof.signal}`), serializeStoredEvent({proof, header}))
    }

    /**
     * Get the event ID for a given event header
     * @param event Event header
     * @returns Event ID
     */
    private getEventHash(event: FeedEventHeader) {
        return getEventHash(event, this.topic)
    }

    /**
     * API for the publication of a new event
     * @param eventID ID for this event
     * @param header Event header
     */
    public async addEvent(proof: RLNGFullProof, header: FeedEventHeader) {
        const eventID = this.getEventHash(header)
        let eventMetadata = this.metadata.get(eventID)
        if (eventMetadata) {
            return { result: false, eventID, exists: true }
        }
        await this.insertEventHeader(proof, header)
        await this.onEventHeaderSync(eventID, header)
        eventMetadata = {
            published: false,
            received: header.claimed,
            claimed: header.claimed,
            membersReceived: new Map()
        }
        this.metadata.set(eventID, eventMetadata)
        await this.publishReceived(eventID, header.claimed)
        eventMetadata.published = true
        this.timeline.setTime(eventID, header.claimed)
        await this.onTimelineAdd(eventID, header.claimed)
        
        return { result: true, eventID, exists: false }
    }

    /**
     * Check if an event has been added to the timeline
     * @param eventID ID of the event
     * @returns boolean indicating if the event is in the timeline
     */
    public isEventInTimeline(eventID: string) {
        return !!this.timeline.getTime(eventID)
    }

    /**
     * Check if an event has been processed by the feed at all
     * @param eventID ID of the event
     * @returns boolean indicating if the event exists
     */
    public eventExists(eventID: string) {
        return this.metadata.has(eventID)
    }

    /**
     * Fetch a particular event by its `eventID`
     * @param eventID ID of the event
     * @returns Event data or `null` if the event is not available
     */
    public async getEventByID(eventID: string) {
        try {
            const event = await this.store.get(new Key(`${this.storePrefix}/events/${eventID}`))
            if (!event) return null
            return deserializeStoredEvent(event) || null
        } catch (e) {
            if ((e as any).code == "ERR_NOT_FOUND") {
                return null
            }
            throw e
        }
    }

    /**
     * Fetch a list of events by their `eventID`s
     * @param eventIDs IDs of the events
     * @returns List of event data
     */
    public async * getEventsByID(eventIDs: string[]): AsyncIterable<{
        proof: RLNGFullProof;
        header: FeedEventHeader;
    }> {
        for await (const { key, value } of this.store.getMany(eventIDs.map(eventID => new Key(`${this.storePrefix}/events/${eventID}`)))) {
            const event = deserializeStoredEvent(value)
            if (!event) continue
            yield event
        }
    }

    /**
     * Get events from the timeline dated between `startTime` and `endTime`
     * @param startTime Events with this timestamp or newer will be included
     * @param endTime Events with this timestamp or older will be included
     * @param maxLength Maximum number of results
     * @returns list of event data
     */
    public async getEvents(
        startTime: number = 0,
        endTime?: number,
        maxLength?: number
    ) {
        const events = (await Promise.all(this.timeline.getEvents(startTime, endTime, maxLength, true)
                .map(async ([time, eventID]) => (await this.getEventByID(eventID))! )))
                .filter(e => e != null)
        return events
    }

    /**
     * Async iterable for all events that have been published
     * @returns Async iterable of event data
     */
    public async * publishedEvents(): AsyncIterable<OutgoingEvent> {
        const publishedIDs = []
        for (const [eventID, metadata] of this.metadata) {
            if (metadata.published) {
                publishedIDs.push(eventID)
            }
        }
        for await (const event of this.getEventsByID(publishedIDs)) {
            const metadata = this.metadata.get(event.proof.signal)
            if (!metadata) continue

            yield { eventProof: event.proof, header: event.header, received: metadata.received }
        }
    }

    protected async onTimelineAdd(eventID: string, time: number) {

    }

    protected async onTimelineRemove(eventID: string, time: number) {

    }

    protected async onTimelineReject(eventID: string, time: number) {

    }

    protected async onEventSync(eventID: string, header: FeedEventHeader) {
        
    }

    protected async onEventHeaderSync(eventID: string, header: FeedEventHeader) {

    }

    protected async onEventDeleted(eventID: string) {

    }
}