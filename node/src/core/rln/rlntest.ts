import { readFileSync } from "fs"
import path from "path"
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import hash from "./utils/hash"
import { Group } from "@semaphore-protocol/group"
import { generateProof, verifyProof } from "./rln"

// This assumes you have built the circom circuits and placed them into the folder ./zkeyFiles
const zkeyFilesPath = "./zkeyFiles"
const vkeyPath = path.join(zkeyFilesPath, "verification_key.json")
const vKey = JSON.parse(readFileSync(vkeyPath, "utf-8"))
const wasmFilePath = path.join(zkeyFilesPath, "rln.wasm")
const finalZkeyPath = path.join(zkeyFilesPath, "rln_final.zkey")

const f = (async () => {
    // Instantiate RLN
    const identity = new Identity()

    const enullifier = "Test nullifier"
    const signal = "This is a test signal"

    const identifier = "32"
    const TREE_DEPTH = 20

    const tree = new IncrementalMerkleTree(poseidon, TREE_DEPTH, hash(identifier), 2)
    tree.insert(identity.commitment)
    const merkleProof = tree.createProof(tree.indexOf(identity.commitment))

    const group = new Group("32", TREE_DEPTH)
    group.addMember(identity.commitment)

    const merkleProof2 = group.generateMerkleProof(group.indexOf(identity.commitment))

    console.log(merkleProof.root, merkleProof2.root)

    const n = Date.now()

    const proof = await generateProof(identity, merkleProof, enullifier, signal, {
        wasmFilePath: wasmFilePath,
        zkeyFilePath: finalZkeyPath 
    })

    const result = await verifyProof(proof, vKey)

    console.log(result)
    console.log(Date.now() - n)
})()