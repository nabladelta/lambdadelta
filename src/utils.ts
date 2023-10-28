import crypto from 'crypto'
import { RLNGFullProof } from '@nabladelta/rln'
import { FeedEventHeader } from './verifyEventHeader'
export function getTimestampInSeconds() {
    return Math.floor(Date.now() / 1000)
}

// Rounded to 1000 seconds. This is the Thread-Epoch
// export function getThreadEpoch() {
//     return Math.floor(Date.now() / (1000 * 1000))
// }

/**
 * Gets the current epoch for a given length
 * @param {number} length The epoch length
 * @param {number} timestamp The reference time
 * @returns The epoch
 */
export function getEpoch(
        length: number,
        timestamp: number = Math.floor(Date.now() / 1000)
    ) {
    return Math.floor(timestamp / length)
}

// Rounded to 100000 seconds. This is the Member-Epoch
export function getMemberCIDEpoch() {
    return Math.floor(Date.now() / (100000 * 1000))
}

// Rounded to 100000 seconds. This is the Member-Epoch
export function getMemberCIDEpochs(toleranceMs: number) {
    return [
        Math.floor(Date.now() / (100000 * 1000)), 
        Math.floor((Date.now() + toleranceMs) / (100000 * 1000)), 
        Math.floor((Date.now() - toleranceMs) / (100000 * 1000))]
}

// Function to get milliseconds to the next epoch
export function getMillisToNextMemberCIDEpoch(): number {
    const currentEpoch = getMemberCIDEpoch();
    const nextEpochStartTime = (currentEpoch + 1) * 100000 * 1000; // Convert epoch back to milliseconds
    return nextEpochStartTime - Date.now();
}
export function getSecondsSinceCurrentMemberCIDEpoch(): number {
    const currentEpoch = getMemberCIDEpoch();
    const currentEpochStartTime = currentEpoch * 100000 * 1000; // Convert epoch back to milliseconds
    return Math.floor((Date.now() - currentEpochStartTime) / 1000);
}

/**
 * Is the timestamp at least 10 minutes after the start of the epoch?
 * @param timestamp The timestamp to check
 * @returns True if the timestamp is at least 10 minutes after the start of the epoch
 */
export function isTimestampAfterEpochStart(timestamp: number): boolean {
    const epochStart = getMemberCIDEpoch() * 100000; // Convert epoch to seconds
    const tenMinutesInSecs = 10 * 60;
    return timestamp >= epochStart + tenMinutesInSecs;
}

export function getStandardDeviation(array: number[]) {
    const n = array.length
    const mean = array.reduce((a, b) => a + b) / n
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
}

export function getMean(array: number[]) {
    return array.reduce((a, b) => a + b) / array.length
}

/**
 * Finds the most common element in an array
 * @param {number[]} array An array of numbers 
 * @returns {[number, number]} [Most common element, number of occurences]
 */
export function mostCommonElement(array: number[]): [number, number] {
    const occurrences: Map<number, number> = new Map()
    let maxOccurrences = 0
    let mostCommon = 0
    for (const element of array) {
        const newAmount = (occurrences.get(element) || 0) + 1
        occurrences.set(element, newAmount)
        if (newAmount > maxOccurrences) {
            maxOccurrences = newAmount
            mostCommon = element
        }
    }
    return [mostCommon, maxOccurrences]
}

export function rlnIdentifier(topic: string, eventType: string) {
    return `${topic}.${eventType}`
}

export function getRandomElement<T>(list: T[]) {
    return list[Math.floor((Math.random()*list.length))]
}

export function getRandomIndex<T>(list: T[]) {
    return Math.floor((Math.random()*list.length))
}

export const isSubset = (parentArray: unknown[], subsetArray: unknown[]) => {
    return subsetArray.every((el) => {
        return parentArray.includes(el)
    })
}

export function getRandomInt(max: number){
    return Math.floor((Math.random()*max))
}

export function coinFlip(successChance: number) {
    return(Math.random() < successChance) ? true : false
}

/**
 * An event as it is stored in the Datastore.
 */
export interface StoredEvent {
    /**
     * Event header
     */
    header: FeedEventHeader
    /**
     * Event proof
     */
    proof: RLNGFullProof
}
