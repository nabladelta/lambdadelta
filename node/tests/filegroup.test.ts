import 'jest'
import { existsSync, readFileSync, rmSync } from "fs"
import { GroupDataProvider } from '../src/core/rln/providers/dataProvider'
import { FileProvider } from '../src/core/rln/providers/file'
import { Lambda, VerificationResult } from '../src/core/rln/lambda'
import { getTimestampInSeconds } from '../src/core/utils/utils'

describe.only('RLN', () => {
    it('Creates groups, proofs, verifies, rejects', async () => {
        if (existsSync('groupData.json')) rmSync('groupData.json', {force: true})
        const secret1 = "john"
        const secret2 = "steve"
        const enullifiers = [
            {nullifier: "Test nullifier1", messageId: 10, messageLimit: 6},
            {nullifier: "Test nullifier2", messageId: 3, messageLimit: 7}] 
        await FileProvider.write([GroupDataProvider.createEvent(secret1, 2), GroupDataProvider.createEvent(secret2)], 'groupData.json')

        const [lambda, delta] = await Lambda.load(secret1)
        const proof = await delta.createProof('test', enullifiers, "1")
        const result = await lambda.verify(proof, getTimestampInSeconds())
        expect(result).toEqual(VerificationResult.VALID)
        
        const [lambdaB, deltaB] = await Lambda.load(secret2)
        expect(async () => deltaB.createProof('test', enullifiers, "1")).rejects
        if (existsSync('groupData.json')) rmSync('groupData.json', {force: true})
    })
})