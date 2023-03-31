import { FeedEvent } from "./lambdadelta"

export function getTimestampInSeconds() {
    return Math.floor(Date.now() / 1000)
}

// Rounded to 1000 seconds. This is the Thread-Epoch
export function getThreadEpoch() {
    return Math.floor(Date.now() / (1000 * 1000))
}

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

/**
 * Gets an epoch range for a given length, around a given timestamp +- length
 * @param {number} length The epoch length
 * @param {number} jitter +- how much of reference time the epoch will be
 * @param {number} reference The reference time
 * @returns The range of epochs
 */
export function getEpochRange(
        length: number,
        jitter: number,
        reference: number = Math.floor(Date.now() / 1000)
    ): number[] {
    const startTime = reference - jitter
    const endTime = reference + jitter
    const firstEpoch = Math.floor(startTime / length)
    const finalEpoch = Math.floor(endTime / length)
    const epochs: number[] = []
    for (let i = firstEpoch; i <= finalEpoch; i++) {
        epochs.push(i)
    }
    return epochs
}

export function serializeEvent(event: FeedEvent): Buffer {
    return Buffer.from(JSON.stringify(event), 'utf-8')
}

export function deserializeEvent(eventBuf: Buffer): FeedEvent {
    return JSON.parse(eventBuf.toString('utf-8'))
}