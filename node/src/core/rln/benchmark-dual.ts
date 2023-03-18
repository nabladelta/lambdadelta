import 'jest'
import { readFileSync } from "fs"
import path from "path"
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { Group } from "@semaphore-protocol/group"
import { hashBigint } from './utils/hash'
import { generateDualProof, RLNDFullProof, verifyDualProof } from './rln_same_dual'
import { getZKFiles } from './utils/files'

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

    const {vKey, files} = getZKFiles('rln-same-dual', 'plonk')

    let proof: RLNDFullProof
    for (let i = 0; i < 10; i++) {
        const initialtime = Date.now()
        proof = await generateDualProof(identity, merkleProof, 
            enullifier_multi, 5, 10, enullifier_single, 6, 7, signal, files, "0", 'plonk')
        const mid = Date.now()
        console.log('prove', mid - initialtime, 'ms')
        const result = await verifyDualProof(proof, vKey, 'plonk')
        if (!result) console.log(result)
        const final = Date.now()
        console.log('verify', final - mid, 'ms')
    }
}

t()