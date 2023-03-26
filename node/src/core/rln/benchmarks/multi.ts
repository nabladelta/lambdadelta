import 'jest'
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint, hashString } from '../utils/hash'
import { generateMultiProof, RLNMFullProof, verifyMultiProof } from './bindings/rln_multi'
import { getZKFiles } from '../utils/files'

const SCHEME = 'groth16'
const TREE_DEPTH = 20

const t = async () => {
    const identity = new Identity()

    const enullifier_multi = "Test nullifier"
    const enullifier_single = ""
    const signal = "This is a test signal"

    const identifier = "32"

    const tree = new IncrementalMerkleTree(poseidon, TREE_DEPTH, hashBigint(identifier), 2)
    tree.insert(identity.commitment)
    const merkleProof = tree.createProof(tree.indexOf(identity.commitment))

    const {vKey, files} = getZKFiles('rln-multi', SCHEME)

    let proof: RLNMFullProof
    for (let i = 0; i < 10; i++) {
        const initialtime = Date.now()
        proof = await generateMultiProof(identity, merkleProof, enullifier_multi, 5, 10, enullifier_single, signal, files, "0", SCHEME)
        const mid = Date.now()
        console.log('prove', mid - initialtime, 'ms')
        const result = await verifyMultiProof(proof, vKey, SCHEME)
        const final = Date.now()
        console.log('verify', final - mid, 'ms')
    }
    process.exit()
}

t()