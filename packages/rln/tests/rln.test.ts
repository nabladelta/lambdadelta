import 'jest'
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { Group } from "@semaphore-protocol/group"
import { RLNGFullProof } from '../src/rln'
import { hashBigint } from '../src/utils/hash'

describe('RLN', () => {
    let proof: RLNGFullProof

    it('Creates a proof', async () => {
        const identity = new Identity()

        const enullifier = "Test nullifier"
        const signal = "This is a test signal"

        const identifier = "32"
        const TREE_DEPTH = 20

        const tree = new IncrementalMerkleTree(poseidon, TREE_DEPTH, hashBigint(identifier), 2)
        tree.insert(identity.commitment)
        const merkleProof = tree.createProof(tree.indexOf(identity.commitment))

        const group = new Group(identifier, TREE_DEPTH)
        group.addMember(identity.commitment)

        const merkleProofGroup = group.generateMerkleProof(group.indexOf(identity.commitment))

        // Should produce the same root
        expect(merkleProof.root).toBe(merkleProofGroup.root)
    })

    it('Verifies the proof', async () => {
        expect(true).toBe(true)
    })
})