import 'jest'
import { readFileSync } from "fs"
import path from "path"
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { Group } from "@semaphore-protocol/group"
import { hashBigint, hashString } from './utils/hash'
import { RLNFullProof } from './types/rln'
import { generateMultiProof, RLNMFullProof, verifyMultiProof } from './rln_multi'
import { generateProof, verifyProof } from './rln'

const zkeyFilesPath = "./zkeyFiles"
const vkeyPath = path.join(zkeyFilesPath, "verification_key.json")
const vKey = JSON.parse(readFileSync(vkeyPath, "utf-8"))
const wasmFilePath = path.join(zkeyFilesPath, "rln.wasm")
const finalZkeyPath = path.join(zkeyFilesPath, "rln_final.zkey")


const t = async () => {
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

    let proof: RLNFullProof
    for (let i = 0; i < 10; i++) {
        const initialtime = Date.now()
        proof = await generateProof(identity, merkleProof, enullifier_multi, signal, {
            wasmFilePath: wasmFilePath,
            zkeyFilePath: finalZkeyPath 
        })
        const mid = Date.now()
        console.log('prove', mid - initialtime, 'ms')
        const result = await verifyProof(proof, vKey)
        const final = Date.now()
        console.log('verify', final - mid, 'ms')
    }
}

t()