import BTree from 'sorted-btree'
import b4a from 'b4a'
import Hyperdrive from 'hyperdrive'
import crypto from 'crypto'
import { TypedEmitter } from 'tiny-typed-emitter'
import { Delta, Lambda, RLNGFullProof, VerificationResult, nullifierInput } from 'bernkastel-rln'
import { deserializeEvent, deserializeFeedEntry, getEpoch, getEpochRange, getMean, getStandardDeviation, getTimestampInSeconds, serializeEvent, serializeFeedEntry } from './utils'

const TOLERANCE = 10
const CLAIMED_TOLERANCE = 60
const TIMEOUT = 5000
const QUORUM = 66/100

/**
 * @typedef FeedEventHeader Our main Event type
 * @property {string} eventType Event type
 * @property {number} claimed Time the event author claims
 * @property {RLNGFullProof} proof RLN proof for this event
 * @property {string} contentHash Hash of content
 */
export interface FeedEventHeader {
    eventType: string
    claimed: number
    proof: RLNGFullProof
    contentHash: string
}

/**
 * @typedef FeedEntry An entry in our feed hypercore
 * @property {number} oldestIndex Index of the oldest still valid block
 * @property {number} received Timestamp in seconds
 * @property {string} eventID The event's ID
 */
export interface FeedEntry {
    received: number
    oldestIndex: number
    eventID: string
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

interface TopicEvents {
    'peerAdded': (memberCID: string) => void
    'publishReceivedTime': (eventID: string, time: number) => void
    'eventSyncResult': (memberCID: string, result: boolean | VerificationResult) => void
    'eventSyncTimestamp': (memberCID: string, eventID: string, received: number) => void
    'eventTimelineAdd': (eventID: string, time: number, consensusTime: number) => void
    'eventTimelineRemove': (eventID: string, prevTime: number, consensusTime: number) => void
    'eventTimelineRejected': (eventID: string, claimedTime: number, consensusTime: number) => void
    'consensusTimeChanged': (eventID: string, prevTime: number, newTime: number) => void
}

interface EventMetadata {
    index: number // Index on own hypercore
    received: number // Time received for us
    claimed: number // Time the event was supposedly produced
    consensus: number
    membersReceived: Map<string, number> // MemberCID => time received
}

interface PeerData {
    lastIndex: number // Last index we scanned
    events: Map<string, number> // All events we obtained from this peer => index on core
    feedCore: any
    drive: any
}

/**
 * Decentralized Multi-writer event feed on a `topic`
 * with timestamps based on local consensus
 * and rate limiting through RLN
 */
export class Lambdadelta extends TypedEmitter<TopicEvents> {
    private corestore: any
    public topic: string

    // RLN
    private lambda: Lambda
    private delta: Delta

    private timeline: BTree<number, string> // Timestamp (ms) => EventID
    private eidTime: Map<string, number> // EventID => Timestamp (ms)

    private core: any // Hypercore
    private drive: any // Hyperdrive
    private oldestIndex: number // Our oldest valid event index

    protected nullifierSpecs: Map<string, NullifierSpec[]>
    protected maxContentSize: Map<string, number>

    private eventMetadata: Map<string, EventMetadata> // EventID => Metadata
    private peers: Map<string, PeerData> // MemberCID => Hypercore

    constructor(topic: string, corestore: any, lambda: Lambda, delta: Delta) {
        super()
        this.topic = topic
        this.lambda = lambda
        this.delta = delta
        this.oldestIndex = 0

        this.timeline = new BTree()
        this.peers = new Map()
        this.eidTime = new Map()
        this.nullifierSpecs = new Map()
        this.eventMetadata = new Map()
        this.maxContentSize = new Map()

        this.corestore = corestore.namespace('lambdadelta')
        this.core = this.corestore.get({ name: topic })
        this.drive = new Hyperdrive(this.corestore)
    }

    /**
     * Sets an event's timestamp in the internal timeline
     * @param time The event's timestamp in seconds
     * @param eventID The event's ID
     * @returns The previously saved timestamp (ms), or undefined
     */
    private setTime(eventID: string, time: number) {
        const prevTime = this.eidTime.get(eventID)
        if (prevTime) { // Already existing key
            if (!this.timeline.delete(prevTime)){
                throw new Error("Key was missing from timeline")
            }
        }
        let newTime = time * 1000 // Convert to ms
        while(!this.timeline.setIfNotPresent(newTime, eventID)) {
            // Keep trying with a newer time until we find an empty spot
            newTime++
        }
        this.eidTime.set(eventID, newTime)
        return prevTime
    }

