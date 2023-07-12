import { getMean, getStandardDeviation, mostCommonElement } from "./utils"

const QUORUM = 66/100

/**
 * Calculates the consensus timestamp for an event,
 * taking all the `received` timestamps published by our peers as input.
 * @param timestamps peer contributed timestamps for an event
 * @param totalPeers total number of peers connected to this instance
 * @returns The time the event was created according to the peer consensus
 */
export function calculateConsensusTime(timestamps: number[], totalPeers: number, quorum: number = QUORUM): number {
    if ((timestamps.length / totalPeers) < quorum) {
        // We do not have a quorum to decide on the correct time yet
        return -1
    }
    // Find the most common received time
    const [mostCommon, occurences] = mostCommonElement(timestamps)
    // If we have a ~2/3rds majority for one timestamp, use it
    if ((occurences / timestamps.length) >= quorum) {
        return mostCommon
    }
    // Fallback method: use mean timestamp

    // Filter out the timestamps that are more than one std.dev away from the mean
    const stdDev = getStandardDeviation(timestamps)
    const rawMean = getMean(timestamps)
    const filteredTimes = timestamps.filter(n => Math.abs(rawMean - n) <= stdDev)

    // If we still have more than one timestamp left, use these for the mean
    if (filteredTimes.length > 1) {
        return getMean(filteredTimes)
    }
    // Otherwise just return the regular mean
    return rawMean
}