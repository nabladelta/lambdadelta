import crypto from 'crypto'
import AsyncLock from 'async-lock'
import { FeedEventHeader, LogEntry, RLNGFullProof, TopicData } from './protobuf/msgTypes'
import { FeedEventHeader as IFeedEventHeader, LogEntry as ILogEntry } from './lambdadelta'
import { Proof as IProof, RLNGFullProof as IRLNGFullProof } from '@nabladelta/rln/src/rln'
import { Proof } from './protobuf/msgTypes'

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
//     for (let i = firstEpoch i <= finalEpoch i++) {
//         epochs.push(i)
//     }
//     return epochs
// }

export function convertIProofToProof(proof: IProof): Proof {
    return Proof.create({
        protocol: proof.protocol,
        curve: proof.curve,
        piA: proof.pi_a,
        piB: proof.pi_b.map((el) => ({piB: el})),
        piC: proof.pi_c,
    })
}

export function convertProofToIProof(proof: Proof): IProof {
    return {
        protocol: proof.protocol,
        curve: proof.curve,
        pi_a: proof.piA,
        pi_b: proof.piB.map((el) => el.piB),
        pi_c: proof.piC,
    }
}

export function convertFullProofToIFullProof(fullProof: RLNGFullProof): IRLNGFullProof | false {
    if (!fullProof.snarkProof) return false
    if (!fullProof.snarkProof.proof) return false
    if (!fullProof.snarkProof.publicSignals) return false
    const proof = convertProofToIProof(fullProof.snarkProof.proof)
    return {
        ...fullProof,
        snarkProof: {
            publicSignals: fullProof.snarkProof.publicSignals,
            proof,
        }
    }
}

export function convertIFullProofToFullProof(fullProof: IRLNGFullProof): RLNGFullProof {
    return RLNGFullProof.create({
        ...fullProof,
        snarkProof: {
            ...fullProof.snarkProof,
            proof: convertIProofToProof(fullProof.snarkProof.proof)
        }
    })
}

export function convertIEventHeaderToEventHeader(header: IFeedEventHeader): FeedEventHeader {
    return FeedEventHeader.create({
        ...header,
        proof: {
            ...header.proof,
            snarkProof: {
                ...header.proof.snarkProof,
                proof: convertIProofToProof(header.proof.snarkProof.proof)
            }
        }
    })
}

export function convertEventHeaderToIEventHeader(header?: FeedEventHeader): IFeedEventHeader | false {
    if (!header) return false
    if (!header.proof) return false
    if (!header.proof.snarkProof) return false
    if (!header.proof.snarkProof.proof) return false
    if (!header.proof.snarkProof.publicSignals) return false
    const proof = convertProofToIProof(header.proof.snarkProof.proof)
    return {
        ...header,
        proof: {
            ...header.proof,
            snarkProof: {
                publicSignals: header.proof.snarkProof.publicSignals,
                proof
            }
        }
    }
}

export function serializeLogEntry(event: ILogEntry): Buffer {
    return Buffer.from(LogEntry.toBinary({
        ...event,
        header: convertIEventHeaderToEventHeader(event.header)
    }))
}

export function deserializeLogEntry(eventBuf: Buffer): ILogEntry | false {
    const entry = LogEntry.fromBinary(eventBuf)
    const header = convertEventHeaderToIEventHeader(entry.header)
    if (!header) return false
    return {
        ...entry,
        header: header
    }
}

export function serializeFullProof(proof: IRLNGFullProof): Buffer {
    return Buffer.from(RLNGFullProof.toBinary(convertIFullProofToFullProof(proof)))
}
export function deserializeFullProof(proofBuf: Buffer): IRLNGFullProof | false {
    const proof = RLNGFullProof.fromBinary(proofBuf)
    return convertFullProofToIFullProof(proof)
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
    return TopicData.fromBinary(dataBuf)
}

export function serializeTopicData(data: { feedCore: string, drive: string }): Buffer {
    return Buffer.from(TopicData.toBinary(TopicData.create(data)))
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

export  function serializeRelayedEvent(topic: string, eventID: string, header: IFeedEventHeader, payload: Buffer) {
    const headerBuf = FeedEventHeader.toBinary(convertIEventHeaderToEventHeader(header))
    return [Buffer.from(topic), Buffer.from(eventID), Buffer.from(headerBuf), payload]
}

export  function deSerializeRelayedEvent(eventData: Buffer[]): {
    topic: string
    eventID: string
    header: IFeedEventHeader
    payload: Buffer
} {
    const header = convertEventHeaderToIEventHeader(FeedEventHeader.fromBinary(eventData[2]))
    if (!header) throw new Error('Could not deserialize event header')
    return {
        topic: eventData[0].toString('utf-8'),
        eventID: eventData[1].toString('utf-8'),
        header,
        payload: eventData[3]
    }
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

interface LockHolder {
    lock: AsyncLock
}

/**
 * Acquires a lock on the specified argument of the function
 * @param argIndex The index of the argument to use as the lock key
 */
export function AcquireLockOnArg(argIndex: number = 0) {
    return function(target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>): void {
        const originalMethod = descriptor.value

        descriptor.value = function(...args: any[]) {
            const lockKey = args[argIndex]  // Use the specified argument as the key
            return new Promise((resolve, reject) => {
                (this as LockHolder).lock.acquire(lockKey, () => originalMethod.apply(this, args), (err: any, result: any) => {
                    if (err) reject(err)
                    else resolve(result)
                })
            })
        }
    }
}

/**
 * Acquires a lock on the specified key
 * @param lockKey The key to use for the lock
 */
export function AcquireLockOn(lockKey: string) {
    return function(target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>): void {
        const originalMethod = descriptor.value
        descriptor.value = function(...args: any[]) {
            return new Promise((resolve, reject) => {
                (this as LockHolder).lock.acquire(lockKey, () => originalMethod.apply(this, args), (err: any, result: any) => {
                    if (err) reject(err)
                    else resolve(result)
                })
            })
        }
    }
}