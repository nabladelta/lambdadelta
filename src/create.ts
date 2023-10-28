import { RLN, RLNGFullProof, nullifierInput } from "@nabladelta/rln";
import { FeedEventHeader } from "./verifyEventHeader.js";
import { getTimestampInSeconds, rlnIdentifier } from "./utils.js";
import crypto from 'crypto'

/**
 * Creates a new event from input values, including proof generation,
 * and returns it without storing it anywhere.
 * @param rln The RLN instance for generating the proof
 * @param topic The topic the event belongs to
 * @param eventType Type for this event
 * @param nullifiers Nullifiers for the RLN proof
 * @param payloadHash Event payload hash
 * @returns [EventHeader, eventProof, EventID]
 */
export async function createEvent(
    rln: RLN,
    topic: string,
    eventType: string,
    nullifiers: nullifierInput[],
    payloadHash: string,
): Promise<[FeedEventHeader, RLNGFullProof, string]> {
    const claimed = getTimestampInSeconds()

    const eventID = crypto.createHash('sha256')
        .update(topic)
        .update(eventType)
        .update(claimed.toString())
        .update(payloadHash)
        .digest('hex')

    const proof = await rln.createProof(eventID, nullifiers, rlnIdentifier(topic, eventType), true)
    return [{
        eventType,
        claimed,
        payloadHash
    }, proof,
    eventID]
}