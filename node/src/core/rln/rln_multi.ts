import { Identity } from '@semaphore-protocol/identity'
import { MerkleProof } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint, hashString } from "./utils/hash"
import { plonk, groth16 } from 'snarkjs'
import { BigNumberish, Group } from "@semaphore-protocol/group"

export type StrBigInt = string | bigint

export async function verifyMultiProof(
        rlnFullProof: RLNMFullProof,
        verificationKey: any,
        scheme?: 'groth16' | 'plonk'
    ): Promise<boolean> {
    const { publicSignals, proof } = rlnFullProof.snarkProof
    const expectedExternalNullifierMulti = poseidon([
        hashString(rlnFullProof.eNullifierMulti),
        hashBigint(rlnFullProof.rlnIdentifier)
    ])
    if (expectedExternalNullifierMulti !== BigInt(
        rlnFullProof.snarkProof.publicSignals.externalNullifierMultiMessage)) {
        return false
    }

    const expectedExternalNullifierSingle = poseidon([
        hashString(rlnFullProof.eNullifierSingle),
        hashBigint(rlnFullProof.rlnIdentifier)
    ])
    if (expectedExternalNullifierSingle !== BigInt(
        rlnFullProof.snarkProof.publicSignals.externalNullifierSingleMessage)) {
        return false
    }

    const expectedSignalHash = hashString(rlnFullProof.signal)
    if (expectedSignalHash !== BigInt(publicSignals.signalHash)) {
        return false
    }

    if (BigInt(rlnFullProof.messageLimit) !== BigInt(publicSignals.messageLimit)) {
        return false
    }
    const prover = scheme === 'plonk' ? plonk : groth16
    return prover.verify(
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
        rlnIdentifier?: BigNumberish,
        scheme?: 'groth16' | 'plonk'
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
                    snarkArtifacts.zkeyFilePath,
                    scheme
                ),
        signal,
        eNullifierMulti: externalNullifierMulti,
        eNullifierSingle: externalNullifierSingle,
        messageLimit: messageLimit,
        rlnIdentifier: rlnIdentifier
    }
}

async function prove(
        witness: RLNMWitnessT,
        wasmFilePath: string,
        zkeyFilePath: string,
        scheme?: 'groth16' | 'plonk'
): Promise<any> {

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

export interface RLNMPublicSignals {
    merkleRoot: StrBigInt,
    y_mm: StrBigInt,
    nullifierMultiMessage: StrBigInt,
    y_sm: StrBigInt,
    nullifierSingleMessage: StrBigInt,
    signalHash: StrBigInt,
    externalNullifierMultiMessage: StrBigInt,
    messageLimit: StrBigInt,
    externalNullifierSingleMessage: StrBigInt,
}

export interface RLNMSNARKProof {
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

export interface RLNMFullProof {
    snarkProof: RLNMSNARKProof
    signal: string
    rlnIdentifier: BigNumberish
    eNullifierMulti: string
    eNullifierSingle: string
    messageLimit: number
}

export interface RLNMWitnessT {
    identitySecret: bigint
    pathElements: any[]
    identityPathIndex: number[]
    x: string | bigint
    externalNullifierMultiMessage: bigint,
    messageId: bigint,
    externalNullifierSingleMessage: bigint,
}
