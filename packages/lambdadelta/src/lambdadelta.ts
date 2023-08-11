import BTree from 'sorted-btree'
import b4a from 'b4a'
import Hyperdrive from 'hyperdrive'
import crypto from 'crypto'
import { TypedEmitter } from 'tiny-typed-emitter'
import { RLN, RLNGFullProof, VerificationResult } from '@nabladelta/rln'
import { deserializeEvent, 
    getEpoch,
    getTimestampInSeconds,
    serializeEvent,
    deserializeLogEntry,
    serializeLogEntry, 
    rlnIdentifier} from './utils'
import Corestore from 'corestore'
import Hypercore from 'hypercore'
import { Timeline } from './timeline'
import { NullifierRegistry } from './nullifier'
import { createEvent } from './create'
import { calculateConsensusTime } from './consensusTime'
import WaitQueue from 'wait-queue'
import AsyncLock from 'async-lock'

const TOLERANCE = 10
const CLAIMED_TOLERANCE = 60
const TIMEOUT = 5000

export interface TopicEvents {
    'peerAdded': (peerID: string) => void
    'peerRemoved': (peerID: string) => void
    'publishReceivedTime': (eventID: string, time: number) => void
    'peerUpdate': (peerID: string, prevLength: number, newLength: number) => void
    'syncEventStart': (peerID: string, index: number, receivedTime: number | null) => void
    'syncCompleted': (peerID: string, lastIndex: number) => void
    'syncFatalError': (
            peerID: string,
            error: VerificationResult | HeaderVerificationError | PayloadVerificationResult | SyncError) => void
    'syncEventResult': (
            peerID: string,
            eventID: string | null,
            headerResult: VerificationResult | HeaderVerificationError | SyncError) => void
    'syncPayloadResult': (peerID: string, eventID: string, payloadResult: PayloadVerificationResult) => void
    'syncDuplicateEvent': (
            peerID: string,
            eventID: string,
            index: number,
            prevIndex: number | undefined) => void
    'syncEventReceivedTime': (peerID: string, eventID: string, received: number) => void
    'timelineAddEvent': (eventID: string, time: number, consensusTime: number) => void
    'timelineRemoveEvent': (eventID: string, prevTime: number, consensusTime: number) => void
    'timelineRejectedEvent': (eventID: string, claimedTime: number, consensusTime: number) => void
    'consensusTimeChanged': (eventID: string, prevTime: number, newTime: number) => void
}

/**
 * @typedef FeedEventHeader Our main Event type
 * @property {string} eventType Event type
 * @property {number} claimed Time the event author claims
 * @property {RLNGFullProof} proof RLN proof for this event
 * @property {string} payloadHash Hash of payload
 */
export interface FeedEventHeader {
    eventType: string
    claimed: number
    proof: RLNGFullProof
    payloadHash: string
}

/**
 * @typedef LogEntry An entry in our event log hypercore
 * @property {number} oldestIndex Index of the oldest still valid block
 * @property {number} received Timestamp in seconds
 * @property {string} header The event's Header
 */
export interface LogEntry {
    oldestIndex: number
    received: number
    header: FeedEventHeader
}

/**
 * @typedef LogAppendEvent An update from a peer
 * @property {number} fromIndex First index appended
 * @property {number} toIndex Next index that hasn't been used
 * @property {string} timestamp When we received this update
 */
export type LogAppendEvent = {
    fromIndex: number
    toIndex: number // NON inclusive
    timestamp: number | null
}

/**
 * @typedef NullifierSpec Spec for a nullifier
 * @property {number} epoch Epoch length in seconds
 * @property {number} messageLimit Message limit per epoch
 */
export interface NullifierSpec {
    epoch: number
    messageLimit: number
}

export enum SyncError {
    DUPLICATE_ENTRY
}

enum QueueControl {
    STOP
}

interface EventMetadata {
    payloadInvalid: boolean // Do not try to fetch the payload again. It's invalid.
    index: number // Index on own hypercore
    received: number // Time received for us
    claimed: number // Time the event was supposedly produced
    consensus: number
    membersReceived: Map<string, number> // peerID => time received
}

