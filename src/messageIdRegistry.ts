import { nullifierInput } from "@nabladelta/rln"
import AsyncLock from "async-lock"
import { getEpoch } from "./utils.js"
import { NullifierSpec } from "./verifyEventHeader.js"
import type { Datastore } from 'interface-datastore'
import { Key } from 'interface-datastore'
import { numberToUint8Array, uint8ArrayToNumber } from "./protobuf/serialize.js"
interface SpecsProvider {
    getNullifierSpecs(eventType: string): NullifierSpec[] | undefined
}

/**
 * Keeps track of the last used message ID for a given nullifier
 * so that we can create unique nullifiers for each event.
 * The job of this class is to provide strictly
 * monotonically increasing integers for each given nullifier.
 * @internal
 */
export class MessageIdRegistry {
    private feed: SpecsProvider
    private lock: AsyncLock
    private datastore: Datastore
    private storePrefix: string

    constructor(feed: SpecsProvider, storePrefix: string, datastore: Datastore) {
        this.feed = feed
        this.lock = new AsyncLock()
        this.datastore = datastore
        this.storePrefix = storePrefix
    }

    /**
     * Get the last message id we have released for this nullifier
     * @param eventType The name of the event type
     * @param index The index of the nullifier within the proof
     * @param nullifier The nullifier string the message ID refers to
     * @returns integer ID or null
     */
    public async getLastUsedMessageId(eventType: string, index: number, nullifier: string) {
        try {
            const value = await this.datastore.get(new Key(`${this.storePrefix}/messageIDs/${eventType}/${index}/${nullifier}`))
            if (value === null || value === undefined) {
                return null
            }
            const returnVal = uint8ArrayToNumber(value)
            if (returnVal === false || isNaN(returnVal)) {
                return null
            }
            return returnVal
        } catch (e) {
            if ((e as any).code == "ERR_NOT_FOUND") {
                return null
            }
            throw e
        }
    }

    /**
     * Set the last used message ID for a nullifier
     * @param eventType The name of the event type
     * @param index The index of the nullifier within the proof
     * @param nullifier The nullifier string the message ID refers to
     * @param messageId The new message ID
     */
    private async setLastUsedMessageId(eventType: string, index: number, nullifier: string, messageId: number) {
        await this.datastore.put(new Key(`${this.storePrefix}/messageIDs/${eventType}/${index}/${nullifier}`), numberToUint8Array(messageId))
    }

    /**
     * Creates a new unique set of valid nullifiers for a given event type.
     * @param eventType Type for an event
     * @returns Valid nullifiers for this event type
     */
    public async createNullifier(eventType: string): Promise<nullifierInput[]> {
        const specs = this.feed.getNullifierSpecs(eventType)
        if (!specs) {
            throw new Error("Unknown event type")
        }

        const nulls: nullifierInput[] = []
        for (let i = 0; i < specs.length; i++) {
            
            const input = {
                nullifier: getEpoch(specs[i].epoch).toFixed(),
                messageLimit: specs[i].messageLimit,
                messageId: 0
            }
            const limitReached = await this.lock.acquire(`${eventType}.${i}.${input.nullifier}`,
                /**
                 * This section needs to acquire a lock on the specific nullifier
                 * so that we don't accidentally give the same messageId to two different callers
                 */
                async(): Promise<boolean> => {
                    const lastId = await this.getLastUsedMessageId(eventType, i, input.nullifier)
                    if (lastId !== null) {
                        input.messageId = lastId + 1
                    }
                    if (input.messageId >= input.messageLimit) {
                        return true
                    }
                    nulls.push(input)

                    await this.setLastUsedMessageId(eventType, i, input.nullifier, input.messageId)

                    return false
            })

            if (limitReached) throw new Error(`Message limit reached: ID ${input.messageId} Limit ${input.messageLimit}`)
        }
        return nulls
    }
}