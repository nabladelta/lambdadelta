import { RLN, VerificationResult } from "@nabladelta/rln"
import { ISettingsParam, Logger } from "tslog"
import crypto from "crypto"
import { Libp2p } from "libp2p"
import { PubSub } from "@libp2p/interface/pubsub"
import { KadDHT } from "@libp2p/kad-dht"
import { NullifierSpec, verifyEventHeader } from "./verifyEventHeader.js"
import { LambdadeltaFeed } from "./feed.js"
import { MessageIdRegistry } from "./messageIdRegistry.js"
import { LambdadeltaSync } from "./sync.js"
import { createEvent } from "./create.js"
import type { Datastore } from 'interface-datastore'
import { MemoryDatastore } from "datastore-core"
import { MemberTracker } from "./membershipTracker.js"
import { EventRelayer } from "./dandelion/eventRelayer.js"
import { createLibp2p } from "./libp2p/createLibP2P.js"
import { Crypter, decrypt, encrypt } from "./encrypt.js"

/**
 * Configuration options for creating a Lambdadelta instance.
 */
export interface LambdadeltaOptions {
    /**
     * Name of the Topic for this instance.
     */
    topic: string;

    /**
     * Group ID for this instance. The instance will not connect to nodes with a different group ID.
     */
    groupID: string;

    /**
     * RLN instance for proof verification and generation.
     */
    rln: RLN;

    /**
     * Optional libp2p instance for network communication.
     * Contains sub-properties for pubsub and dht configurations.
     */
    libp2p?: Libp2p<{ pubsub: PubSub; dht: KadDHT }>;

    /**
     * (Optional) After startup, incoming events will be collected and buffered for this period of time (in milliseconds),
     * and processed afterwards. Recommended for safer initial consensus calculation.
     */
    initialSyncPeriodMs?: number;

    /**
     * Optional datastore for persistence. If not provided, a MemoryDatastore will be used.
     */
    store?: Datastore;

    /**
     * Optional logger instance for this Lambdadelta instance.
     * If not provided, a new logger instance will be created.
     */
    logger?: Logger<unknown>;
}

export interface LambdadeltaConstructorOptions<Feed extends LambdadeltaFeed> {
    topic: string,
    groupID: string,
    rln: RLN,
    store: Datastore,
    libp2p: Libp2p<{ pubsub: PubSub; dht: KadDHT }>,
    feed: (...args: ConstructorParameters<typeof LambdadeltaFeed>) => Feed,
    sync: (...args: ConstructorParameters<typeof LambdadeltaSync>) => LambdadeltaSync<LambdadeltaFeed>,
    relayer: (...args: ConstructorParameters<typeof EventRelayer>) => EventRelayer<LambdadeltaFeed, LambdadeltaSync<LambdadeltaFeed>>,
    initialSyncPeriodMs: number,
    logger?: Logger<unknown>
}

/**
 * Main class for the Lambdadelta library
 * Represents a decentralized feed of events over a particular topic, with an optional Dandelion++ relay for event propagation
 * @typeParam Feed Type of the feed for this instance
 * @typeParam Sync Type of the peer sync for this instance
 * @typeParam Relayer Type of the Dandelion++ relayer for this instance
 */
export class Lambdadelta<Feed extends LambdadeltaFeed> {
    public static appID = "LDD" as const
    public static protocolVersion = "1.0.0" as const
    public static protocol = `/lambdadelta/${this.protocolVersion}` as const
    public static get storePrefix () {
        return {
            base: `${this.protocol}`,
            sync: `${this.protocol}/sync`,
            feed: `${this.protocol}/feed`,
            mid: `${this.protocol}/mid`,
            relayer: `${this.protocol}/dandelion`,
            main: `${this.protocol}/main`
        } as const
    }
    private rln: RLN
    private nullifierRegistry: MessageIdRegistry
    private topicName: string
    protected topicHash: string
    private groupID: string
    protected feed: Feed
    protected sync: LambdadeltaSync<LambdadeltaFeed>
    protected relayer: EventRelayer<LambdadeltaFeed, LambdadeltaSync<LambdadeltaFeed>>
    protected store: Datastore
    protected nullifierSpecs: Map<string, NullifierSpec[]> = new Map()
    private log: Logger<unknown>
    private _libp2p: Libp2p<{ pubsub: PubSub; dht: KadDHT }>
    protected encryption: Crypter