    private unsetTime(eventID: string) {
        const prevTime = this.eidTime.get(eventID)
        if (prevTime) { // Already existing key
            if (!this.timeline.delete(prevTime)){
                throw new Error("Key was missing from timeline")
            }
        }
        this.eidTime.delete(eventID)
        return prevTime
    }

    public getCoreIDs(): [string, string] {
        return [this.core.key.toString('hex'), this.drive.key.toString('hex')]
    }
    public async getCoreLength(): Promise<number> {
        await this.core.ready()
        return this.core.length
    }

    public async addPeer(memberCID: string, feedCoreID: string, driveID: string) {
        if (this.peers.has(memberCID)) {
            // Peer already added
            return false
        }
        const feedCore = this.corestore.get(b4a.from(feedCoreID, 'hex'))
        const drive = new Hyperdrive(this.corestore, b4a.from(driveID, 'hex'))
        await feedCore.ready()
        await drive.ready()
        this.peers.set(memberCID, {
            feedCore,
            drive,
            lastIndex: 0,
            events: new Map(),
        })
        this.emit('peerAdded', memberCID)
        await this.syncPeer(memberCID, true)

        // feedCore.on('append', async () => {
        //     await this.syncPeer(memberCID, false)
        // })
    }

    private async syncPeer(memberCID: string, initialSync: boolean) {
        const peer = this.peers.get(memberCID)
        if (!peer) {
            throw new Error("Unknown peer")
        }
        const feedCore = peer.feedCore
        await feedCore.ready()
        if (feedCore.length < 1) {
            throw new Error("Peer core is empty")
        }
        let startFrom = peer.lastIndex

        if (initialSync) {
            const lastEntryBuf: Buffer = await feedCore.get(feedCore.length - 1, {timeout: TIMEOUT})
            const lastEntry = deserializeFeedEntry(lastEntryBuf)
            startFrom = lastEntry.oldestIndex
        }

        for (let i = startFrom; i < feedCore.length; i++) {
            console.log(i, memberCID)
            const entryBuf: Buffer = await feedCore.get(i, {timeout: TIMEOUT})
            const entry = deserializeFeedEntry(entryBuf)
            const eventID = entry.eventID

            let claimedTime: number | undefined
            let result
            if (!(await this.drive.entry(`/events/${eventID}/header`))) {
                // We never encountered this event before
                const eventHeaderBuf = await peer.drive.get(`/events/${eventID}/header`)
                const eventHeader = deserializeEvent(eventHeaderBuf)
                claimedTime = eventHeader.claimed
                result = await this.addEvent(eventHeader)
                await this.addContent(eventID, eventHeader.eventType, eventHeader.contentHash, peer)
                this.emit('eventSyncResult', memberCID, result)
            }

            let eventMetadata = this.eventMetadata.get(eventID)

            if (!eventMetadata) { // Is a new event
                if (result !== VerificationResult.VALID) {
                    // Skip invalid events
                    peer.lastIndex = i
                    this.peers.set(memberCID, peer)
                    continue
                }
                if (!claimedTime) {
                    throw new Error("Invalid claimed time")
                }
                eventMetadata = {
                    index: -1,
                    received: -1,
                    consensus: -1,
                    claimed: claimedTime,
                    membersReceived: new Map()
                }

                if (!initialSync) { // Event was received live, not from an initial peer sync
                    const currentTime = getTimestampInSeconds()
                    // If our peer's received time is close to our current time, use their time
                    // This makes it harder to tell who first saw an event
                    eventMetadata.received = (Math.abs(currentTime - entry.received) <= TOLERANCE)
                                        ? entry.received : currentTime
                    const index = await this.publishReceived(eventID, eventMetadata.received)
                    eventMetadata.index = index
                    this.eventMetadata.set(eventID, eventMetadata)
                }

            } else if (eventMetadata.membersReceived.has(memberCID)) {
                throw new Error(`Duplicate event sync from peer (index: ${i} prevIndex: ${peer.events.get(eventID)} peer: ${memberCID} event: ${eventID})`)
            }
            // Add peer's received timestamp
            this.emit('eventSyncTimestamp', memberCID, eventID, entry.received)
            eventMetadata.membersReceived.set(memberCID, entry.received)
            this.eventMetadata.set(eventID, eventMetadata)

            peer.events.set(eventID, i)
            peer.lastIndex = i
            this.peers.set(memberCID, peer)

            await this.updateMemberReceivedTime(eventID)
        }
    }

