import { Identity } from '@semaphore-protocol/identity'
import { MerkleProof } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint, hashString } from "./utils/hash"
import { plonk, groth16 } from 'snarkjs'
import { BigNumberish, Group } from "@semaphore-protocol/group"

export type StrBigInt = string | bigint

export async function verifyDualProof(
        rlnFullProof: RLNDFullProof,
        verificationKey: any,
        scheme?: 'groth16' | 'plonk'
    ): Promise<boolean> {
    const { publicSignals, proof } = rlnFullProof.snarkProof
    const expectedExternalNullifierA = poseidon([
        hashString(rlnFullProof.eNullifierA),
        hashBigint(rlnFullProof.rlnIdentifier)
    ])
    if (expectedExternalNullifierA !== BigInt(
        rlnFullProof.snarkProof.publicSignals.externalNullifierA)) {
        return false
    }

    const expectedExternalNullifierB = poseidon([
        hashString(rlnFullProof.eNullifierB),
        hashBigint(rlnFullProof.rlnIdentifier)
    ])
    if (expectedExternalNullifierB !== BigInt(
        rlnFullProof.snarkProof.publicSignals.externalNullifierB)) {
        return false
    }

    const expectedSignalHash = hashString(rlnFullProof.signal)
    if (expectedSignalHash !== BigInt(publicSignals.signalHash)) {
        return false
    }

    if (BigInt(rlnFullProof.messageLimitA) !== BigInt(publicSignals.messageLimitA)) {
        return false
    }
    if (BigInt(rlnFullProof.messageLimitB) !== BigInt(publicSignals.messageLimitB)) {
        return false
    }
    const prover = scheme === 'plonk' ? plonk : groth16
    return prover.verify(
        verificationKey,
        [
            publicSignals.yA,
            publicSignals.yB,
            publicSignals.merkleRoot,
            publicSignals.nullifierA,
            publicSignals.nullifierB,
            publicSignals.signalHash,
            publicSignals.externalNullifierA,
            publicSignals.messageLimitA,
            publicSignals.externalNullifierB,
            publicSignals.messageLimitB
        ],
        proof,
    )
}

export async function generateDualProof(
        identity: Identity,
        groupOrMerkleProof: Group | MerkleProof,
        externalNullifierA: string,
        messageIdA: number,
        messageLimitA: number,
        externalNullifierB: string,
        messageIdB: number,
        messageLimitB: number,
        signal: string,
        snarkArtifacts: {
            wasmFilePath: string
            zkeyFilePath: string
        },
        rlnIdentifier?: BigNumberish,
        scheme?: 'groth16' | 'plonk'
    ) {

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

        externalNullifierA: poseidon([
            hashString(externalNullifierA),
            hashBigint(rlnIdentifier)
        ]),
        messageIdA: BigInt(messageIdA),
        messageLimitA: BigInt(messageLimitA),
        externalNullifierB: poseidon([
            hashString(externalNullifierB),
            hashBigint(rlnIdentifier)
        ]),
        messageIdB: BigInt(messageIdB),
        messageLimitB: BigInt(messageLimitB),
    }
    return {
        snarkProof: await prove(witness,
                    snarkArtifacts.wasmFilePath,
                    snarkArtifacts.zkeyFilePath,
                    scheme
                ),
        signal,
        eNullifierA: externalNullifierA,
        eNullifierB: externalNullifierB,
        messageLimitA: messageLimitA,
        messageLimitB: messageLimitB,
        rlnIdentifier: rlnIdentifier
    }
}

async function prove(
        witness: RLNDWitnessT,
        wasmFilePath: string,
        zkeyFilePath: string,
        scheme?: 'groth16' | 'plonk'
    ): Promise<RLNDSNARKProof> {
    
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
            yA: publicSignals[0],
            yB: publicSignals[1],
            merkleRoot: publicSignals[2],
            nullifierA: publicSignals[3],
            nullifierB: publicSignals[4],
            signalHash: publicSignals[5],
            externalNullifierA: publicSignals[6],
            messageLimitA: publicSignals[7],
            externalNullifierB: publicSignals[8],
            messageLimitB: publicSignals[9],
        },
    }
}

export interface RLNDPublicSignals {
    yA: StrBigInt,
    yB: StrBigInt,
    merkleRoot: StrBigInt,
    nullifierA: StrBigInt,
    nullifierB: StrBigInt,
    signalHash: StrBigInt,
    externalNullifierA: StrBigInt,
    messageLimitA: StrBigInt,
    externalNullifierB: StrBigInt,
    messageLimitB: StrBigInt,
}

export interface RLNDSNARKProof {
    proof: Proof;
    publicSignals: RLNDPublicSignals;
}

export interface Proof {
    pi_a: StrBigInt[];
    pi_b: StrBigInt[][];
    pi_c: StrBigInt[];
    protocol: string;
    curve: string;
}

export interface RLNDFullProof {
    snarkProof: RLNDSNARKProof
    signal: string
    rlnIdentifier: BigNumberish
    eNullifierA: string
    eNullifierB: string
    messageLimitA: number
    messageLimitB: number
}

export interface RLNDWitnessT {
    identitySecret: bigint
    pathElements: any[]
    identityPathIndex: number[]
    x: string | bigint
    externalNullifierA: bigint,
    messageIdA: bigint,
    messageLimitA: bigint,
    externalNullifierB: bigint,
    messageIdB: bigint,
    messageLimitB: bigint
}