    public get topic(): string {
        return this.topicName
    }

    public get group(): string {
        return this.groupID
    }

    public get libp2p(): Libp2p<{ pubsub: PubSub; dht: KadDHT }> {
        return this._libp2p
    }

    constructor(
        {
            topic,
            groupID,
            rln,
            store,
            libp2p,
            feed,
            sync,
            relayer,
            initialSyncPeriodMs,
            logger
        }: LambdadeltaConstructorOptions<Feed>
    ) {
        this.store = store
        this.rln = rln
        this.topicName = topic
        this.groupID = groupID
        this._libp2p = libp2p
        this.topicHash = this.getTopicHash(topic, 'public').toString('hex')
        const encryptionKey = this.getTopicHash(topic, 'key').toString('hex')
        const crypter: Crypter = {
            encrypt: (data: Uint8Array) => encrypt(data, encryptionKey),
            decrypt: (data: Uint8Array) => decrypt(data, encryptionKey)
        }
        this.encryption = crypter
        this.log = logger?.getSubLogger({name: this.topicName}) || new Logger({
            name: `LDD-${this.topicName}`,
            prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t[{{name}}]\t",
        })

        this.log.info(`Starting Lambdadelta for topic ${topic} with group ID ${groupID}`)
        this.registerTypes()

        this.nullifierRegistry = new MessageIdRegistry(this, this.prefix.mid, this.store)
        const memberTracker = new MemberTracker(this.getSubLogger({name: "tracker"}))

        this.feed = feed({storePrefix: this.prefix.feed, topic: this.topicHash, memberTracker, store, logger: this.getSubLogger({name: "feed"})})
        
        this.sync = sync(this.prefix.sync, this.prefix.sync, this.feed, this.store, memberTracker, this.rln, crypter, this.nullifierSpecs, libp2p, this.getSubLogger({name: 'sync'}), initialSyncPeriodMs)
        this.relayer = relayer(this.prefix.relayer, this.prefix.relayer, this.feed, this.sync, this.store, memberTracker, libp2p, crypter, this.getSubLogger({name: 'relayer'}))
    }

    /**
     * Creates a new Lambdadelta instance with the provided options.
     *
     * @param {LambdadeltaOptions} options - Configuration options for the Lambdadelta instance.
     * @param components Custom components for feed, sync, and relayer
     * @returns {Promise<Lambdadelta>} Returns a new Lambdadelta instance.
     */
    public static async createCustom<Feed extends LambdadeltaFeed, Sync extends LambdadeltaSync<Feed>, Relayer extends EventRelayer<Feed, Sync>>(
        {
            topic,
            groupID,
            rln,
            libp2p,
            store,
            logger,
            initialSyncPeriodMs,
        }: LambdadeltaOptions,
        components: {
            feed: (...args: ConstructorParameters<typeof LambdadeltaFeed>) => Feed,
            sync: (...args: ConstructorParameters<typeof LambdadeltaSync>) => Sync,
            relayer: (...args: ConstructorParameters<typeof EventRelayer>) => Relayer,
        }
    ): Promise<Lambdadelta<Feed>> {
        store = store || new MemoryDatastore()
        libp2p = libp2p || await createLibp2p(store)
        const {feed, sync, relayer} = components
        const lambdadelta = new Lambdadelta<Feed>({ topic, groupID, rln, store, libp2p, feed, sync, relayer, logger, initialSyncPeriodMs: initialSyncPeriodMs || 0})
        await lambdadelta.start()
        return lambdadelta
    }

    /**
     * Creates a new Lambdadelta instance with the provided options.
     *
     * @param {LambdadeltaOptions} options - Configuration options for the Lambdadelta instance.
     * @returns {Promise<Lambdadelta>} Returns a new Lambdadelta instance.
     */
    public static async create(options: LambdadeltaOptions) {
        return await Lambdadelta.createCustom(options, {
            feed: LambdadeltaFeed.create,
            sync: LambdadeltaSync.create,
            relayer: EventRelayer.create
        })
    }

    public async start() {
        await this.relayer.start()
        await this.sync.start()
    }