    private async addContent(eventID: string, eventType: string, contentHash: string, peer: PeerData) {
        const entry = await peer.drive.entry(`/events/${eventID}/content`)
        if (!entry) {
            return false
        }
        if (entry.value.blob.byteLength > this.maxContentSize.get(eventType)!) {
            return false
        }

        const contentBuf = await peer.drive.get(`/events/${eventID}/content`)
        if (contentBuf.length > this.maxContentSize.get(eventType)!) {
            return false
        }
        const hash = crypto.createHash('sha256').update(contentBuf).digest('hex')
        if (hash !== contentHash) {
            return false
        }
        await this.drive.put(`/events/${eventID}/content`, contentBuf)
        return true
    }

    private async publishReceived(eventID: string, received: number) {
        const eventMetadata = this.eventMetadata.get(eventID)
        if (eventMetadata && eventMetadata.index !== -1) {
            throw new Error("Trying to publish received time twice")
        }
        const {length, byteLength} = await this.core.append(serializeFeedEntry({
            eventID,
            received: received,
            oldestIndex: this.oldestIndex
        }))
        this.emit('publishReceivedTime', eventID, received)
        return length - 1
    }

    /**
     * To be called whenever we add another peer's `received` time to an event
     * @param eventID The event's ID
     */
    private async updateMemberReceivedTime(eventID: string) {
        const eventMetadata = this.eventMetadata.get(eventID)
        if (!eventMetadata) {
            throw new Error("Event not found")
        }
        const peers = eventMetadata.membersReceived.size 
            + (eventMetadata.index !== -1 ? 1 : 0) // Adding our own timestamp if it's been published
        const totalPeers = this.peers.size
            + (eventMetadata.index !== -1 ? 1 : 0) // Adding our own timestamp if it's been published

        if ((peers / totalPeers) < QUORUM) {
            // We do not have a quorum to decide on the correct time yet
            return
        }
        const receivedTimes = Array.from(eventMetadata.membersReceived.values())

        // If we have a received time of our own
        if (eventMetadata.index !== -1) {
            // Add our contribution
            receivedTimes.push(eventMetadata.received)
        }
        // Find the most common received time
        const occurrences: Map<number, number> = new Map()
        let maxOccurrences = 0
        let mostCommon = 0
        for (let received of receivedTimes) {
            const newAmount = (occurrences.get(received) || 0) + 1
            occurrences.set(received, newAmount)
            if (newAmount > maxOccurrences) {
                maxOccurrences = newAmount
                mostCommon = received
            }
        }
        let consensusTime
        // If we have a ~2/3rds majority for one timestamp, use it
        if ((maxOccurrences / peers) >= QUORUM) {
            consensusTime = mostCommon
        } else {
            // We filter the timestamps that are more than one std.dev away from the mean
            const stdDev = getStandardDeviation(receivedTimes)
            const rawMean = getMean(receivedTimes)
            const filteredTimes = receivedTimes.filter(n => Math.abs(rawMean - n) <= stdDev)
            // Only do this if we still end up with more than one timestamp
            if (filteredTimes.length > 1) {
                consensusTime = getMean(filteredTimes)
            } else {
                consensusTime = rawMean
            }
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
            const prevTime = this.unsetTime(eventID)
            if (prevTime) {
                const roundedTime = Math.floor(prevTime / 1000)
                this.emit('eventTimelineRemove', eventID, roundedTime, consensusTime)
            } else {
                this.emit('eventTimelineRejected', eventID, eventMetadata.claimed, consensusTime)
            }
            return
        }

        const currentEventTime = this.eidTime.get(eventID)
        // Event is not in timeline yet
        if (!currentEventTime) {
            this.setTime(eventID, eventMetadata.claimed)
            this.emit('eventTimelineAdd', eventID, eventMetadata.claimed, consensusTime)
        }
    }

