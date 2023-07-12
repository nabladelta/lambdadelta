import { nullifierInput } from "@nabladelta/rln";
import Corestore from "corestore";
import Hyperbee from "hyperbee";
import { deserializeInteger, getEpoch, serializeInteger } from "./utils";
import { NullifierSpec } from "./lambdadelta";
import AsyncLock from "async-lock";

interface SpecsProvider {
    getNullifierSpecs(eventType: string): NullifierSpec[] | undefined
}

export class NullifierRegistry {
    private registry: Hyperbee<string,Buffer>
    private feed: SpecsProvider
    private lock: AsyncLock

    constructor(corestore: Corestore, feed: SpecsProvider) {
        this.registry = new Hyperbee(corestore.get({name: 'nullifiers'}), {
            valueEncoding: 'binary',
            keyEncoding: 'utf-8'
        })
        this.feed = feed
        this.lock = new AsyncLock()
    }

    /**
     * Get the last message id we have released for this nullifier
     * @param eventType The name of the event type
     * @param index The index of the nullifier within the proof
     * @param nullifier The nullifier string the message ID refers to
     * @returns integer ID or null
     */
    public async getLastUsedMessageId(eventType: string, index: number, nullifier: string) {
        const { value } = await this.registry.get(`${eventType}.${index}.${nullifier}`) || { value: null }
        if (value == null || value == undefined) {
            return null
        }
        return deserializeInteger(value)
    }

    /**
     * Set the last used message ID for a nullifier. Will only replace a previous value with a greater one.
     * @param eventType The name of the event type
     * @param index The index of the nullifier within the proof
     * @param nullifier The nullifier string the message ID refers to
     * @param messageId The new message ID
     */
    private async setLastUsedMessageId(eventType: string, index: number, nullifier: string, messageId: number) {
        await this.registry.put(`${eventType}.${index}.${nullifier}`, serializeInteger(messageId), { 
            cas: (prev, next) => {
                const previousId = deserializeInteger(prev)
                const nextId = deserializeInteger(next)
                return nextId > previousId // Never allow next id to decrement
            }})
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
                nullifier: `${getEpoch(specs[i].epoch)}|${eventType}`,
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
                        return false
                    }
                    nulls.push(input)

                    await this.setLastUsedMessageId(eventType, i, input.nullifier, input.messageId)

                    return true
            })

            if (limitReached) throw new Error("Message limit reached")
        }
        return nulls
    }
}