    /**
     * Get the `Datastore` prefix for a given namespace.
     * Different namespaces are used for different purposes, such as storing the feed, the sync state, etc.
     * This allows a user to mount different `Datastore`s for each purpose using a `MountDatastore`, if desired.
     * It's recommended to use `Lambdadelta.storePrefix` for that purpose instead of this method, however, since that will apply to all instances.
     */
    public get prefix() {
        return {
            sync: `${Lambdadelta.storePrefix.sync}/${this.topicHash}`,
            feed: `${Lambdadelta.storePrefix.feed}/${this.topicHash}`,
            mid: `${Lambdadelta.storePrefix.mid}/${this.topicHash}`,
            relayer: `${Lambdadelta.storePrefix.relayer}/${this.topicHash}`,
            main: `${Lambdadelta.storePrefix.main}/${this.topicHash}`
        }
    }

    /**
     * Register the event types for this feed
     * To be overridden by subclasses
     * @internal
     */
    protected registerTypes() {
        const spec: NullifierSpec = {
            epoch: 1,
            messageLimit: 1
        }
        this.addEventType("POST", [spec, spec])
    }

    /**
     * Register a new event type for this feed 
     * @param eventType Name for this type
     * @param specs Specifications for the nullifiers used in this event
     */
    public addEventType(eventType: string, specs: NullifierSpec[]) {
        this.nullifierSpecs.set(eventType, specs)
    }

    /**
     * Get the nullifier specs for a given event type
     * @param eventType Name of the event type
     * @returns Nullifier specs for this event type
     */
    public getNullifierSpecs(eventType: string) {
        return this.nullifierSpecs.get(eventType)
    }

    /**
     * Shutdown this Lambdadelta instance. Does not delete any already persisted data.
     * Does not disconnect from the network, but ignores incoming messages.
     */
    public async shutdown() {
        await this.relayer.stop()
        await this.sync.stop()
        this.feed.close()
    }

    /**
     * Get confirmed events from the feed
     * @returns Array of event data
     */
    public async getEvents(
        startTime: number = 0,
        endTime?: number,
        maxLength?: number
    ) {
        return this.feed.getEvents(startTime, endTime, maxLength)
    }

    /**
     * Get a single event based on its ID
     * @param eventID ID of the event
     * @returns Event data
     */
    public async getEventByID(eventID: string) {
        return this.feed.getEventByID(eventID)
    }

    /**
     * Public API for the creation and publication of a new event
     * @param eventType Type for this event
     * @param payloadHash Hash of the payload for this event
     * @param relay Boolean indicating if the event should be relayed through the Dandelion++ protocol (true) or published directly (false, default)
     * @returns Object with the result of the operation, the event ID, and a boolean indicating if the event already existed
     */
    public async newEvent(eventType: string, payloadHash: string, relay: boolean = false) {
        const nullifiers = await this.nullifierRegistry.createNullifier(eventType)
        const [eventHeader, proof, eventID] = await createEvent(this.rln, this.topicHash, eventType, nullifiers, payloadHash)
        const result = await verifyEventHeader(proof, eventHeader, this.topicHash, this.nullifierSpecs, this.rln)
        if (this.feed.eventExists(eventID)) {
            return { result: false, eventID, exists: true }
        }
        if (result == VerificationResult.VALID) {
            if (relay) {
                const relayResult = await this.relayer.relayEvent(eventHeader, proof)
                return { result: relayResult.result, eventID, exists: relayResult.exists || false }
            }
            this.log.info(`Publishing event ${eventID.slice(-6)} to feed`)
            return await this.feed.addEvent(proof, eventHeader)
        }
        return {result, eventID, exists: false}
    }

    public getSubLogger(settings?: ISettingsParam<unknown>) {
        return this.log.getSubLogger(settings)
    }

    /**
     * Returns a namespaced identifier for a given topic and namespace.
     * Ensures that different applications based on this library, 
     * as well as incompatible versions of the same app,
     * will generate different hashes for the same topic.
     * Topic hashes are used by nodes in order to find each other through the DHT.
     * Thanks to this, incompatible nodes will not try to connect to each other.
     * @param topic Topic name
     * @param namespace Namespace for the hash
     * @returns A hash commitment to this topic
     */
    private getTopicHash(topic: string, namespace: string) {
        return crypto
            .createHash('sha256')
            .update(Lambdadelta.appID)
            .update(Lambdadelta.protocolVersion)
            .update(this.groupID)
            .update(namespace)
            .update(topic).digest()
    }

}