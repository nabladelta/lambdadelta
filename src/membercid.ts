import { RLN, nullifierInput, RLNGFullProof, VerificationResult } from '@nabladelta/rln'
import { getMemberCIDEpoch, getMemberCIDEpochs, getTimestampInSeconds } from './utils.js'

/**
 * Enum for membership verification results
 */
export enum MembershipVerificationResult {
    /**
     * The epoch is not the current epoch.
     */
    INVALID_EPOCH = 'INVALID_EPOCH',
    /**
     * The message limit is not 1.
     */
    INVALID_MESSAGE_LIMIT = 'INVALID_MESSAGE_LIMIT',
    /**
     * The proof's signal does not match the peer's public key.
     */
    WRONG_PUBKEY = 'WRONG_PUBKEY',
    /**
     * The RLN identifier is not the expected one.
     */
    INVALID_IDENTIFIER = 'INVALID_IDENTIFIER',
}

const RLN_IDENTIFIER = 'MEMBERCID'

/**
 * Generates a membership proof
 * @param ownPublicKey Your public key
 * @param rln The RLN instance for generating the proof
 * @returns The membership proof
 */
export async function generateMemberCID(ownPublicKey: string, rln: RLN) {
    const externalNullifier: nullifierInput = {
        nullifier: getMemberCIDEpoch().toString(),
        messageId: 0,
        messageLimit: 1
    }
    return await rln.createProof(ownPublicKey, [externalNullifier, externalNullifier], RLN_IDENTIFIER, true)
}

/**
 * Verifies a membership proof.
 * @param proof The RLN proof
 * @param peerPublicKey The peer's public key
 * @param rln The RLN instance for verifying the proof
 * @param toleranceMs Maximum time difference between the current time and the proof's epoch
 * @returns The verification result
 */
export async function verifyMemberCIDProof(proof: RLNGFullProof, peerPublicKey: string, rln: RLN, toleranceMs: number = 10000) {
    const nullifier = proof.externalNullifiers[0]
    const allowedEpochs = getMemberCIDEpochs(toleranceMs).map(epoch => epoch.toString())
    if (
        allowedEpochs[0] !== nullifier.nullifier
        && allowedEpochs[1] !== nullifier.nullifier
        && allowedEpochs[2] !== nullifier.nullifier
    ) {
        return MembershipVerificationResult.INVALID_EPOCH
    }

    if (nullifier.messageLimit !== 1) {
        return MembershipVerificationResult.INVALID_MESSAGE_LIMIT
    }

    if (proof.rlnIdentifier !== RLN_IDENTIFIER) {
        return MembershipVerificationResult.INVALID_IDENTIFIER
    }

    if (proof.signal !== peerPublicKey) {
        return MembershipVerificationResult.WRONG_PUBKEY
    }
    const result = await rln.submitProof(proof, getTimestampInSeconds())
    if (result === VerificationResult.VALID || result === VerificationResult.DUPLICATE) {
        return VerificationResult.VALID
    }
    return result
}