export interface PeerData {
    id: string // PeerID
    events: Map<string, number> // All events we obtained from this peer => index on core
    knownLength: number // Current length of feed core
    eventLog: Hypercore
    drive: Hyperdrive
    logUpdateQueue: WaitQueue<LogAppendEvent | QueueControl.STOP>,
    _onappend: () => Promise<void>
}

export enum PayloadVerificationResult {
    VALID,
    UNAVAILABLE,
    SIZE,
    HASH_MISMATCH,
    INVALID
}

export enum HeaderVerificationError {
    HASH_MISMATCH = 16, // Make sure we don't overlap with other enums
    UNKNOWN_EVENT_TYPE,
    UNEXPECTED_RLN_IDENTIFIER,
    UNEXPECTED_MESSAGE_LIMIT,
    UNEXPECTED_NULLIFIER,
    SIZE,
    UNAVAILABLE
}

interface Settings {
    expireEventsAfter: number // Events older than this will be subject to deletion by the GC
    minEventsBeforeGC: number // The GC will only delete events as long as there are more events than this
}

/**
 * Decentralized Multi-writer event feed for a `topic`
 * with timestamps based on local consensus
 * and rate limiting through RLN
 */
export class Lambdadelta extends TypedEmitter<TopicEvents> {
    private corestore: Corestore
    public topic: string

    // RLN
    protected rln: RLN

    private timeline: Timeline

    private eventLog: Hypercore // Event Log Hypercore
    protected drive: Hyperdrive // Hyperdrive

    protected nullifierSpecs: Map<string, NullifierSpec[]>
    protected maxPayloadSize: Map<string, number>

    private eventMetadata: Map<string, EventMetadata> // EventID => Metadata
    private peers: Map<string, PeerData> // peerID => Hypercore
    private pendingPeers: Set<string>

    private eventHeaders: Map<string, FeedEventHeader> // EventID => Header

    protected nullifierRegistry: NullifierRegistry
    private logReloaded: boolean

    private lock = new AsyncLock()

    protected settings: Settings

    constructor(topic: string, corestore: Corestore, rln: RLN,
        settings: Settings = {
            expireEventsAfter: 86400,
            minEventsBeforeGC: 0
        }) {
        super()
        this.topic = topic
        this.rln = rln
        this.settings = settings

        this.peers = new Map()
        this.pendingPeers = new Set()
        this.nullifierSpecs = new Map()
        this.eventMetadata = new Map()
        this.maxPayloadSize = new Map()
        this.eventHeaders = new Map()

        this.timeline = new Timeline()
        this.logReloaded = false

        this.corestore = corestore.namespace('lambdadelta').namespace(topic)
        this.eventLog = this.corestore.get({ name: `eventLog` })
        this.drive = new Hyperdrive(this.corestore.namespace('drive'))

        this.nullifierRegistry = new NullifierRegistry(this.corestore, this)

        this.registerTypes()
    }

    protected async onEventGarbageCollected(eventID: string) {
        await this.deleteEventResources(eventID)
    }

    protected async markEventsForDeletion() {
        
        const oldestTimeAllowed = getTimestampInSeconds() - this.settings.expireEventsAfter
        const eventsToDelete = new Set<string>()
        for (let [_, eventID] of this.timeline.getEvents(0, oldestTimeAllowed)) {
            // Only reduce to the minimum size
            if (this.timeline.getSize() < this.settings.minEventsBeforeGC) {
                break
            }
            eventsToDelete.add(eventID)
            await this.onEventGarbageCollected(eventID)
        }
        return eventsToDelete
    }

    protected async sweepMarkedEvents(markedEvents: Set<string>, previousOldestIndex: number) {
        let newOldestIndex = previousOldestIndex
        for (let i = newOldestIndex; i < this.eventLog.length; i++) {
            let entryBuf: Buffer
            try {
                entryBuf = await this.eventLog.get(i, {timeout: TIMEOUT})
            } catch (e) {
                continue
            }
            const entry = deserializeLogEntry(entryBuf)
            const eventID = entry.header.proof.signal

            newOldestIndex = i
            // Stop as soon as we find the first event that is not to be deleted yet
            if (!markedEvents.has(eventID)) {
                break
            }
            markedEvents.delete(eventID)
        }

        return {previousOldestIndex, newOldestIndex}
    }

