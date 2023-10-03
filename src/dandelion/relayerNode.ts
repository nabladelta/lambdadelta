import { NoiseSecretStream } from "@hyperswarm/secret-stream";
import { PeerInfo } from "hyperswarm";
import { FeedEventHeader, Lambdadelta } from "../lambdadelta";
import { LDNodeBase } from "../node";
import { Logger } from "tslog";
import { RLN } from "@nabladelta/rln";
import c from 'compact-encoding'
import { coinFlip, deSerializeRelayedEvent, getRandomInt, serializeRelayedEvent } from "../utils";
import { RoutingTable } from "./routingTable";
import { RelayedLambdadelta } from "./relayedFeed";

export abstract class RelayerNodeBase<Feed extends Lambdadelta> extends LDNodeBase<Feed> {
    private relayPeers: Map<string, any> = new Map() // PeerID => messageSender
    private routingMaps: Map<string, RoutingTable> = new Map() // Feed => routingMap
    private embargoTimeMs: number = 5000
    private embargoJitterMs: number = 3000
    private logR: Logger<unknown>
    private embargoedEvents: Set<string> = new Set()

    constructor(secret: string, groupID: string, rln: RLN, opts: {memstore?: boolean, swarmOpts?: any, logger?: Logger<unknown>, dataFolder?: string}) {
        super(secret, groupID, rln, opts)
        this.logR = this.getSubLogger({name: `EventRelay`, minLevel: 0})
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
        this.logR.info(`Received stem event from ${senderPeerID.slice(-6)} (Topic: ${topic.slice(-6)} ID: ${eventID.slice(-6)})`)

        const totalPeers = this.relayPeers.size
        const chance = 1 / Math.min(totalPeers, 10) // 1 in 10 chance or better of fluffing
        const fluffEvent = coinFlip(chance)
        
        if (fluffEvent) {
            // Publish event (fluff phase)
            this.logR.info(`Fluffing event (Topic: ${topic.slice(-6)} ID: ${eventID.slice(-6)})`)
            const feed = this.getTopicByHash(topic)
            if (!feed) return
            
            await feed.addEvent(eventID, header, payload)
        } else {
            // Relay event
            this.logR.info(`Relaying stem event (Topic: ${topic.slice(-6)} ID: ${eventID.slice(-6)})`)
            this.sendEventToRelay(senderPeerID, topic, eventData)

            if (this.embargoedEvents.has(`${topic.slice(-6)}.${eventID}`)) { // Do not embargo twice
                return
            }
            this.embargoedEvents.add(`${topic.slice(-6)}.${eventID}`)
            // Publish event after the embargo timer expires
            setTimeout(() => {
                this.logR.info(`Attempting to fluff stem event after embargo expired (Topic: ${topic.slice(-6)} ID: ${eventID.slice(-6)})`)
                this.embargoedEvents.delete(`${topic.slice(-6)}.${eventID}`)
                const feed = this.getTopicByHash(topic)
                if (!feed) return

                const result = feed.addEvent(eventID, header, payload)
                result.then((r) => {
                    if (r.exists) {
                        this.logR.info(`Skip fluff (already existing event) (Topic: ${topic.slice(-6)} ID: ${eventID.slice(-6)})`)
                    } else {
                        this.logR.info(`Fluff result: ${r.result} existing: ${r.exists} (Topic: ${topic.slice(-6)} ID: ${eventID.slice(-6)})`)
                    }
                })
            }, this.embargoTimeMs + getRandomInt(this.embargoJitterMs))
        }
    }

    private async sendEventToRelay(senderPeerID: string, topic: string, eventData: Buffer[]) {
        const feed = this.getTopicByHash(topic)
        if (!feed) return false
        
        if (!this.routingMaps.has(topic)) {
            this.routingMaps.set(topic, new RoutingTable(this.peerId))
        }
        this.routingMaps.get(topic)!.updatePeers([...feed.getPeerList()])

        const peerID = this.routingMaps.get(topic)!.getDestination(senderPeerID)
        this.logR.info(`Sending stem event with topic "${topic.slice(-6)}" to relay Peer ${peerID?.slice(-6)}`)
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

export class LDRelayerNode extends RelayerNodeBase<RelayedLambdadelta> {
    protected newFeed(topicHash: string) {
        const feed = new RelayedLambdadelta(
            topicHash,
            this.corestore,
            this.rln!
        )
        feed.setRelayer(this)
        return feed
    }
}