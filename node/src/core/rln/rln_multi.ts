import { Identity } from '@semaphore-protocol/identity'
import { MerkleProof } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint, hashString} from "./utils/hash"
import { groth16 } from 'snarkjs'
import { BigNumberish, Group } from "@semaphore-protocol/group"
import { StrBigInt } from 'rlnjs'

export async function verifyMultiProof(
        rlnRullProof: RLNMFullProof,
        verificationKey: any
    ): Promise<boolean> {
    const { publicSignals, proof } = rlnRullProof.snarkProof

    return groth16.verify(
        verificationKey,
        [
            publicSignals.merkleRoot,
            publicSignals.y_mm,
            publicSignals.nullifierMultiMessage,
            publicSignals.y_sm,
            publicSignals.nullifierSingleMessage,
            publicSignals.signalHash,
            publicSignals.externalNullifierMultiMessage,
            publicSignals.messageLimit,
            publicSignals.externalNullifierSingleMessage,
        ],
        proof,
    )
}

export async function generateMultiProof(
        identity: Identity,
        groupOrMerkleProof: Group | MerkleProof,
        externalNullifierMulti: string,
        messageId: number,
        messageLimit: number,
        externalNullifierSingle: string,
        signal: string,
        snarkArtifacts: {
            wasmFilePath: string
            zkeyFilePath: string
        },
        rlnIdentifier?: BigNumberish
    ): Promise<RLNMFullProof> {

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
        externalNullifierMultiMessage: poseidon([
            hashString(externalNullifierMulti),
            hashBigint(rlnIdentifier)
        ]),
        messageId: BigInt(messageId),
        messageLimit: BigInt(messageLimit),
        externalNullifierSingleMessage: poseidon([
            hashString(externalNullifierSingle),
            hashBigint(rlnIdentifier)
        ]),
    }

    return {
        snarkProof: await prove(witness,
                    snarkArtifacts.wasmFilePath,
                    snarkArtifacts.zkeyFilePath
                ),
        signal,
        eNullifierMulti: externalNullifierMulti,
        eNullifierSingle: externalNullifierSingle,
        messageLimit: messageLimit,
        rlnIdentifier: rlnIdentifier
    }
}


export interface RLNMFullProof {
    snarkProof: RLNMSNARKProof
    signal: string
    rlnIdentifier: BigNumberish
    eNullifierMulti: string
    eNullifierSingle: string
    messageLimit: number
}

interface RLNMWitnessT {
    identitySecret: bigint
    pathElements: any[]
    identityPathIndex: number[]
    x: string | bigint
    externalNullifierMultiMessage: bigint,
    messageId: bigint,
    externalNullifierSingleMessage: bigint,
}

async function prove(
        witness: RLNMWitnessT,
        wasmFilePath: string,
        zkeyFilePath: string
    ): Promise<any> {
    const { proof, publicSignals } = await groth16.fullProve(
        witness,
        wasmFilePath,
        zkeyFilePath,
        null,
    )
    console.log(publicSignals)
    return {
        proof,
        publicSignals: {
          merkleRoot: publicSignals[0],
          y_mm: publicSignals[1],
          nullifierMultiMessage: publicSignals[2],
          y_sm: publicSignals[3],
          nullifierSingleMessage: publicSignals[4],
          signalHash: publicSignals[5],
          externalNullifierMultiMessage: publicSignals[6],
          messageLimit: publicSignals[7],
          externalNullifierSingleMessage: publicSignals[8],
        },
    }
}

export type RLNMPublicSignals = {
    merkleRoot: StrBigInt,
    y_mm: StrBigInt,
    nullifierMultiMessage: StrBigInt,
    y_sm: StrBigInt,
    nullifierSingleMessage: StrBigInt,
    signalHash: StrBigInt,
    externalNullifierMultiMessage: StrBigInt,
    messageLimit: StrBigInt,
    externalNullifierSingleMessage: StrBigInt,
};
/**
 * SNARK proof that contains both proof and public signals.
 * Can be verified directly by a SNARK verifier.
 */
export type RLNMSNARKProof = {
    proof: Proof;
    publicSignals: RLNMPublicSignals;
}

export interface Proof {
    pi_a: StrBigInt[];
    pi_b: StrBigInt[][];
    pi_c: StrBigInt[];
    protocol: string;
    curve: string;
}