    protected async clearSweptEvents(sweepStartIndex: number, oldestIndex: number) {
        await this.eventLog.clear(sweepStartIndex, oldestIndex)
    }

    protected async deleteEventResources(eventID: string) {
        const res = await this.getEventResources(eventID)
        for (let path of res) {
            this.drive.del(path)
        }
    }

    protected async getEventResources(eventID: string) {
        return [`/events/${eventID}/payload`]
    }

    protected registerTypes() {
        const spec: NullifierSpec = {
            epoch: 1,
            messageLimit: 1
        }
        this.addEventType("POST", [spec, spec], 4096)
    }

    public getNullifierSpecs(eventType: string) {
        return this.nullifierSpecs.get(eventType)
    }

    protected async onTimelineAdd(eventID: string, time: number, consensusTime: number) {
        this.emit('timelineAddEvent', eventID, time, consensusTime)
    }

    protected async onTimelineRemove(eventID: string, time: number, consensusTime: number) {
        this.emit('timelineRemoveEvent', eventID, time, consensusTime)
    }

    public async ready() {
        await this.eventLog.ready()
        await this.drive.ready()
        await this.reloadEventLog()
    }

    public hasPeer(peerID: string) {
        return this.peers.has(peerID)
    }

    public getPeerList() {
        return Array.from(this.peers.keys())
    }
    
    /**
     * Get the IDs of the cores backing this instance
     * @returns [logCore, driveCore]
     */
    public getCoreIDs(): [string, string] {
        return [this.eventLog.key!.toString('hex'), this.drive.key.toString('hex')]
    }

    public async getCoreLength(): Promise<number> {
        await this.eventLog.ready()
        return this.eventLog.length
    }

    public async close() {
        for (let [_, peer] of this.peers) {
            peer.eventLog.removeListener('append', peer._onappend)
        }
        for (let [_, peer] of this.peers) {
            await peer.drive.close()
            await peer.eventLog.close()
        }
    }

    private async getOldestIndex(eventLog: Hypercore) {
        if (eventLog.length == 0) {
            return 0
        }
        // Find the first valid entry
        const lastEntryBuf: Buffer = await eventLog.get(eventLog.length - 1, {timeout: TIMEOUT})
        const lastEntry = deserializeLogEntry(lastEntryBuf)
        return lastEntry.oldestIndex
    }

    /**
     * Add a new peer to this topic feed and synchronize
     * @param peerID ID of this peer
     * @param logCoreID ID of this peer's event log core which contains `received` times
     * @param driveID ID of this peer's Hyperdrive which contains the event headers and payload
     * @returns Whether or not the synchronization the peer was added and synced
     */
    public async addPeer(peerID: string, logCoreID: string, driveID: string) {
        if (this.peers.has(peerID) || this.pendingPeers.has(peerID)) {
            // Peer already added
            return false
        }
        this.pendingPeers.add(peerID)
        const drive = new Hyperdrive(this.corestore, b4a.from(driveID, 'hex'))
        await drive.ready()

        const logCore = this.corestore.get(b4a.from(logCoreID, 'hex'))
        await logCore.ready()
        await logCore.update({wait: true})
        this.emit('peerUpdate', peerID, -1, logCore.length)

        const peer = {
            id: peerID,
            eventLog: logCore,
            drive,
            events: new Map(),
            knownLength: logCore.length,
            logUpdateQueue: new WaitQueue<LogAppendEvent>(),
            _onappend: async () => {
                this.enqueueEventLogUpdate(peer)
            }
        }
        
        logCore.on('append', peer._onappend)
        this.peers.set(peerID, peer)
        this.pendingPeers.delete(peerID)
        this.emit('peerAdded', peerID)

        const firstIndex = await this.getOldestIndex(peer.eventLog)
        await this.processLogUpdate(peer, 
            {
                fromIndex: firstIndex,
                toIndex: logCore.length,
                timestamp: null
            })
        this.processLogUpdateQueue(peer).catch((e)=> console.error(e))
        return true
    }

