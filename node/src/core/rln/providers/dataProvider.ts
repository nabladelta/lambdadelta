import { IncrementalMerkleTree, MerkleProof } from "@zk-kit/incremental-merkle-tree"
import { hashBigint } from "../utils/hash"
import poseidon from 'poseidon-lite'
import { Identity } from "@semaphore-protocol/identity"
import { getTimestampInSeconds } from "../../utils/utils"

export interface GroupEvent {
    type: "ADD" | "REMOVE"
    time: number
    commitment: string
    multiplier: number
    entryIndex?: number
}

export abstract class GroupDataProvider {
    protected members: IncrementalMerkleTree
    public gid: bigint
    private pastRootsRemoved: Map<string, number> // Merkle root => timestamp
    private pastRootsAdded: Map<string, number> // Merkle root => timestamp
    private multipliers: Map<bigint, number> // Merkle root => timestamp
    private lastEvent: number

    protected constructor(gid: string, treeDepth: number) {
        this.members = new IncrementalMerkleTree(poseidon, treeDepth, hashBigint(gid), 2)
        this.gid = hashBigint(gid)
        this.pastRootsAdded = new Map()
        this.pastRootsRemoved = new Map()
        this.multipliers = new Map()
        this.lastEvent = 0
    }

    public async update() {
        const events = await this.loadEvents(this.lastEvent)
        for (let event of events) {
            const commitment = BigInt(event.commitment)
            this.pastRootsRemoved.set(this.members.root.toString(16), event.time) // Set time the current root was invalidated
            const rateCommitment = GroupDataProvider.getRateCommitment(commitment, event.multiplier)
            if (event.type == "ADD") {
                this.members.insert(rateCommitment)
            }
            if (event.type == "REMOVE") {
                this.members.delete(event.entryIndex || this.members.indexOf(rateCommitment))
            }
            this.multipliers.set(commitment, event.multiplier)
            this.pastRootsAdded.set(this.members.root.toString(16), event.time) // Set time this root became the root
            this.lastEvent++
        }
    }

    public async getRootTimeRange(root: bigint) {
        const addedTime = this.pastRootsAdded.get(root.toString(16))
        if (addedTime) return [addedTime, this.pastRootsRemoved.get(root.toString(16))]
        return await this.retrieveRoot(root.toString(16))
    }

    public getMultiplier(commitment: bigint) {
        return this.multipliers.get(commitment)
    }

    public static getRateCommitment(commitment: bigint, multiplier?: number) {
        return poseidon([commitment, BigInt(multiplier || 1)])
    }

    public createMerkleProof(commitment: bigint, multiplier?: number) {
        return this.members.createProof(
            this.members.indexOf(GroupDataProvider.getRateCommitment(commitment, multiplier))
        )
    }

    public createMerkleProofFromIndex(index: number) {
        return this.members.createProof(index)
    }

    public indexOf(commitment: bigint, multiplier?: number){
        return this.members.indexOf(
            GroupDataProvider.getRateCommitment(commitment, multiplier)
        )
    }
    
    public getRoot() {
        return this.members.root.toString(16)
    }

    public static createEvent(secret: string, multiplier?: number, type: "ADD" | "REMOVE" = "ADD"): GroupEvent {
        const identity = new Identity(secret)
        GroupDataProvider.getRateCommitment(identity.commitment, multiplier)
        return {
            type,
            commitment: '0x'+identity.commitment.toString(16),
            time: getTimestampInSeconds(),
            multiplier: multiplier || 1
        }
    }

    protected abstract loadEvents(lastEventIndex: number): Promise<GroupEvent[]>
    protected abstract retrieveRoot(root: string): Promise<(number | undefined)[]>
    public abstract slash(secretIdentity: bigint): Promise<void>
}