import { Identity } from '@semaphore-protocol/identity'
import { MerkleProof } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint, hashString} from "./utils/hash"
import { RLNSNARKProof, RLNWitnessT } from "rlnjs/dist/types/types"
import { groth16 } from 'snarkjs'
import { BigNumberish, Group } from "@semaphore-protocol/group"
import { RLNFullProof } from './types/rln'

export async function verifyProof(
        rlnRullProof: RLNFullProof,
        verificationKey: any
    ): Promise<boolean> {
    const { publicSignals, proof } = rlnRullProof.snarkProof
    const expectedExternalNullifier = poseidon([
            hashString(rlnRullProof.eNullifier),
            hashBigint(rlnRullProof.rlnIdentifier)
    ])
    if (expectedExternalNullifier !== BigInt(
        rlnRullProof.snarkProof.publicSignals.externalNullifier)) {
        return false
    }
    const expectedSignalHash = hashString(rlnRullProof.signal)
    if (expectedSignalHash !== BigInt(publicSignals.signalHash)) {
        return false
    }
    return groth16.verify(
        verificationKey,
        [
          publicSignals.yShare,
          publicSignals.merkleRoot,
          publicSignals.internalNullifier,
          publicSignals.signalHash,
          publicSignals.externalNullifier,
        ],
        proof,
    )
}

export async function generateProof(
        identity: Identity,
        groupOrMerkleProof: Group | MerkleProof,
        externalNullifier: string,
        signal: string,
        snarkArtifacts: {
            wasmFilePath: string;
            zkeyFilePath: string;
        },
        rlnIdentifier?: BigNumberish
    ): Promise<RLNFullProof> {

    let merkleProof: MerkleProof

    if ("depth" in groupOrMerkleProof) {
        rlnIdentifier = groupOrMerkleProof.id
        const index = groupOrMerkleProof.indexOf(identity.commitment)
        
        if (index === -1) {
            throw new Error("The identity is not part of the group")
        }

        merkleProof = groupOrMerkleProof.generateMerkleProof(index)
    } else {
        if (!rlnIdentifier) rlnIdentifier = "0"
        merkleProof = groupOrMerkleProof
    }

    const witness = {
        identitySecret: identity.commitment,
        pathElements: merkleProof.siblings,
        identityPathIndex: merkleProof.pathIndices,
        x: hashString(signal),
        externalNullifier: poseidon([
            hashString(externalNullifier),
            hashBigint(rlnIdentifier)
        ]),
    }

    return {
        snarkProof: await prove(witness,
                    snarkArtifacts.wasmFilePath,
                    snarkArtifacts.zkeyFilePath
                ),
        signal,
        eNullifier: externalNullifier,
        rlnIdentifier: rlnIdentifier
    }
}

async function prove(
        witness: RLNWitnessT,
        wasmFilePath: string,
        zkeyFilePath: string
    ): Promise<RLNSNARKProof> {
    const { proof, publicSignals } = await groth16.fullProve(
        witness,
        wasmFilePath,
        zkeyFilePath,
        null,
    )
    return {
        proof,
        publicSignals: {
          yShare: publicSignals[0],
          merkleRoot: publicSignals[1],
          internalNullifier: publicSignals[2],
          signalHash: publicSignals[3],
          externalNullifier: publicSignals[4],
        },
    }
}