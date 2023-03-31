
import crypto from 'crypto'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { Delta, deserializeProof, FileProvider, GroupDataProvider, Lambda, nullifierInput, RLNGFullProof, serializeProof, VerificationResult } from 'bernkastel-rln'
import { getMemberCIDEpoch, getTimestampInSeconds } from '../src/utils'
import { existsSync, rmSync } from "fs"
import { Identity } from '@semaphore-protocol/identity'
import { generateMemberCID, verifyMemberCIDProof } from '../src/membercid'

const GROUPFILE = 'testData.json'

describe('Member CID', () => {
    beforeEach(async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
    })
    afterEach(async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
    })
    it('Creates and verifies member CID', async () => {
        const secretA = "john"
        const secretB = "steve"
        await FileProvider.write(
            [
                GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
                GroupDataProvider.createEvent(new Identity(secretB).commitment)
            ],
            GROUPFILE)

        const [lambda, delta] = await Lambda.load(secretA, GROUPFILE)
        const [lambdaB, deltaB] = await Lambda.load(secretB, GROUPFILE)

        const pubkeyA = crypto.createHash('sha256').update(secretA).update('fakekey').digest()
        const pubkeyB = crypto.createHash('sha256').update(secretB).update('fakekey').digest()
        const mockStreamA: NoiseSecretStream = {publicKey: pubkeyA, remotePublicKey: pubkeyB} as NoiseSecretStream // Stream from persp. of A
        const mockStreamB: NoiseSecretStream = {publicKey: pubkeyB, remotePublicKey: pubkeyA} as NoiseSecretStream // Stream from persp. of B

        const proofA = await generateMemberCID(secretA, mockStreamA, delta)
        const proofB = await generateMemberCID(secretB, mockStreamB, deltaB)
        expect(await verifyMemberCIDProof(deserializeProof(serializeProof(proofB)), mockStreamA, lambda)).toEqual(true) // From the perspective of being A
        expect(await verifyMemberCIDProof(proofB, mockStreamA, lambda)).toEqual(true) // Duplicate should not be a problem
        expect(await verifyMemberCIDProof(proofA, mockStreamB, lambdaB)).toEqual(true) // From the perspective of being B
        expect(await verifyMemberCIDProof(proofA, mockStreamB, lambdaB)).toEqual(true) // Duplicate should not be a problem
    })
})