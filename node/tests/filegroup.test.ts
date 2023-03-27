import 'jest'
import { readFileSync } from "fs"
import path from "path"
import { Identity } from '@semaphore-protocol/identity'
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import poseidon from 'poseidon-lite'
import { Group } from "@semaphore-protocol/group"
import { hashBigint } from '../src/core/rln/utils/hash'
import { GroupDataProvider } from '../src/core/rln/providers/dataProvider'
import { FileProvider } from '../src/core/rln/providers/file'
import { Lambda, VerificationResult } from '../src/core/rln/lambda'
import { getTimestampInSeconds } from '../src/core/utils/utils'

describe.only('RLN', () => {
    it('Creates a proof', async () => {
        const secret1 = "john"
        const secret2 = "steve"
        const enullifiers = [
            {nullifier: "Test nullifier1", messageId: 5, messageLimit: 6},
            {nullifier: "Test nullifier2", messageId: 3, messageLimit: 7}] 
        await FileProvider.write([GroupDataProvider.createEvent(secret1), GroupDataProvider.createEvent(secret2, 2)], 'groupData.json')

        const [lambda, delta] = await Lambda.load(secret1)
        const proof = await delta.createProof('test', enullifiers, "1")
        const result = await lambda.verifyProof(proof, getTimestampInSeconds())

        expect(result).toEqual(VerificationResult.VALID)
    })
})