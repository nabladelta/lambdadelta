import { IncrementalMerkleTree, MerkleProof } from "@zk-kit/incremental-merkle-tree"
import { hashBigint } from "../utils/hash"
import poseidon from 'poseidon-lite'

export interface GroupEvent {
    type: "ADD" | "REMOVE"
    time: number
    commitment: string
    entryIndex?: number
}

export abstract class GroupDataProvider {
    protected members: IncrementalMerkleTree
    public gid: bigint
    private pastRootsRemoved: Map<string, number> // Merkle root => timestamp
    private pastRootsAdded: Map<string, number> // Merkle root => timestamp
    private lastEvent: number

    protected constructor(gid: string, treeDepth: number) {
        this.members = new IncrementalMerkleTree(poseidon, treeDepth, hashBigint(gid), 2)
        this.gid = hashBigint(gid)
        this.pastRootsAdded = new Map()
        this.pastRootsRemoved = new Map()
        this.lastEvent = 0
    }

    public async update() {
        const events = await this.loadEvents(this.lastEvent)
        for (let event of events) {
            this.pastRootsRemoved.set(this.members.root, event.time) // Set time the current root was invalidated
            if (event.type == "ADD") {
                this.members.insert(BigInt(event.commitment))
            }
            if (event.type == "REMOVE") {
                this.members.delete(event.entryIndex || this.members.indexOf(event.commitment))
            }
            this.pastRootsAdded.set(this.members.root, event.time) // Set time this root became the root
            this.lastEvent++
        }
    }

    public async getRootTimeRange(root: string) {
        const addedTime = this.pastRootsAdded.get(root)
        if (addedTime) return [addedTime, this.pastRootsRemoved.get(root)]
        return await this.retrieveRoot(root)
    }

    public createMerkleProof(commitment: bigint) {
        return this.members.createProof(this.members.indexOf(commitment))
    }

    public createMerkleProofFromIndex(index: number) {
        return this.members.createProof(index)
    }

    public indexOf(commitment: bigint){
        return this.members.indexOf(commitment)
    }
    
    public getRoot() {
        return this.members.root
    }

    protected abstract loadEvents(lastEventIndex: number): Promise<GroupEvent[]>
    protected abstract retrieveRoot(root: string): Promise<(number | undefined)[]>
}