    public async removePeer(peerID: string) {
        const peer = this.peers.get(peerID)
        if (!peer) {
            // Peer does not exist
            return false
        }
        peer.eventLog.removeListener('append', peer._onappend)
        this.peers.delete(peerID)
        // await peer.drive.close() TODO: investigate issues
        await peer.eventLog.close()
        // Remove peer's received timestamps contributions
        for (let [eventID, _] of peer.events) {
            const eventMetadata = this.eventMetadata.get(eventID)
            if (!eventMetadata) {
                continue
            }
            eventMetadata.membersReceived.delete(peerID)
            this.eventMetadata.set(eventID, eventMetadata)
            await this.onMemberReceivedTime(eventID)
        }
        this.emit('peerRemoved', peerID)
        peer.logUpdateQueue.push(QueueControl.STOP)
        return true
    }

    /**
     * Called on an `append` event from a peer's event log.
     * This records when the new log entries were added immediately,
     * ensuring we don't wait until we get to synchronize that event.
     * This allows us to establish reliable `received` times.
     * @param peerID The peer we received an update from
     */
    private enqueueEventLogUpdate(peer: PeerData) {
        const currentTime = getTimestampInSeconds()

        peer.logUpdateQueue.push({
            fromIndex: peer.knownLength,
            toIndex: peer.eventLog.length,
            timestamp: currentTime,
        })
        this.emit('peerUpdate', peer.id, peer.knownLength, peer.eventLog.length)

        peer.knownLength = peer.eventLog.length
    }

    /**
     * Wait for a peer's new log entries and processes them
     * @param peerID 
     * @param peer 
     * @returns 
     */
    private async processLogUpdateQueue(peer: PeerData) {
        while (true) {
            const update = await peer.logUpdateQueue.shift()
            if (update == QueueControl.STOP) return

            if (!await this.processLogUpdate(peer, update)) {
                return
            }
        }
    }

    private async processLogUpdate(peer: PeerData, update: LogAppendEvent) {
        for (let i = update.fromIndex; i < update.toIndex; i++) {
            const result = await this.syncEntry(peer, i, update.timestamp)
            
            if (!await this.onSyncResult(peer, result)) {
                // Stop processing events from this peer in case of a fatal error
                return false
            }
        }
        this.emit('syncCompleted', peer.id, update.toIndex - 1)
        return true
    }

    private async onSyncResult(
        peer: PeerData,
        {eventID, code, payloadCode}: {
            eventID: string | null,
            code: VerificationResult | HeaderVerificationError | SyncError,
            payloadCode?: PayloadVerificationResult}) {
        if (!this.onLogEntrySyncResult(peer, eventID, code)) {
            return false
        }
        if (payloadCode !== undefined && !this.onPayloadSyncResult(peer, eventID!, payloadCode)) {
            return false
        }
        if (code === VerificationResult.VALID && payloadCode === PayloadVerificationResult.VALID) {
            await this.onEventSyncComplete(peer, eventID!)
        }
        return true
    }

    protected async onEventSyncComplete(peer: PeerData, eventID: string) {

    }

    /**
     * Called whenever an event has been processed.
     * Should decide what course of action to take, up to and including
     * removing and banning the peer responsible if the event was invalid.
     * @param peer The peer responsible for sending us this event
     * @param headerResult The result of the event header verification process
     * @returns True if we should continue, false if we are to stop altogether
     */
    protected onLogEntrySyncResult(peer: PeerData, eventID: string | null, result: VerificationResult | HeaderVerificationError | SyncError): boolean {
        this.emit('syncEventResult', peer.id, eventID, result)
        if (result !== VerificationResult.VALID) {
            this.removePeer(peer.id)
            this.emit('syncFatalError', peer.id, result)
            return false
        }
        return true
    }

