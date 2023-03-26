import 'jest'
import { readFileSync } from "fs"
import path from "path"
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { Group } from "@semaphore-protocol/group"
import { generateProof, verifyProof } from '../src/core/rln/benchmarks/bindings/rln'
import { hashBigint, hashString } from '../src/core/rln/utils/hash'
import { RLNFullProof } from '../src/core/rln/types/rln'

const zkeyFilesPath = "./zkeyFiles"
const vkeyPath = path.join(zkeyFilesPath, "verification_key.json")
const vKey = JSON.parse(readFileSync(vkeyPath, "utf-8"))
const wasmFilePath = path.join(zkeyFilesPath, "rln.wasm")
const finalZkeyPath = path.join(zkeyFilesPath, "rln_final.zkey")

describe('RLN', () => {
    let proof: RLNFullProof

    it('Creates a proof', async () => {
            // Instantiate RLN
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

        proof = await generateProof(identity, merkleProof, enullifier, signal, {
            wasmFilePath: wasmFilePath,
            zkeyFilePath: finalZkeyPath 
        })
    })

    it('Verifies the proof', async () => {
        const result = await verifyProof(proof, vKey)
        expect(result).toBe(true)
    })
})