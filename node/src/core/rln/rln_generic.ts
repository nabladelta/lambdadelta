import { Identity } from '@semaphore-protocol/identity'
import { MerkleProof } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { hashBigint, hashString } from "./utils/hash"
import { plonk, groth16 } from 'snarkjs'
import { BigNumberish, Group } from "@semaphore-protocol/group"

export type StrBigInt = string | bigint

export async function verifyProof(
        rlnFullProof: RLNGFullProof,
        verificationKey: any,
        scheme: 'groth16' | 'plonk' = 'groth16'
    ): Promise<boolean> {
    const { publicSignals, proof } = rlnFullProof.snarkProof

    for (let i = 0; i < publicSignals.externalNullifiers.length; i++) {
        const expectedExtNullifier = poseidon([
            hashString(rlnFullProof.externalNullifiers[i].nullifier),
            hashBigint(rlnFullProof.rlnIdentifier)
        ])

        if (expectedExtNullifier !== BigInt(publicSignals.externalNullifiers[i])) {
            return false
        }

        const expectedLimit = BigInt(rlnFullProof.externalNullifiers[i].messageLimit)
        if (expectedLimit !== BigInt(publicSignals.messageLimits[i])) {
            return false
        }
    }
    
    const expectedSignalHash = hashString(rlnFullProof.signal)
    if (expectedSignalHash !== BigInt(publicSignals.signalHash)) {
        return false
    }

    const prover = scheme === 'plonk' ? plonk : groth16
    return prover.verify(
        verificationKey,
        [
            publicSignals.y,
            publicSignals.merkleRoot,
            publicSignals.nullifiers,
            publicSignals.signalHash,
            publicSignals.externalNullifiers,
            publicSignals.messageLimits
        ].flat(),
        proof,
    )
}

export async function generateProof(
        identity: Identity,
        groupOrMerkleProof: Group | MerkleProof,
        externalNullifiers: {
            nullifier: string,
            messageId: number,
            messageLimit: number
        }[],
        signal: string,
        snarkArtifacts: {
            wasmFilePath: string
            zkeyFilePath: string
        },
        rlnIdentifier: BigNumberish = 0,
        userMessageLimitMultiplier: number = 1,
        scheme: 'groth16' | 'plonk' = 'groth16'
    ): Promise<RLNGFullProof> {

    let merkleProof: MerkleProof

    if ("depth" in groupOrMerkleProof) {
        rlnIdentifier = groupOrMerkleProof.id
        const index = groupOrMerkleProof.indexOf(poseidon([identity.commitment, BigInt(userMessageLimitMultiplier)]))
        
        if (index === -1) {
            throw new Error("The identity is not part of the group")
        }

        merkleProof = groupOrMerkleProof.generateMerkleProof(index)
    } else {
        merkleProof = groupOrMerkleProof
    }

    const witness: RLNGWitnessT = {
        identitySecret: poseidon([identity.nullifier, identity.trapdoor]),
        pathElements: merkleProof.siblings,
        identityPathIndex: merkleProof.pathIndices,
        x: hashString(signal),
        userMessageLimitMultiplier: BigInt(userMessageLimitMultiplier),
        externalNullifiers: externalNullifiers.map(e => poseidon([
            hashString(e.nullifier),
            hashBigint(rlnIdentifier)
        ])),
        messageIds: externalNullifiers.map(e => BigInt(e.messageId)),
        messageLimits: externalNullifiers.map(e => BigInt(e.messageLimit))
    }
    return {
        snarkProof: await prove(
            witness,
            snarkArtifacts.wasmFilePath,
            snarkArtifacts.zkeyFilePath,
            scheme
        ),
        signal,
        externalNullifiers: externalNullifiers
            .map(({ nullifier, messageLimit }) => (
                    { nullifier, messageLimit }
                )),
        rlnIdentifier: rlnIdentifier
    }
}

async function prove(
        witness: RLNGWitnessT,
        wasmFilePath: string,
        zkeyFilePath: string,
        scheme?: 'groth16' | 'plonk'
    ): Promise<RLNGSNARKProof> {
    
    const prover = scheme === 'plonk' ? plonk : groth16
    const { proof, publicSignals } = await prover.fullProve(
        witness,
        wasmFilePath,
        zkeyFilePath,
        null,
    )
    const nNullifiers = witness.externalNullifiers.length

    return {
        proof,
        publicSignals: {
            y: publicSignals.slice(0, nNullifiers),
            merkleRoot: publicSignals[nNullifiers],
            nullifiers: publicSignals.slice(
                nNullifiers + 1,
                nNullifiers + 1 + nNullifiers),
            signalHash: publicSignals[nNullifiers + 1 + nNullifiers],
            externalNullifiers: publicSignals.slice(
                nNullifiers + 1 + nNullifiers + 1,
                nNullifiers + 1 + nNullifiers + 1 + nNullifiers),
            messageLimits: publicSignals.slice(
                nNullifiers + 1 + nNullifiers + 1 + nNullifiers,
                nNullifiers + 1 + nNullifiers + 1 + nNullifiers + nNullifiers),
        }
    }
}

export interface RLNGPublicSignals {
    y: StrBigInt[]
    merkleRoot: StrBigInt
    nullifiers: StrBigInt[]
    signalHash: StrBigInt
    externalNullifiers: StrBigInt[]
    messageLimits: StrBigInt[]
}

export interface RLNGSNARKProof {
    proof: Proof
    publicSignals: RLNGPublicSignals
}

export interface Proof {
    pi_a: StrBigInt[]
    pi_b: StrBigInt[][]
    pi_c: StrBigInt[]
    protocol: string
    curve: string
}

export interface RLNGFullProof {
    snarkProof: RLNGSNARKProof
    signal: string
    rlnIdentifier: BigNumberish
    externalNullifiers: {
        nullifier: string
        messageLimit: number
    }[]
}

export interface RLNGWitnessT {
    identitySecret: bigint
    userMessageLimitMultiplier: bigint
    messageIds: bigint[]
    pathElements: any[]
    identityPathIndex: number[]
    x: string | bigint
    externalNullifiers: bigint[]
    messageLimits: bigint[]
}