    protected onPayloadSyncResult(peer: PeerData, eventID: string, result: PayloadVerificationResult) {
        this.emit('syncPayloadResult', peer.id, eventID, result)
        if (result !== PayloadVerificationResult.VALID && result !== PayloadVerificationResult.UNAVAILABLE) {
            this.removePeer(peer.id)
            this.emit('syncFatalError', peer.id, result)
            return false
        }
        return true
    }

    /**
     * Called whenever we find the same event twice in a peer's event feed.
     * It verifies whether the event is actually stored twice in the peer's feed,
     * then takes appropriate action.
     * @param peerID The peer responsible
     * @param eventID The ID of the event
     * @param index The last index we found this event at
     * @param prevIndex The previous index we found this event at
     * @returns false if the verification succeeds, to stop syncing events from this peer
     */
    protected async onDuplicateInput(
            peerID: string,
            peer: PeerData,
            eventID: string,
            index: number,
            prevIndex: number | undefined) {
        if (index === prevIndex && index !== undefined && prevIndex !== undefined) {
            throw new Error("Scanned same index entry twice")
        }
        if (prevIndex === undefined) {
            throw new Error("Index confusion")
        }

        const entryBufA: Buffer = await peer.eventLog.get(prevIndex, {timeout: TIMEOUT})
        const entryA = deserializeLogEntry(entryBufA)

        const entryBufB: Buffer = await peer.eventLog.get(index, {timeout: TIMEOUT})
        const entryB = deserializeLogEntry(entryBufB)

        if (entryA.header.proof.signal == entryB.header.proof.signal) {
            this.emit('syncDuplicateEvent', peerID, eventID, index, prevIndex)
            return true
        }

        return true
    }

    private async reloadEventLog() {
        if (this.logReloaded) return
        this.logReloaded = true

        if (this.eventLog.length == 0) return

        const oldestIndex = await this.getOldestIndex(this.eventLog)
        for (let i = oldestIndex; i < this.eventLog.length; i++) {
            const entryBuf = await this.eventLog.get(i, {timeout: TIMEOUT})
            const entry = deserializeLogEntry(entryBuf)
            const eventID = entry.header.proof.signal
            this.eventHeaders.set(eventID, entry.header)
            const eventMetadata = {
                payloadInvalid: false,
                index: i,
                received: entry.received,
                consensus: -1,
                claimed: entry.header.claimed,
                membersReceived: new Map()
            }
            this.eventMetadata.set(eventID, eventMetadata)

            await this.onMemberReceivedTime(eventID)
        }
    }

    /**
     * Synchronizes an individual entry from a peer's feed hypercore
     * @param peerID ID of the peer
     * @param i index of this entry on the hypercore
     * @param timeReceived When we received this event. `null` if it was already present
     * @returns boolean indicating whether we should continue synchronizing events from this peer or stop
     */
    private async syncEntry(
            peer: PeerData,
            i: number,
            timeReceived: number | null
        ): Promise<{ code: VerificationResult | HeaderVerificationError | SyncError, payloadCode?: PayloadVerificationResult, eventID: string | null} > {
        const peerID = peer.id

        this.emit('syncEventStart', peerID, i, timeReceived)
        
        let entryBuf: Buffer
        try {
            entryBuf = await peer.eventLog.get(i, {timeout: TIMEOUT})
        } catch (e) {
            return { code: HeaderVerificationError.UNAVAILABLE, eventID: null }
        }

        const entry = deserializeLogEntry(entryBuf)
        const eventID = entry.header.proof.signal

        const headerResult = await this.insertEventHeader(entry.header)
        if (headerResult !== VerificationResult.VALID) {
            return { code: headerResult, eventID }
        }

        const payloadCode = await this.syncPayload(peer, entry.header)

        let eventMetadata = this.eventMetadata.get(eventID)
        if (!eventMetadata) { // Is a new event
            eventMetadata = {
                payloadInvalid: false,
                index: -1,
                received: -1,
                consensus: -1,
                claimed: entry.header.claimed,
                membersReceived: new Map()
            }
            this.eventMetadata.set(eventID, eventMetadata)
            /**
             * We use the time we actually received this update from our peer
             * if event was received live, not from an initial peer sync
             */
            if (timeReceived) {
                // If our peer's received time is close to our current time, use their time
                // This makes it harder to tell who first saw an event
                eventMetadata.received = (Math.abs(timeReceived - entry.received) <= TOLERANCE)
                                                ? entry.received : timeReceived
                const index = await this.publishReceived(eventID, eventMetadata.received)
                eventMetadata.index = index
            }

        } else if (eventMetadata.membersReceived.has(peerID)) {
            if (await this.onDuplicateInput(peerID, peer, eventID, i, peer.events.get(eventID))) {
                return { code: SyncError.DUPLICATE_ENTRY, eventID, payloadCode }
            }
        }

        // Add peer's received timestamp
        this.emit('syncEventReceivedTime', peerID, eventID, entry.received)
        eventMetadata.membersReceived.set(peerID, entry.received)
        peer.events.set(eventID, i)

        await this.onMemberReceivedTime(eventID)

        // Make sure we do not fetch this again if it's invalid
        if (payloadCode === PayloadVerificationResult.INVALID) {
            eventMetadata.payloadInvalid == true
        }
    
        return {code: VerificationResult.VALID, eventID, payloadCode}
    }

