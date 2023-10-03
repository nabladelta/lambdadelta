import crypto from 'crypto'
import { RLN, nullifierInput, RLNGFullProof, VerificationResult } from '@nabladelta/rln'
import { getMemberCIDEpoch, getTimestampInSeconds } from '../src/utils'

export async function generateMemberCID(secret: string, remotePublicKey: Buffer, rln: RLN) {
    const externalNullifier: nullifierInput = {
        nullifier: getMemberCIDEpoch().toString(),
        messageId: 0,
        messageLimit: 1
    }
    const id = crypto.createHash('sha256')
        .update(secret)
        .update(externalNullifier.nullifier)
        .update(remotePublicKey.toString('hex'))
        .digest('hex')
    return await rln.createProof(id, [externalNullifier, externalNullifier], remotePublicKey.toString('hex'))
}

export async function verifyMemberCIDProof(proof: RLNGFullProof, localPublicKey: Buffer, rln: RLN) {
    const nullifier = proof.externalNullifiers[0]
    if (getMemberCIDEpoch().toString() !== nullifier.nullifier) {
        return false
    }

    if (nullifier.messageLimit !== 1) {
        return false
    }

    if (proof.rlnIdentifier !== localPublicKey.toString('hex')) {
        return false
    }
    const result = await rln.submitProof(proof, getTimestampInSeconds())
    return (result === VerificationResult.VALID || result === VerificationResult.DUPLICATE)
}