import { Identity } from '@semaphore-protocol/identity'
import { MerkleProof } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint, hashString} from "../../utils/hash"
import { RLNSNARKProof, RLNWitnessT } from "rlnjs/dist/types/types"
import { plonk, groth16 } from 'snarkjs'
import { BigNumberish, Group } from "@semaphore-protocol/group"
export interface RLNFullProof {
    snarkProof: RLNSNARKProof
    signal: string
    eNullifier: string,
    rlnIdentifier: BigNumberish
}

export async function verifyProof(
        rlnFullProof: RLNFullProof,
        verificationKey: any,
        scheme?: 'groth16' | 'plonk'
    ): Promise<boolean> {
    const { publicSignals, proof } = rlnFullProof.snarkProof
    const expectedExternalNullifier = poseidon([
            hashString(rlnFullProof.eNullifier),
            hashBigint(rlnFullProof.rlnIdentifier)
    ])
    if (expectedExternalNullifier !== BigInt(
        rlnFullProof.snarkProof.publicSignals.externalNullifier)) {
        return false
    }
    const expectedSignalHash = hashString(rlnFullProof.signal)
    if (expectedSignalHash !== BigInt(publicSignals.signalHash)) {
        return false
    }
    const prover = scheme === 'plonk' ? plonk : groth16
    return prover.verify(
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
        rlnIdentifier?: BigNumberish,
        scheme?: 'groth16' | 'plonk'
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
        identitySecret: poseidon([identity.nullifier, identity.trapdoor]),
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
                    snarkArtifacts.zkeyFilePath,
                    scheme
                ),
        signal,
        eNullifier: externalNullifier,
        rlnIdentifier: rlnIdentifier
    }
}

async function prove(
        witness: RLNWitnessT,
        wasmFilePath: string,
        zkeyFilePath: string,
        scheme?: 'groth16' | 'plonk'
    ): Promise<RLNSNARKProof> {
    
    const prover = scheme === 'plonk' ? plonk : groth16
    const { proof, publicSignals } = await prover.fullProve(
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