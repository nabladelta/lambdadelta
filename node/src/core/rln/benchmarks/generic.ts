import 'jest'
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint } from '../utils/hash'
import { generateProof, RLNGFullProof, verifyProof } from '../rln_generic'
import { getZKFiles } from '../utils/files'

const SCHEME = 'groth16'
const TREE_DEPTH = 20

const t = async () => {
    const identity = new Identity()

    const enullifiers = [
        {nullifier: "Test nullifier1", messageId: 5, messageLimit: 6},
        {nullifier: "Test nullifier2", messageId: 10, messageLimit: 7}]
    const signal = "This is a test signal"
    const identifier = "32"

    const tree = new IncrementalMerkleTree(poseidon, TREE_DEPTH, hashBigint(identifier), 2)
    const rateCommitment = poseidon([identity.commitment, BigInt(2)])
    tree.insert(rateCommitment)
    const merkleProof = tree.createProof(tree.indexOf(rateCommitment))

    const {vKey, files, scheme} = getZKFiles('rln-multiplier-generic', SCHEME)

    let proof: RLNGFullProof
    for (let i = 0; i < 10; i++) {
        const initialtime = Date.now()
        proof = await generateProof(
            identity,
            merkleProof,
            enullifiers,
            signal,
            {
                scheme,
                ...files,
                rlnIdentifier: 1,
                userMessageLimitMultiplier: 2,
            })
        const mid = Date.now()
        console.log('prove', mid - initialtime, 'ms')
        const result = await verifyProof(proof, {vKey, scheme})

        if (proof.snarkProof.publicSignals.merkleRoot !== tree.root.toString()) console.log(false)
        if (!result) console.log(result)
        
        const final = Date.now()
        console.log('verify', final - mid, 'ms')
    }
    process.exit()
}

t()