    /**
     * Download and verify the payload attached to a particular event
     * @param peerID The peer we received this event from
     * @param eventID ID of the event
     * @param eventType Type of the event
     * @param payloadHash Expected hash of the payload
     * @returns Result of the verification process
     */
    private async syncPayload(
            peer: PeerData,
            eventHeader: FeedEventHeader,
            ): Promise<PayloadVerificationResult> {
        
        const eventID = eventHeader.proof.signal
        const event = this.eventMetadata.get(eventID)
        if (event?.payloadInvalid) {
            // Do not bother refetching
            PayloadVerificationResult.UNAVAILABLE
        }
        // Skip payload if it exists already
        if (await this.drive.entry(`/events/${eventID}/payload`)) {
            return PayloadVerificationResult.VALID
        }
        const entry = await peer.drive.entry(`/events/${eventID}/payload`)
        if (!entry) {
            return PayloadVerificationResult.UNAVAILABLE 
        }
        if (entry.value.blob.byteLength > this.maxPayloadSize.get(eventHeader.eventType)!) {
            return PayloadVerificationResult.SIZE 
        }

        const payloadBuf = await peer.drive.get(`/events/${eventID}/payload`)
        if (!payloadBuf) {
            return PayloadVerificationResult.UNAVAILABLE 
        }
        if (payloadBuf.length > this.maxPayloadSize.get(eventHeader.eventType)!) {
            return PayloadVerificationResult.SIZE 
        }
        const hash = crypto.createHash('sha256').update(payloadBuf).digest('hex')
        if (hash !== eventHeader.payloadHash) {
            return PayloadVerificationResult.HASH_MISMATCH 
        }

        if (!(await this.validatePayload(eventID, eventHeader.eventType, payloadBuf))){
            return PayloadVerificationResult.INVALID
        }

        await this.drive.put(`/events/${eventID}/payload`, payloadBuf)

        return PayloadVerificationResult.VALID
    }

    /**
     * Validates the data inside an event's attached payload Buffer
     * (To be overridden by an application using this library).
     * @param eventID ID of the event
     * @param eventType Type of the event
     * @param buf Payload buffer
     * @returns boolean indicating the result of the verification process
     */
    protected async validatePayload(eventID: string, eventType: string, buf: Buffer) {
        return true
    }

