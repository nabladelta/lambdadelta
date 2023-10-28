import { getMean, getStandardDeviation, mostCommonElement } from "./utils.js"

const QUORUM = 66/100

/**
 * Calculates the consensus timestamp for an event,
 * taking all the `received` timestamps published by our peers as input.
 * @param timestamps peer contributed timestamps for an event
 * @param totalPeers total number of peers connected to this instance
 * @returns The consensus timestamp and a boolean indicating if the claimed is acceptable according to the consensus
 */
export function calculateConsensusTime(timestamps: number[], totalPeers: number, claimed: number, allowedTimediscrepancy: number, quorum: number = QUORUM) {
    if ((timestamps.length / totalPeers) < quorum) {
        // We do not have a quorum to decide on the correct time yet
        return {consensusTime: -1, acceptable: false}
    }
    // Find the most common received time
    const [mostCommon, occurences] = mostCommonElement(timestamps)
    // If we have a ~2/3rds majority for one timestamp, use it
    if ((occurences / timestamps.length) >= quorum) {
        return {consensusTime: mostCommon, acceptable: timestampWithinRange(mostCommon, claimed, allowedTimediscrepancy)}
    }

    // If we do not have a clear majority for one specific timestamp,
    // treat the timestamps that are within the allowed time discrepancy as positive votes
    const affirmativeVotes = timestamps.filter(n => timestampWithinRange(n, claimed, allowedTimediscrepancy))
    // If we have a ~2/3rds majority of timestamps within allowed range of the claimed value, use it
    if ((affirmativeVotes.length / timestamps.length) >= quorum) {
        return {consensusTime: claimed, acceptable: true}
    }
    // If a ~2/3rds majority of timestamps are outside the allowed range of the claimed value,
    if (((timestamps.length - affirmativeVotes.length) / timestamps.length) >= quorum) {
        // The claimed value is not acceptable
        return {consensusTime: getMean(timestamps), acceptable: false}
    }

    // Fallback method: use mean timestamp
    // Filter out the timestamps that are more than one std.dev away from the mean
    const stdDev = getStandardDeviation(timestamps)
    const rawMean = getMean(timestamps)
    const filteredTimes = timestamps.filter(n => Math.abs(rawMean - n) <= stdDev)

    // If we still have more than one timestamp left, use these for the mean
    if (filteredTimes.length > 1) {
        const filteredMean = getMean(filteredTimes)
        return {consensusTime: filteredMean, acceptable: timestampWithinRange(filteredMean, claimed, allowedTimediscrepancy) }
    }
    // Otherwise just return the regular mean
    return {consensusTime: rawMean, acceptable: timestampWithinRange(rawMean, claimed, allowedTimediscrepancy) }
}

function timestampWithinRange(timestamp: number, claimed: number, allowedTimediscrepancy: number): boolean {
    return Math.abs(timestamp - claimed) <= allowedTimediscrepancy
}