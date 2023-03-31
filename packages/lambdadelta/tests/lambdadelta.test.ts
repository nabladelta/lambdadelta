
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
jest.setTimeout(120000)
describe('Event feed', () => {
    let peerA: {lambda: Lambda, delta: Delta, mcid: string, corestore: any}
    let peerB: {lambda: Lambda, delta: Delta, mcid: string, corestore: any}

    beforeEach(async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
        const secretA = "secret1secret1secret1"
        const secretB = "secret2secret2secret2"
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
        const s2 = corestoreB.replicate(false)

        s1.pipe(s2).pipe(s1)
        const core = corestoreA.get({name: 'test'})
        await core.ready()
        core.append(Buffer.from('0'))
        const core2 = corestoreB.get(core.key)
        await core2.ready()
        await core2.update()
        peerA = {lambda, delta, mcid: proofA.signal, corestore: corestoreA}
        peerB = {lambda: lambdaB, delta: deltaB, mcid: proofB.signal, corestore: corestoreA.namespace('b')}
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

        expect(await feedA.getCoreLength()).toEqual(1)
        expect(await feedB.getCoreLength()).toEqual(1)
        feedA.on('eventSyncTimestamp', async (cid, eventID, result) => {
            console.log(`[A]: ${cid} ${eventID} ${result}`)
        })
        feedB.on('eventSyncTimestamp', async (cid, eventID, result) => {
            console.log(`[B]: ${cid} ${eventID} ${result}`)
        })
        await feedA.addPeer(peerB.mcid, feedB.getCoreID())
        await feedB.addPeer(peerA.mcid, feedA.getCoreID())
        const eventsA = (await feedA.getEvents()).map(e => e.content.toString('utf-8'))
        const eventsB = (await feedB.getEvents()).map(e => e.content.toString('utf-8'))
        
        expect(eventsA.length).toEqual(2)
        expect(eventsB.length).toEqual(2)
        expect(await feedA.getCoreLength()).toEqual(2)
        expect(await feedB.getCoreLength()).toEqual(2)

        for (let i = 0; i < 2; i++) {
            expect(eventsA[i]).toEqual(eventsB[i])
        }
    })
})