    /**
     * Publish our `received` time for an event
     * @param eventID ID of the event
     * @param received The time we claim to have received said event
     * @returns The index of the resulting feed entry for this event
     */
    private async publishReceived(eventID: string, received: number) {
        const prevOldestIndex = await this.getOldestIndex(this.eventLog)
        const marked = await this.markEventsForDeletion()
        const {newOldestIndex} = await this.sweepMarkedEvents(marked, prevOldestIndex)

        const eventMetadata = this.eventMetadata.get(eventID)
        if (eventMetadata && eventMetadata.index !== -1) {
            throw new Error("Trying to publish received time twice")
        }
        const header = this.eventHeaders.get(eventID)
        if (!header) {
            throw new Error("Header unavailable")
        }
        try {
            await this.eventLog.ready()
            const {length, byteLength} = await this.eventLog.append(serializeLogEntry({
                header,
                received: received,
                oldestIndex: newOldestIndex
            }))
            this.emit('publishReceivedTime', eventID, received)
            await this.clearSweptEvents(prevOldestIndex, newOldestIndex)
            return length - 1
        } catch (e) {
            console.error("ERROR", e)
            throw e
        }
    }

    /**
     * To be called whenever we add another peer's `received` time to an event
     * It recalculates our consensus timestamp and then acts appropriately
     * @param eventID The event's ID
     */
    private async onMemberReceivedTime(eventID: string) {
        const eventMetadata = this.eventMetadata.get(eventID)
        if (!eventMetadata) {
            throw new Error("Event not found")
        }
        const collectedTimestamps = Array.from(eventMetadata.membersReceived.values())
        // If we have a received time of our own
        if (eventMetadata.index !== -1) {
            // Add our contribution
            collectedTimestamps.push(eventMetadata.received)
        }
        const totalPeers = this.peers.size
            + (eventMetadata.index !== -1 ? 1 : 0) // Adding our own timestamp if it's been published
        const consensusTime = calculateConsensusTime(collectedTimestamps, totalPeers)

        if (consensusTime == -1) {
            return
        }

        if (eventMetadata.consensus !== consensusTime) {
            this.emit('consensusTimeChanged', eventID, eventMetadata.consensus, consensusTime)
            eventMetadata.consensus = consensusTime
            this.eventMetadata.set(eventID, eventMetadata)
        }

        // We have not yet published a received time
        if (eventMetadata.index == -1) {
            const index = await this.publishReceived(eventID, consensusTime)
            eventMetadata.received = consensusTime
            eventMetadata.index = index
            this.eventMetadata.set(eventID, eventMetadata)
        }

        // Message is determined to have been published at a false claimed time
        // if the consensus time differs too much from claimed time
        if (Math.abs(eventMetadata.claimed - consensusTime) > CLAIMED_TOLERANCE) {
            // Remove from timeline
            const prevTime = this.timeline.unsetTime(eventID)
            if (prevTime) {
                const roundedTime = Math.floor(prevTime / 1000)
                await this.onTimelineRemove(eventID, roundedTime, consensusTime)
            } else {
                this.emit('timelineRejectedEvent', eventID, eventMetadata.claimed, consensusTime)
            }
            return
        }

        const currentEventTime = this.timeline.getTime(eventID)
        // Event is not in timeline yet
        if (!currentEventTime) {
            this.timeline.setTime(eventID, eventMetadata.claimed)
            await this.onTimelineAdd(eventID, eventMetadata.claimed, consensusTime)
        }
    }

    /**
     * Calculates the hash for an event header.
     * This is used as the ID for events.
     * @param event Header for this event
     * @returns The `eventID`
     */
    private getEventHash(event: FeedEventHeader) {
        return crypto.createHash('sha256')
            .update(this.topic)
            .update(event.eventType)
            .update(event.claimed.toString())
            .update(event.payloadHash)
            .digest('hex')
    }

