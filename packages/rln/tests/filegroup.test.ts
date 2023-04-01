import 'jest'
import { existsSync, rmSync } from "fs"
import { Identity } from '@semaphore-protocol/identity'
import { getTimestampInSeconds } from '../src/utils/time'
import { GroupDataProvider } from '../src/providers/dataProvider'
import { FileProvider } from '../src/providers/file'
import { RLN, VerificationResult } from '../src/verifier'

const GROUPFILE = 'groupData.json'

describe('RLN', () => {
    it('Creates groups, proofs, verifies, rejects', async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
        const secret1 = "john"
        const secret2 = "steve"
        const enullifiers = [
            {nullifier: "Test nullifier1", messageId: 10, messageLimit: 6},
            {nullifier: "Test nullifier2", messageId: 3, messageLimit: 7}] 
        await FileProvider.write(
            [
                GroupDataProvider.createEvent(new Identity(secret1).commitment, 2),
                GroupDataProvider.createEvent(new Identity(secret2).commitment)
            ],
            GROUPFILE)

        const rln = await RLN.load(secret1, GROUPFILE)
        const proof = await rln.createProof('test', enullifiers, "1")
        const result = await rln.verify(proof, getTimestampInSeconds())
        expect(result).toEqual(VerificationResult.VALID)
        
        const rlnB = await RLN.load(secret2, GROUPFILE)
        expect(async () => rlnB.createProof('test', enullifiers, "1")).rejects
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
    })

    it('Submit proofs', async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
        const secret1 = "john"
        const secret2 = "steve"
        const enullifiers = [
            {nullifier: "Test nullifier1", messageId: 10, messageLimit: 6},
            {nullifier: "Test nullifier2", messageId: 3, messageLimit: 7}] 
        await FileProvider.write(
            [
                GroupDataProvider.createEvent(new Identity(secret1).commitment, 2),
                GroupDataProvider.createEvent(new Identity(secret2).commitment)
            ],
            GROUPFILE)

        const rln = await RLN.load(secret1, GROUPFILE)
        const proof = await rln.createProof('test', enullifiers, "1")
        const result = await rln.submitProof(proof, getTimestampInSeconds())
        expect(result).toEqual(VerificationResult.VALID)
        
        const r2 = await rln.submitProof(proof, getTimestampInSeconds())
        expect(r2).toEqual(VerificationResult.DUPLICATE)

        const e2nullifiers = [
            {nullifier: "2", messageId: 10, messageLimit: 6},
            {nullifier: "3", messageId: 3, messageLimit: 7}
        ]
        const p3 = await rln.createProof('test', e2nullifiers, "1")
        const r3 = await rln.submitProof(p3, 100)
        expect(r3).toEqual(VerificationResult.OUT_OF_RANGE)

        const p4 = await rln.createProof('test2', e2nullifiers, "1")
        const r4 = await rln.submitProof(p4, getTimestampInSeconds())
        expect(r4).toEqual(VerificationResult.BREACH)

        const r5 = await rln.submitProof(p4, getTimestampInSeconds())
        expect(r5).toEqual(VerificationResult.DUPLICATE)

        const r6 = await rln.submitProof(p4, 100)
        expect(r6).toEqual(VerificationResult.DUPLICATE)

        expect(async () => await rln.createProof('test2', e2nullifiers, "1")).rejects
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
    })
})