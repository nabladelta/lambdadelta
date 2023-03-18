import 'jest'
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint } from '../utils/hash'
import { RLNFullProof } from '../types/rln'
import { generateProof, verifyProof } from '../rln'
import { getZKFiles } from '../utils/files'

const SCHEME = 'groth16'
const TREE_DEPTH = 20

const t = async () => {
    const identity = new Identity()

    const enullifier = "Test nullifier"
    const signal = "This is a test signal"

    const identifier = "32"

    const tree = new IncrementalMerkleTree(poseidon, TREE_DEPTH, hashBigint(identifier), 2)
    tree.insert(identity.commitment)
    const merkleProof = tree.createProof(tree.indexOf(identity.commitment))
    const {vKey, files} = getZKFiles('rln', SCHEME)

    let proof: RLNFullProof
    for (let i = 0; i < 10; i++) {
        const initialtime = Date.now()
        proof = await generateProof(identity, merkleProof, enullifier, signal, files, '0', SCHEME)
        const mid = Date.now()
        console.log('prove', mid - initialtime, 'ms')
        const result = await verifyProof(proof, vKey, SCHEME)
        const final = Date.now()
        console.log('verify', final - mid, 'ms')
    }
    process.exit()
}

t()