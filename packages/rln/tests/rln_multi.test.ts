import 'jest'
import { readFileSync } from "fs"
import path from "path"
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { Group } from "@semaphore-protocol/group"
import { hashBigint } from '../src/core/rln/utils/hash'
import { generateMultiProof, RLNMFullProof, verifyMultiProof } from '../src/core/rln/rln_multi'

const zkeyFilesPath = "./zkeyfiles_multi"
const vkeyPath = path.join(zkeyFilesPath, "verification_key.json")
const vKey = JSON.parse(readFileSync(vkeyPath, "utf-8"))
const wasmFilePath = path.join(zkeyFilesPath, "rln-multi.wasm")
const finalZkeyPath = path.join(zkeyFilesPath, "rln_final.zkey")

describe.only('RLN', () => {
    let proof: RLNMFullProof

    it('Creates a proof', async () => {
            // Instantiate RLN
        const identity = new Identity()

        const enullifier_multi = "Test nullifier"
        const enullifier_single = ""
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

        proof = await generateMultiProof(identity, merkleProof, enullifier_multi, 5, 10, enullifier_single, signal, {
            wasmFilePath: wasmFilePath,
            zkeyFilePath: finalZkeyPath 
        })
    })

    it('Verifies the proof', async () => {
        const result = await verifyMultiProof(proof, vKey)
        expect(result).toBe(true)
    })
})