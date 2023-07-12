import { Logger } from "tslog"
import { LogEntry, FeedEventHeader } from "./lambdadelta"
import crypto from 'crypto'

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

// /**
//  * Gets an epoch range for a given length, around a given timestamp +- length
//  * @param {number} length The epoch length
//  * @param {number} jitter +- how much of reference time the epoch will be
//  * @param {number} reference The reference time
//  * @returns The range of epochs
//  */
// export function getEpochRange(
//         length: number,
//         jitter: number,
//         reference: number = Math.floor(Date.now() / 1000)
//     ): number[] {
//     const startTime = reference - jitter
//     const endTime = reference + jitter
//     const firstEpoch = Math.floor(startTime / length)
//     const finalEpoch = Math.floor(endTime / length)
//     const epochs: number[] = []
//     for (let i = firstEpoch; i <= finalEpoch; i++) {
//         epochs.push(i)
//     }
//     return epochs
// }

export function serializeEvent(event: FeedEventHeader): Buffer {
    return Buffer.from(JSON.stringify(event), 'utf-8')
}

export function deserializeEvent(eventBuf: Buffer): FeedEventHeader {
    const event = JSON.parse(eventBuf.toString('utf-8'))
    return event
}

export function serializeLogEntry(event: LogEntry): Buffer {
    return Buffer.from(JSON.stringify(event), 'utf-8')
}

export function deserializeLogEntry(eventBuf: Buffer): LogEntry {
    return JSON.parse(eventBuf.toString('utf-8'))
}

// Rounded to 100000 seconds. This is the Member-Epoch
export function getMemberCIDEpoch() {
    return Math.floor(Date.now() / (100000 * 1000))
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

// export async function errorHandler(promise: Promise<any>, log: Logger<any>) {
//     try {
//         await promise
//     } catch(e) {
//         log.error((e as any).message)
//         throw e
//     }
// }

function createKey(secret: string) {
    return crypto.createHash('sha256').update(String(secret)).digest('base64').slice(0, 32)
}

const algorithm = 'aes-256-ctr'

export function encrypt(data: Buffer, secret: string) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(algorithm, createKey(secret), iv)
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
    return Buffer.from(JSON.stringify({
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    }))
}

export function decrypt(data: Buffer, secret: string) {
    const {iv, content}: {iv: string, content: string} = JSON.parse(data.toString())
    const decipher = crypto.createDecipheriv(algorithm, createKey(secret), Buffer.from(iv, 'hex'))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(content, 'hex')), decipher.final()])
    return decrypted
}

export function deserializeTopicData(dataBuf: Buffer): { feedCore: string, drive: string } {
    return JSON.parse(dataBuf.toString('utf-8'))
}

export function serializeTopicData(data: { feedCore: string, drive: string }): Buffer {
    return Buffer.from(JSON.stringify(data))
}

export function serializeInteger(i: number) {
    return Buffer.from(i.toFixed(0), 'utf-8')
}

export function deserializeInteger(buf: Buffer) {
    return parseInt(buf.toString('utf-8'))
}

export function rlnIdentifier(topic: string, eventType: string) {
    return `${topic}.${eventType}`
}