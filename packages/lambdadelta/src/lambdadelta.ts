import BTree from 'sorted-btree'
import b4a from 'b4a'
import crypto from 'crypto'
import { TypedEmitter } from 'tiny-typed-emitter'
import { Delta, Lambda, RLNGFullProof, VerificationResult, nullifierInput } from 'bernkastel-rln'
import { deserializeEvent, getEpoch, getEpochRange, getTimestampInSeconds, serializeEvent } from './utils'

const TOLERANCE = 10

/**
 * @typedef FeedEvent Our main Event type
 * @property {string} eventType Event type
 * @property {number} oldestIndex Index of the oldest event we have
 * @property {number} received Timestamp in seconds
 * @property {number} claimed Time the event author claims
 * @property {RLNGFullProof} proof RLN proof for this event
 * @property {Buffer} content Event contents
 */
export interface FeedEvent {
    eventType: string
    received: number
    oldestIndex: number
    claimed: number
    proof: RLNGFullProof
    content: Buffer
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
    'eventSyncResult': (memberCID: string, result: false | VerificationResult) => void
}

interface EventMetadata {
    index: number, // Index on own hypercore
    received: number, // Time received for us
    membersReceived: Map<string, number> // MemberCID => time received
}

/**
 * Decentralized Multi-writer event feed on a `topic`
 * with timestamps based on local consensus
 * and rate limiting through RLN
 */
export class Lambdadelta extends TypedEmitter<TopicEvents> {
    private corestore: any
    public topic: string
    private peers: Map<string, any> // MemberCID => Hypercore
    private timeline: BTree<number, string> // Timestamp (ms) => EventID
    private eidTime: Map<string, number> // EventID => Timestamp (ms)
    private core: any
    private lambda: Lambda
    private delta: Delta
    private oldestIndex: number
    private eventMetadata: Map<string, EventMetadata> // EventID => Metadata
    protected nullifierSpecs: Map<string, NullifierSpec[]>

    constructor(topic: string, corestore: any, lambda: Lambda, delta: Delta) {
        super()
        this.corestore = corestore
        this.topic = topic
        this.peers = new Map()
        this.timeline = new BTree()
        this.eidTime = new Map()
        this.nullifierSpecs = new Map()
        this.eventMetadata = new Map()
        this.core = this.corestore
            .namespace('lambdadelta')
            .get({ name: topic })
        this.lambda = lambda
        this.delta = delta
        this.oldestIndex = 0
    }

    /**
     * Sets an event's timestamp in the internal timeline
     * @param time The event's timestamp in seconds
     * @param eventID The event's ID
     * @returns The previously saved timestamp (ms), or undefined
     */
    private setTime(time: number, eventID: string) {
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

    public getCoreID() {
        return this.core.key.toString('hex')
    }

    public async addPeer(memberCID: string, coreID: string) {
        if (this.peers.has(memberCID)) {
            // Peer already added
            return false
        }
        const core = this.corestore.get(b4a.from(coreID, 'hex'))
        this.peers.set(memberCID, core)
        this.emit('peerAdded', memberCID)
        await this.syncPeer(memberCID)
    }

    private async syncPeer(memberCID: string) {
        const core = this.peers.get(memberCID)
        if (!core) {
            throw new Error("Peer core not found")
        }
        await core.ready()
        const lastEventBuf: Buffer = await core.get(core.length - 1)
        const lastEvent = deserializeEvent(lastEventBuf)
        for (let i = lastEvent.oldestIndex; i < core.length; i++) {
            const eventBuf: Buffer = await core.get(i)
            const event = deserializeEvent(eventBuf)
            const eventID = this.getFeedEventContentHash(event)
            const eventMetadata = this.eventMetadata.get(eventID)
            if (!eventMetadata) {
                const result = await this.addEvent(event)
                this.emit('eventSyncResult', memberCID, result)
            } else if (eventMetadata.membersReceived.has(memberCID)) {
                throw new Error("Duplicate event sync from peer")
            } else {
                eventMetadata.membersReceived.set(memberCID, event.received)
            }
        }
    }

    private getFeedEventContentHash(event: FeedEvent) {
        return crypto.createHash('sha256')
            .update(event.eventType)
            .update(event.claimed.toString())
            .update(event.content)
            .digest('hex')
    }

    private async verifyEvent(event: FeedEvent) {
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

    private async addEvent(event: FeedEvent) {
        if (this.eventMetadata.has(event.proof.signal)) {
            throw new Error("Event already added")
        }
        const eventMetadata: EventMetadata = {
            index: 0,
            received: 0,
            membersReceived: new Map()
        }
        const eventID = this.getFeedEventContentHash(event)
        if (event.proof.signal !== eventID) {
            return false
        }
        const result = await this.verifyEvent(event)
        if (result !== VerificationResult.VALID) {
            return result
        }
        const currentTime = getTimestampInSeconds()
        // If our peer's received time is close to our current time, use their time
        // This makes it harder to tell who first saw an event
        event.received = (Math.abs(currentTime - event.received) <= TOLERANCE)
                            ? event.received : currentTime
        eventMetadata.received = event.received

        const {length, byteLength} = await this.core.append(serializeEvent(event))

        eventMetadata.index = length - 1
        this.eventMetadata.set(eventID, eventMetadata)
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
        ): Promise<FeedEvent> {
        const claimed = getTimestampInSeconds()
        const contentHash = crypto.createHash('sha256')
            .update(eventType)
            .update(claimed.toString())
            .update(content)
            .digest('hex')
        const proof = await this.delta.createProof(contentHash, nullifiers, this.topic)
        return {
            eventType,
            proof,
            claimed,
            received: claimed,
            oldestIndex: this.oldestIndex,
            content: content
        }
    }

    public addEventType(eventType: string, specs: NullifierSpec[]) {
        this.nullifierSpecs.set(eventType, specs)
    }
    
    public async newEvent(eventType: string, content: Buffer) {
        const event = await this.createEvent(eventType, this.createNullifier(eventType), content)
        return await this.addEvent(event)
    }
}