    private getEventHash(event: FeedEventHeader) {
        return crypto.createHash('sha256')
            .update(event.eventType)
            .update(event.claimed.toString())
            .update(event.contentHash)
            .digest('hex')
    }

    private async verifyEvent(event: FeedEventHeader) {
        const proof = event.proof
        if (proof.rlnIdentifier !== this.topic) {
            return false
        }
        const specs = this.nullifierSpecs.get(event.eventType)
        if (!specs) {
            throw new Error("Unknown event type")
        }
        for (let i = 0; i < specs.length; i++) {
            if (proof.externalNullifiers[i].messageLimit
                !== specs[i].messageLimit) {
                return false
            }

            if (proof.externalNullifiers[i].nullifier
                !== `${getEpoch(specs[i].epoch, event.claimed)}|${event.eventType}`) {
                return false
            }
        }
        return await this.lambda.submitProof(proof, event.claimed)
    }

    private async addEvent(event: FeedEventHeader) {
        if (await this.drive.entry(`/events/${event.proof.signal}/header`)) {
            throw new Error("Event already added")
        }
        const eventID = this.getEventHash(event)
        if (event.proof.signal !== eventID) {
            return false
        }
        const result = await this.verifyEvent(event)
        if (result !== VerificationResult.VALID) {
            return result
        }

        const eventBuf = serializeEvent(event)
        await this.drive.put(`/events/${eventID}/header`, eventBuf)
        return result
    }

    private createNullifier(eventType: string): nullifierInput[] {
        const specs = this.nullifierSpecs.get(eventType)
        if (!specs) {
            throw new Error("Unknown event type")
        }
        const nulls: nullifierInput[] = []
        for (let spec of specs) {
            nulls.push({
                nullifier: `${getEpoch(spec.epoch)}|${eventType}`,
                messageLimit: spec.messageLimit,
                messageId: 1
            })
        }
        return nulls
    }

    private async createEvent(
            eventType: string,
            nullifiers: nullifierInput[],
            content: Buffer
        ): Promise<[FeedEventHeader, string]> {
        const claimed = getTimestampInSeconds()
        const contentHash = crypto.createHash('sha256')
            .update(content)
            .digest('hex')

        const eventID = crypto.createHash('sha256')
            .update(eventType)
            .update(claimed.toString())
            .update(contentHash)
            .digest('hex')

        const proof = await this.delta.createProof(eventID, nullifiers, this.topic)
        return [{
            eventType,
            proof,
            claimed,
            contentHash
        },
        eventID]
    }

    public addEventType(eventType: string, specs: NullifierSpec[], maxContentSize: number) {
        this.nullifierSpecs.set(eventType, specs)
        this.maxContentSize.set(eventType, maxContentSize)
    }
    
    public async newEvent(eventType: string, content: Buffer) {
        const [event, eventID] = await this.createEvent(eventType, this.createNullifier(eventType), content)
        await this.drive.put(`/events/${eventID}/content`, content)
        const result = await this.addEvent(event)
        if (result == VerificationResult.VALID) {
            let eventMetadata = this.eventMetadata.get(eventID)
            if (eventMetadata) {
                throw new Error("Event already exists")
            }
            
            eventMetadata = {
                index: -1,
                received: event.claimed,
                consensus: -1,
                claimed: event.claimed,
                membersReceived: new Map()
            }
            this.eventMetadata.set(eventID, eventMetadata)
            const index = await this.publishReceived(eventID, event.claimed)
            eventMetadata.index = index
            this.eventMetadata.set(eventID, eventMetadata)
            this.setTime(eventID, event.claimed)
        }
        return result
    }

    public async getEvents(startTime: number = 0, endTime?: number): Promise<Buffer[]> {
        endTime = endTime || this.timeline.maxKey()
        if (!endTime) return []
        let returns = []
        for (let [time, eventID] of this.timeline.getRange(startTime, endTime, true)) {
            const contentBuf: Buffer = await this.drive.get(`/events/${eventID}/content`)
            returns.push(contentBuf)
        }
        return returns
    }
}