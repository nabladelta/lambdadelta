
import crypto from 'crypto'
import { RLN, deserializeProof, FileProvider, GroupDataProvider, nullifierInput, RLNGFullProof, serializeProof, VerificationResult, MemoryProvider } from '@nabladelta/rln'
import { getMemberCIDEpoch, getTimestampInSeconds } from '../src/utils'
import { Identity } from '@semaphore-protocol/identity'
import { generateMemberCID, verifyMemberCIDProof } from '../src/membercid'

jest.setTimeout(150000)
describe('Member CID', () => {
    beforeEach(async () => {
    })
    afterEach(async () => {
    })
    it('Creates and verifies member CID', async () => {
        const secretA = "john"
        const secretB = "steve"
        const gData = MemoryProvider.write(
            [
                GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
                GroupDataProvider.createEvent(new Identity(secretB).commitment)
            ],
            undefined)

        const rln = await RLN.loadMemory(secretA, gData)
        const rlnB = await RLN.loadMemory(secretB, gData)

        const pubkeyA = crypto.createHash('sha256').update(secretA).update('fakekey').digest()
        const pubkeyB = crypto.createHash('sha256').update(secretB).update('fakekey').digest()

        const proofA = await generateMemberCID(secretA, pubkeyB, rln)
        const proofB = await generateMemberCID(secretB, pubkeyA, rlnB)
        expect(await verifyMemberCIDProof(deserializeProof(serializeProof(proofB)), pubkeyA, rln)).toEqual(true) // From the perspective of being A
        expect(await verifyMemberCIDProof(proofB, pubkeyA, rln)).toEqual(true) // Duplicate should not be a problem
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(true) // From the perspective of being B
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(true) // Duplicate should not be a problem
        const signal = proofA.signal
        proofA.signal = "test"
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(false) // Should detect the issue
        proofA.signal = signal
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(true)
        proofA.rlnIdentifier = "0"
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(false) // Should detect the issue
        proofA.rlnIdentifier = pubkeyB.toString("hex")
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(true)
        proofA.externalNullifiers[0].messageLimit = 2
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(false) // Should detect the issue
        proofA.externalNullifiers[0].messageLimit = 1
        proofA.externalNullifiers[0].nullifier = "test"
        expect(await verifyMemberCIDProof(proofA, pubkeyB, rlnB)).toEqual(false) // Should detect the issue

    })
})