
import crypto from 'crypto'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { Delta, deserializeProof, FileProvider, GroupDataProvider, Lambda, nullifierInput, RLNGFullProof, serializeProof, VerificationResult } from 'bernkastel-rln'
import { existsSync, rmSync } from "fs"
import { Identity } from '@semaphore-protocol/identity'
import { generateMemberCID, verifyMemberCIDProof } from '../src/membercid'
import { Lambdadelta } from '../src'
import Corestore from 'corestore'
import ram from 'random-access-memory'
import { NullifierSpec } from '../src/lambdadelta'

const GROUPFILE = 'testData.json'

describe('Event feed', () => {
    let peerA: {lambda: Lambda, delta: Delta, mcid: string, corestore: any}
    let peerB: {lambda: Lambda, delta: Delta, mcid: string, corestore: any}

    beforeEach(async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
        const secretA = "secret1secret1secret1"
        const secretB = "secret1secret1secret1"
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

        const corestoreA = new Corestore(ram, {primaryKey: Buffer.from(secretA)})
        const corestoreB = new Corestore(ram, {primaryKey: Buffer.from(secretB)})
        const s1 = corestoreA.replicate(true)
        const s2 = corestoreA.replicate(false)
        s1.pipe(s2).pipe(s1)
        peerA = {lambda, delta, mcid: proofA.signal, corestore: corestoreA}
        peerB = {lambda: lambdaB, delta: deltaB, mcid: proofB.signal, corestore: corestoreB}
    })

    afterEach(async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
    })

    it('Replicates events', async () => {
        const topic = "1"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 10
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.lambda, peerA.delta)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec])

        const feedB = new Lambdadelta(topic, peerB.corestore, peerB.lambda, peerB.delta)
        feedB.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec])

        await feedA.newEvent(eventTypePost, Buffer.from("test1"))

        await feedB.newEvent(eventTypePost, Buffer.from("test2"))

        await feedA.addPeer(peerB.mcid, feedB.getCoreID())
        await feedB.addPeer(peerA.mcid, feedA.getCoreID())

        
    })
})