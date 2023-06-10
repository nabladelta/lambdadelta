import { RLN } from "@nabladelta/rln";
import Corestore from "corestore";
import { FeedEventHeader, NullifierSpec, TopicEvents } from "../lambdadelta";
import { TypedEmitter } from "tiny-typed-emitter";

export class Lambdadelta extends TypedEmitter<TopicEvents> {
    private peers: Set<string>
    public topic: string
    constructor(topic: string, corestore: Corestore, rln: RLN) {
        super()
        this.peers = new Set()
        this.topic = topic
    }

    public async ready() {}

    public async close() {}

    public async getCoreLength() { return 0 }

    public async addPeer(memberCID: string, feedCoreID: string, driveID: string) {
        if (this.peers.has(memberCID)) {
            return false
        }
        this.peers.add(memberCID)
        return true
    }
    public async removePeer(memberCID: string) {
        return this.peers.delete(memberCID)
    }
    public getCoreIDs(): [string, string] {
        return ['core', 'drive']
    }
    public hasPeer(memberCID: string) {
        return this.peers.has(memberCID)
    }

    public addEventType(eventType: string, specs: NullifierSpec[], maxContentSize: number) {

    }

    public async newEvent(eventType: string, content: Buffer) {

    }

    public async getEvents(
        startTime: number = 0,
        endTime?: number,
        maxLength?: number
        ): Promise<{
            header: FeedEventHeader,
            content: Buffer
        }[]> {
            return []
    }
}