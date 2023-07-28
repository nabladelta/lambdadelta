import { NoiseSecretStream } from "@hyperswarm/secret-stream";
import { PeerInfo } from "hyperswarm";
import { FeedEventHeader, Lambdadelta } from "../lambdadelta";
import { LDNodeBase } from "../node";
import { Logger } from "tslog";
import { RLN } from "@nabladelta/rln";
import Protomux from 'protomux'
import c from 'compact-encoding'
import { deSerializeRelayedEvent, serializeRelayedEvent } from "../utils";

export abstract class RelayerNodeBase<Feed extends Lambdadelta> extends LDNodeBase<Feed> {
    private eventSenders: Map<string, any> // PeerID => messageSender

    constructor(secret: string, groupID: string, rln: RLN, opts: {memstore?: boolean, swarmOpts?: any, logger?: Logger<unknown>, dataFolder?: string}) {
        super(secret, groupID, rln, opts)
        this.eventSenders = new Map()
    }

    /**
     * Register an extra message type on the channel for event relaying
     * @param stream The encrypted socket used for communication
     * @param info An object containing metadata regarding this peer
     */
    protected handlePeer(stream: NoiseSecretStream, info: PeerInfo): void {
        const channel = super.handlePeer(stream, info)
        const peerID = stream.remotePublicKey.toString('hex')
        const self = this
        const eventSender = channel.addMessage({
            encoding: c.array(c.buffer),
            async onmessage(eventData: Buffer[], _: any) {
                await self.handleRelayedEvent(eventData)
            }})
        this.eventSenders.set(peerID, eventSender)
    }

    protected async handleRelayedEvent(eventData: Buffer[]) {
        const {topic, eventID, header, payload} = deSerializeRelayedEvent(eventData)
        const feed = this.getTopic(topic)
        if (!feed) return

        await feed.addEvent(eventID, header, payload)
    }

    private async sendEventToRelay(peerID: string, eventData: Buffer[]) {
        const eventSender = this.eventSenders.get(peerID)
        if (!eventSender) return false
        await eventSender.send(eventData)
        return true
    }

    public async relayEvent(topic: string, eventID: string, header: FeedEventHeader, payload: Buffer) {
        const eventData = serializeRelayedEvent(topic, eventID, header, payload)
        const peerID = Array.from(this.eventSenders.keys())[0]
        return await this.sendEventToRelay(peerID, eventData)
    }
}