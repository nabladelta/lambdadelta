import { FileProvider, GroupDataProvider, MemoryProvider, RLN } from "@nabladelta/rln"
import { LDNode, LDNodeBase, Lambdadelta, NullifierSpec, PeerData, Timeline } from "@nabladelta/lambdadelta"
import createTestnet from "@hyperswarm/testnet"
import { sleep } from "../../tests/utils"
import { Identity } from "@semaphore-protocol/identity"
import { FeedEventHeader } from "../lambdadelta"

interface KVOperation {
    key: string
    value: Buffer
}

const TYPE_SET_KEY = "SET_KEY"

function deserializeOp(buf: Buffer): KVOperation {
    return JSON.parse(buf.toString())
}

function serializeOp(kvOp: KVOperation): Buffer {
    return Buffer.from(JSON.stringify(kvOp))
}

export class KVStore extends Lambdadelta {
    private kv: Map<string, Timeline> = new Map()

    private missingPayload: Set<string>

    constructor(topic: string, corestore: any, rln: RLN) {
        super(topic, corestore, rln)
        this.missingPayload = new Set()
    }

    protected async validateContent(eventID: string, eventType: string, buf: Buffer): Promise<boolean> {
        const post = deserializeOp(buf)
        return true
    }

    protected registerTypes(): void {
        const singleOP: NullifierSpec = {
            epoch: 10, // 10 Seconds per epoch
            messageLimit: 1 // 1 Message per epoch
        }
        const dailyOP: NullifierSpec = {
            epoch: 86400, // 1 hour per epoch
            messageLimit: 2048 // 2048 messages per epoch
        }
        this.addEventType(TYPE_SET_KEY, [singleOP, dailyOP], 4096)
    }

    protected async onTimelineRemove(eventID: string, time: number, consensusTime: number): Promise<void> {
        await super.onTimelineRemove(eventID, time, consensusTime)
        const event = await this.getEventByID(eventID)
        if (!event) {
            return
        }
        const kvOp = deserializeOp(event.payload)
        const valueTimeline = this.kv.get(kvOp.key)
        if (valueTimeline) {
            valueTimeline.unsetTime(eventID)
            if (valueTimeline.getSize() == 0) {
                this.kv.delete(kvOp.key)
            }
        }
    }

    protected async onTimelineAdd(eventID: string, time: number, consensusTime: number) {
        await super.onTimelineAdd(eventID, time, consensusTime)
        const event = await this.getEventByID(eventID)
        if (!event) {
            this.missingPayload.add(eventID)
            return 
        }
        await this.onNewEvent(eventID, event)
    }

    protected async onEventSyncComplete(peer: PeerData, eventID: string): Promise<void> {
        await super.onEventSyncComplete(peer, eventID)

        if (this.missingPayload.has(eventID) && this.isEventInTimeline(eventID)) {
            const event = await this.getEventByID(eventID)
            if (!event) return

            this.missingPayload.delete(eventID)
            await this.onNewEvent(eventID, event)
        }
    }

    protected async onNewEvent(eventID: string, event: {header: FeedEventHeader, payload: Buffer}) {
        switch (event.header.eventType) {
            case TYPE_SET_KEY:
                await this.setKey(eventID, event.header.claimed, deserializeOp(event.payload).key)
            default:
                return
        }
    }

    protected async setKey(eventID: string, time: number, key: string) {
        const valueTimeline = this.kv.get(key) || new Timeline()
        valueTimeline.setTime(eventID, time)
        this.kv.set(key, valueTimeline)
    }

    public async getKVByEventID(eventID: string) {
        const event = await this.getEventByID(eventID)
        if (!event) return [undefined, undefined]
        const payload = deserializeOp(event.payload)
        
        return [payload.key, payload.value]
    }

    public async getValue(key: string) {
        const timeline = this.kv.get(key)
        if (!timeline) return undefined
        const [__, eventID] = timeline.getMostRecent()
        if (!eventID) return undefined
        const [_, value] = await this.getKVByEventID(eventID)
        return value
    }

    public async setValue(key: string, value: Buffer) {
        await this.newEvent(TYPE_SET_KEY, serializeOp({key, value}))
    }
}


export class KVNode extends LDNodeBase<KVStore> {
    public static appID = "KVS"
    public static protocolVersion = "1"

    protected newFeed(topicHash: string) {
        const kvStore = new KVStore(topicHash, this.corestore, this.rln!)
        const logger = this.getSubLogger({name: `T:${topicHash.slice(0, 6)}`})
        const eventNames = [
            'peerAdded',
            'peerRemoved',
            'publishReceivedTime',
            'syncEventStart',
            'syncFatalError',
            'syncEventResult',
            'syncPayloadResult',
            'syncDuplicateEvent',
            'syncEventReceivedTime',
            'timelineAddEvent',
            'timelineRemoveEvent',
            'timelineRejectedEvent',
            'consensusTimeChanged',
            'syncCompleted',
            'peerUpdate'
        ] as const

        for (let name of eventNames) {
            kvStore.on(name, (...args: any[]) => logger.info(`[${name}] ${args.join(' | ')}`))
        }
        return kvStore
    }
}


const run = async () => {
    const secretA = 'secret1secret1secret1'
    const secretB = 'secret1secret1secret2'
    const gData = MemoryProvider.write(
    [
        GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
        GroupDataProvider.createEvent(new Identity(secretB).commitment),
    ], undefined)

    const gid = 'exampleGroupID'
    const testnet = await createTestnet(3)
    const anode = new KVNode(secretA, gid, await RLN.loadMemory(secretA, gData), { memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
    const bnode = new KVNode(secretB, gid, await RLN.loadMemory(secretB, gData), { memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})

    await Promise.all([anode.ready(), bnode.ready()])
    const TOPIC = 'example'
    const TOPICB = 'other'
    await anode.join([TOPIC, TOPICB])
    await bnode.join([TOPIC, TOPICB])
    const a = anode.getTopic(TOPIC)!
    const b = bnode.getTopic(TOPIC)!

    await a.setValue("exampleKey", Buffer.from("exampleValue"))
    // await sleep(5000)
    // console.log(await a.getValue("exampleKey"))
    // const events = (await b.getEvents())
    //             .map(e => e.payload.toString())
    // console.log("events: " + events)
}


run().then(()=> {
    "Completed"
})