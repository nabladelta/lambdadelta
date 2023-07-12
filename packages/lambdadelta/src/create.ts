import { RLN, nullifierInput } from "@nabladelta/rln";
import { FeedEventHeader } from "./lambdadelta";
import crypto from 'crypto'
import { getTimestampInSeconds } from "./utils";

/**
 * Creates a new event from input values, including proof generation,
 * and returns it without storing it anywhere.
 * @param eventType Type for this event
 * @param nullifiers Nullifiers for the RLN proof
 * @param content Event content buffer
 * @returns [EventHeader, EventID]
 */
export async function createEvent(
    rln: RLN,
    topic: string,
    eventType: string,
    nullifiers: nullifierInput[],
    content: Buffer
): Promise<[FeedEventHeader, string]> {
    const claimed = getTimestampInSeconds()
    const contentHash = crypto.createHash('sha256')
        .update(content)
        .digest('hex')

    const eventID = crypto.createHash('sha256')
        .update(topic)
        .update(eventType)
        .update(claimed.toString())
        .update(contentHash)
        .digest('hex')

    const proof = await rln.createProof(eventID, nullifiers, topic, true)
    return [{
        eventType,
        proof,
        claimed,
        contentHash
    },
    eventID]
}