import { RLN, RLNGFullProof } from '@nabladelta/rln'
import crypto from 'crypto'
import { getEpoch, rlnIdentifier } from './utils.js'

/**
 * An event's header. Contains all of the event's intrinsic information.
 * Events are identified by their `eventID`, which is the hash of the header.
 */
export interface FeedEventHeader {
    /**
     * Event type. A string, used to determined the required nullifier spec (message limit, epoch length).
     */
    eventType: string
    /**
     * The intrinsic timestamp of the event.
     * This is the time at which the original event author claims to have created the event.
     * The purpose of consensus is to determine if this timestamp is accurate.
     */
    claimed: number
    /**
     * The hash of the event's payload.
     * This is used by downstream applications.
     */
    payloadHash: string
}

/**
 * @typedef NullifierSpec Spec for a nullifier
 * @property {number} epoch Epoch length in seconds
 * @property {number} messageLimit Message limit per epoch
 */

/**
 * Nullifier spec for a given event type.
 * This determines the nullifier's required epoch length and message limit.
 * Necessary for verifying event rln proofs.
 */
export interface NullifierSpec {
    /**
     * Epoch length in seconds.
     * How long an epoch lasts.
     */
    epoch: number
    /**
     * Message limit per epoch.
     * How many messages can be sent per epoch.
     */
    messageLimit: number
}

/**
 * Enum for header verification errors
 */
export enum HeaderVerificationError {
    /**
     * The event's hash does not match the proof's signal
     */
    HASH_MISMATCH = "HEADER_HASH_MISMATCH",
    /**
     * The event's nullifier spec could not be found
     */
    UNKNOWN_EVENT_TYPE = "UNKNOWN_EVENT_TYPE",
    /**
     * The RLN identifier does not match the event's type and topic
     */
    UNEXPECTED_RLN_IDENTIFIER = "UNEXPECTED_RLN_IDENTIFIER",
    /**
     * The message limit in the proof does not match the event type's nullifier spec
     */
    UNEXPECTED_MESSAGE_LIMIT = "UNEXPECTED_MESSAGE_LIMIT",
    /**
     * The nullifier's epoch does not match the event's claimed timestamp
     */
    UNEXPECTED_NULLIFIER = "UNEXPECTED_NULLIFIER",
    /**
     * The header is too large
     */
    SIZE = "HEADER_SIZE",
    /**
     * The header could not be retrieved
     */
    UNAVAILABLE = "HEADER_UNAVAILABLE"
}

/**
 * Verifies an event header.
 * @param proof The RLN proof
 * @param header The event header
 * @param topic The topic
 * @param nullifierSpecs The nullifier specs
 * @param rln The RLN instance for verifying the proof
 * @returns The verification result
 */
export async function verifyEventHeader(proof: RLNGFullProof, header: FeedEventHeader, topic: string, nullifierSpecs: Map<string, NullifierSpec[]>, rln: RLN) {
    const eventID = getEventHash(header, topic)

    if (proof.signal !== eventID) {
        return HeaderVerificationError.HASH_MISMATCH
    }
    if (proof.rlnIdentifier !== rlnIdentifier(topic, header.eventType)) {
        return HeaderVerificationError.UNEXPECTED_RLN_IDENTIFIER
    }
    const specs = nullifierSpecs.get(header.eventType)
    if (!specs) {
        return HeaderVerificationError.UNKNOWN_EVENT_TYPE
    }
    for (let i = 0; i < specs.length; i++) {
        if (proof.externalNullifiers[i].messageLimit
            !== specs[i].messageLimit) {
            return HeaderVerificationError.UNEXPECTED_MESSAGE_LIMIT
        }

        if (proof.externalNullifiers[i].nullifier
            !== getEpoch(specs[i].epoch, header.claimed).toFixed(0)) {
            return HeaderVerificationError.UNEXPECTED_NULLIFIER
        }
    }
    const result = await rln.submitProof(proof, header.claimed)
    return result
}

/**
 * Calculates the hash for an event header.
 * This is used as the ID for events.
 * @param event Header for this event
 * @param topic The topic the event belongs to
 * @returns The `eventID`
 */
export function getEventHash(event: FeedEventHeader, topic: string) {
    return crypto.createHash('sha256')
        .update(topic)
        .update(event.eventType)
        .update(event.claimed.toString())
        .update(event.payloadHash)
        .digest('hex')
}