import { RLN, nullifierInput } from "@nabladelta/rln";
import { FeedEventHeader } from "./lambdadelta";
import crypto from 'crypto'
import { getTimestampInSeconds, rlnIdentifier } from "./utils";

/**
 * Creates a new event from input values, including proof generation,
 * and returns it without storing it anywhere.
 * @param eventType Type for this event
 * @param nullifiers Nullifiers for the RLN proof
 * @param payload Event payload buffer
 * @returns [EventHeader, EventID]
 */
export async function createEvent(
    rln: RLN,
    topic: string,
    eventType: string,
    nullifiers: nullifierInput[],
    payload: Buffer
): Promise<[FeedEventHeader, string]> {
    const claimed = getTimestampInSeconds()
    const payloadHash = crypto.createHash('sha256')
        .update(payload)
        .digest('hex')

    const eventID = crypto.createHash('sha256')
        .update(topic)
        .update(eventType)
        .update(claimed.toString())
        .update(payloadHash)
        .digest('hex')

    const proof = await rln.createProof(eventID, nullifiers, rlnIdentifier(topic, eventType), true)
    return [{
        eventType,
        proof,
        claimed,
        payloadHash
    },
    eventID]
}