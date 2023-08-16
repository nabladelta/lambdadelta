import { NoiseSecretStream } from "@hyperswarm/secret-stream";
import { PeerInfo } from "hyperswarm";
import { FeedEventHeader, Lambdadelta } from "../lambdadelta";
import { LDNodeBase } from "../node";
import { Logger } from "tslog";
import { RLN } from "@nabladelta/rln";
import Protomux from 'protomux'
import c from 'compact-encoding'
import { coinFlip, deSerializeRelayedEvent, getRandomInt, serializeRelayedEvent } from "../utils";
import { RoutingMap } from "./routingMap";

export abstract class RelayerNodeBase<Feed extends Lambdadelta> extends LDNodeBase<Feed> {
    private relayPeers: Map<string, any> = new Map() // PeerID => messageSender
    private routingMaps: Map<string, RoutingMap> = new Map() // Feed => routingMap
    private embargoTimeMs: number = 5000
    private embargoJitterMs: number = 3000

    constructor(secret: string, groupID: string, rln: RLN, opts: {memstore?: boolean, swarmOpts?: any, logger?: Logger<unknown>, dataFolder?: string}) {
        super(secret, groupID, rln, opts)
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
                await self.handleRelayedEvent(peerID, eventData)
            }})
        this.relayPeers.set(peerID, eventSender)

        stream.once('close', async () => {
            const peerID = stream.remotePublicKey.toString('hex')
            this.relayPeers.delete(peerID)
        })
    }

    protected async handleRelayedEvent(senderPeerID: string, eventData: Buffer[]) {
        const {topic, eventID, header, payload} = deSerializeRelayedEvent(eventData)

        const totalPeers = this.relayPeers.size
        const chance = 1 / Math.min(totalPeers, 10) // 1 in 10 chance or better of fluffing
        const fluffEvent = coinFlip(chance)
        
        if (fluffEvent) {
            // Publish event (fluff phase)
            const feed = this.getTopic(topic)
            if (!feed) return
    
            await feed.addEvent(eventID, header, payload)
        } else {
            // Relay event
            this.sendEventToRelay(senderPeerID, topic, eventData)

            // Publish event after the embargo timer expires
            setTimeout(() => {
                const feed = this.getTopic(topic)
                if (!feed) return

                return feed.addEvent(eventID, header, payload)
            }, this.embargoTimeMs + getRandomInt(this.embargoJitterMs))
        }
    }

    private async sendEventToRelay(senderPeerID: string, topic: string, eventData: Buffer[]) {
        const feed = this.getTopic(topic)

        if (!feed) return false
        
        if (!this.routingMaps.has(topic)) {
            this.routingMaps.set(topic, new RoutingMap(this.peerId))
        }
        this.routingMaps.get(topic)!.updatePeers([...feed.getPeerList()])

        const peerID = this.routingMaps.get(topic)!.getDestination(senderPeerID)
        if (!peerID) return false

        const eventSender = this.relayPeers.get(peerID)
        if (!eventSender) return false
        await eventSender.send(eventData)
        return true
    }

    public async relayEvent(topic: string, eventID: string, header: FeedEventHeader, payload: Buffer) {
        const eventData = serializeRelayedEvent(topic, eventID, header, payload)

        return await this.sendEventToRelay(this.peerId, topic, eventData)
    }

    public setEmbargoTimer(timeMs: number, jitterMs: number) {
        this.embargoJitterMs = jitterMs
        this.embargoTimeMs = timeMs
    }
}