    /**
     * Verifies an event header; if valid, it is added to our store. 
     * @param event Header of an event
     * @returns Enum indicating the verification result
     */
    private async insertEventHeader(event: FeedEventHeader) {
        if (this.eventHeaders.get(event.proof.signal)) {
            // Already verified it previously
            return VerificationResult.VALID
        }

        const eventID = this.getEventHash(event)

        const proof = event.proof
        if (proof.signal !== eventID) {
            return HeaderVerificationError.HASH_MISMATCH
        }
        if (proof.rlnIdentifier !== rlnIdentifier(this.topic, event.eventType)) {
            return HeaderVerificationError.UNEXPECTED_RLN_IDENTIFIER
        }
        const specs = this.nullifierSpecs.get(event.eventType)
        if (!specs) {
            return HeaderVerificationError.UNKNOWN_EVENT_TYPE
        }
        for (let i = 0; i < specs.length; i++) {
            if (proof.externalNullifiers[i].messageLimit
                !== specs[i].messageLimit) {
                return HeaderVerificationError.UNEXPECTED_MESSAGE_LIMIT
            }

            if (proof.externalNullifiers[i].nullifier
                !== getEpoch(specs[i].epoch, event.claimed).toFixed(0)) {
                return HeaderVerificationError.UNEXPECTED_NULLIFIER
            }
        }
        const result = await this.rln.submitProof(proof, event.claimed)
        if (result === VerificationResult.VALID) {
            this.eventHeaders.set(event.proof.signal, event)
        }
        return result
    }

    /**
     * Register a new event type for this feed 
     * @param eventType Name for this type
     * @param specs Specifications for the nullifiers used in this event
     * @param maxPayloadSize Maximum size for the attached payload buffer
     */
    public addEventType(eventType: string, specs: NullifierSpec[], maxPayloadSize: number) {
        this.nullifierSpecs.set(eventType, specs)
        this.maxPayloadSize.set(eventType, maxPayloadSize)
    }

    /**
     * Public API for the publication of a new event
     * @param eventID ID for this event
     * @param header Event header
     * @param payload Buffer containing the event's payload payload
     */
    public async addEvent(eventID: string, header: FeedEventHeader, payload: Buffer) {
        if (!(await this.validatePayload(eventID, header.eventType, payload))) {
            return { result: false, eventID }
        }
        await this.drive.put(`/events/${eventID}/payload`, payload)
        const result = await this.insertEventHeader(header)
        if (result == VerificationResult.VALID) {
            let eventMetadata = this.eventMetadata.get(eventID)
            if (eventMetadata) {
                throw new Error("Event already exists")
            }

            eventMetadata = {
                payloadInvalid: false,
                index: -1,
                received: header.claimed,
                consensus: -1,
                claimed: header.claimed,
                membersReceived: new Map()
            }
            this.eventMetadata.set(eventID, eventMetadata)
            const index = await this.publishReceived(eventID, header.claimed)
            eventMetadata.index = index
            this.timeline.setTime(eventID, header.claimed)
            await this.onTimelineAdd(eventID, header.claimed, -1)
        }
        return { result, eventID }
    }

    public isEventInTimeline(eventID: string) {
        return !!this.timeline.getTime(eventID)
    }

    /**
     * Public API for the creation and publication of a new event
     * @param eventType Type for this event
     * @param payload Buffer containing the event's payload payload
     * @returns Enum indicating the result of the process.
     */
    public async newEvent(eventType: string, payload: Buffer) {
        const nullifiers = await this.nullifierRegistry.createNullifier(eventType)
        const [eventHeader, eventID] = await createEvent(this.rln, this.topic, eventType, nullifiers, payload)
        return await this.addEvent(eventID, eventHeader, payload)
    }

    /**
     * Fetch a particular event by its `eventID`
     * @param eventID ID of the event
     * @returns Event data or `null` if the event is not available
     */
    public async getEventByID(eventID: string) {
        const eventHeader = this.eventHeaders.get(eventID)
        const payloadBuf = await this.drive.get(`/events/${eventID}/payload`)
        if (!payloadBuf || !eventHeader) return null
        return {header: eventHeader, payload: payloadBuf}
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
        ): Promise<{
            header: FeedEventHeader,
            payload: Buffer
        }[]> {
            const events = (await Promise.all(this.timeline.getEvents(startTime, endTime, maxLength, true)
                    .map(async ([time, eventID]) => await this.getEventByID(eventID))))
                    .filter(e => e != null)
            return events as {
                header: FeedEventHeader,
                payload: Buffer
            }[]
    }
}