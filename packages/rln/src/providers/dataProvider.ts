import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import { hashBigint } from "../utils/hash"
import { poseidon2 } from 'poseidon-lite'
import { getTimestampInSeconds } from "../utils/time"

export type GroupEvent = {
    type: "ADD"
    time: number
    commitment: string
    multiplier: number
    entryIndex?: number
} | {
    type: "REMOVE"
    time: number
    commitment?: string
    multiplier?: number
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
        this.members = new IncrementalMerkleTree(poseidon2, treeDepth, hashBigint(gid), 2)
        this.gid = hashBigint(gid)
        this.pastRootsAdded = new Map()
        this.pastRootsRemoved = new Map()
        this.multipliers = new Map()
        this.lastEvent = 0
    }

    public async update() {
        const events = await this.loadEvents(this.lastEvent)
        for (let event of events) {
            this.pastRootsRemoved.set(this.members.root.toString(16), event.time) // Set time the current root was invalidated
            if (event.type == "ADD") {
                const commitment = BigInt(event.commitment)
                const rateCommitment = GroupDataProvider.getRateCommitment(commitment, event.multiplier)
                this.members.insert(rateCommitment)
                this.multipliers.set(commitment, event.multiplier)
            }
            if (event.type == "REMOVE") {
                if (event.entryIndex) {
                    this.members.delete(event.entryIndex)
                } else if (event.entryIndex === undefined && event.commitment !== undefined && event.multiplier !== undefined) {
                    const rateCommitment = GroupDataProvider.getRateCommitment(BigInt(event.commitment), event.multiplier)
                    this.members.delete(this.members.indexOf(rateCommitment))
                } else {
                   throw new Error("Invalid event")
                }
            }
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
        return poseidon2([commitment, BigInt(multiplier || 1)])
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

    public static createEvent(commitment: bigint, multiplier?: number, type: "ADD" | "REMOVE" = "ADD"): GroupEvent {
        return {
            type,
            commitment: '0x'+commitment.toString(16),
            time: getTimestampInSeconds(),
            multiplier: multiplier || 1
        }
    }

    protected abstract loadEvents(lastEventIndex: number): Promise<GroupEvent[]>
    protected abstract retrieveRoot(root: string): Promise<(number | undefined)[]>
    public abstract slash(secretIdentity: bigint): Promise<void>
}