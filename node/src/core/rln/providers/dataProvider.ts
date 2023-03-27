import { IncrementalMerkleTree, MerkleProof } from "@zk-kit/incremental-merkle-tree"
import { hashBigint } from "../utils/hash"
import poseidon from 'poseidon-lite'

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
            this.pastRootsRemoved.set(this.members.root, event.time) // Set time the current root was invalidated
            const rateCommitment = this.getRateCommitment(BigInt(event.commitment), event.multiplier)
            if (event.type == "ADD") {
                this.members.insert(rateCommitment)
            }
            if (event.type == "REMOVE") {
                this.members.delete(event.entryIndex || this.members.indexOf(rateCommitment))
            }
            this.multipliers.set(BigInt(event.commitment), event.multiplier)
            this.pastRootsAdded.set(this.members.root, event.time) // Set time this root became the root
            this.lastEvent++
        }
    }

    public async getRootTimeRange(root: string) {
        const addedTime = this.pastRootsAdded.get(root)
        if (addedTime) return [addedTime, this.pastRootsRemoved.get(root)]
        return await this.retrieveRoot(root)
    }

    public getMultiplier(commitment: bigint) {
        return this.multipliers.get(commitment)
    }

    public getRateCommitment(commitment: bigint, multiplier?: number) {
        return poseidon([commitment, BigInt(multiplier || 1)])
    }

    public createMerkleProof(commitment: bigint, multiplier?: number) {
        return this.members.createProof(
            this.members.indexOf(this.getRateCommitment(commitment, multiplier))
        )
    }

    public createMerkleProofFromIndex(index: number) {
        return this.members.createProof(index)
    }

    public indexOf(commitment: bigint, multiplier?: number){
        return this.members.indexOf(
            this.getRateCommitment(commitment, multiplier)
        )
    }
    
    public getRoot() {
        return this.members.root
    }

    protected abstract loadEvents(lastEventIndex: number): Promise<GroupEvent[]>
    protected abstract retrieveRoot(root: string): Promise<(number | undefined)[]>
}