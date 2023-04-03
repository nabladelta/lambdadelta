
import crypto from 'crypto'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { RLN, deserializeProof, FileProvider, GroupDataProvider, nullifierInput, RLNGFullProof, serializeProof, VerificationResult } from 'bernkastel-rln'
import { existsSync, rmSync } from "fs"
import { Identity } from '@semaphore-protocol/identity'
import { generateMemberCID, verifyMemberCIDProof } from '../src/membercid'
import { Lambdadelta } from '../src'
import Corestore from 'corestore'
import ram from 'random-access-memory'
import { NullifierSpec } from '../src/lambdadelta'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const GROUPFILE = 'testData.json'
jest.setTimeout(120000)
describe('Event feed', () => {
    let peerA: { rln: RLN, mcid: string, corestore: any}
    let peerB: { rln: RLN, mcid: string, corestore: any}

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

        const rln = await RLN.load(secretA, GROUPFILE)
        const rlnB = await RLN.load(secretB, GROUPFILE)

        const pubkeyA = crypto.createHash('sha256').update(secretA).update('fakekey').digest()
        const pubkeyB = crypto.createHash('sha256').update(secretB).update('fakekey').digest()
        const mockStreamA: NoiseSecretStream = {publicKey: pubkeyA, remotePublicKey: pubkeyB} as NoiseSecretStream // Stream from persp. of A
        const mockStreamB: NoiseSecretStream = {publicKey: pubkeyB, remotePublicKey: pubkeyA} as NoiseSecretStream // Stream from persp. of B

        const proofA = await generateMemberCID(secretA, mockStreamA, rln)
        const proofB = await generateMemberCID(secretB, mockStreamB, rlnB)

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
        peerA = {rln, mcid: proofA.signal, corestore: corestoreA}
        peerB = {rln: rlnB, mcid: proofB.signal, corestore: corestoreA.namespace('b')}
    })

    afterEach(async () => {
        if (existsSync(GROUPFILE)) rmSync(GROUPFILE, {force: true})
    })

    it('Replicates events', async () => {
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)

        const feedB = new Lambdadelta(topic, peerB.corestore, peerB.rln)
        feedB.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)

        await feedA.newEvent(eventTypePost, Buffer.from("test1"))

        await feedB.newEvent(eventTypePost, Buffer.from("test2"))

        expect(await feedA.getCoreLength()).toEqual(1)
        expect(await feedB.getCoreLength()).toEqual(1)
        feedA.on('syncEventReceivedTime', async (cid, eventID, result) => {
            console.log(`[A]: ${cid} ${eventID} ${result}`)
        })
        feedB.on('syncEventReceivedTime', async (cid, eventID, result) => {
            console.log(`[B]: ${cid} ${eventID} ${result}`)
        })

        feedA.on('publishReceivedTime', async (eventID, time) => {
            console.log(`[A]: EID: ${eventID} Time:  ${time}`)
        })
        feedB.on('publishReceivedTime', async (eventID, time) => {
            console.log(`[B]: EID: ${eventID} Time: ${time}`)
        })

        await feedA.addPeer(peerB.mcid, feedB.getCoreIDs()[0], feedB.getCoreIDs()[1])
        await feedB.addPeer(peerA.mcid, feedA.getCoreIDs()[0], feedA.getCoreIDs()[1])
        let eventsA = (await feedA.getEvents()).map(e => e.content.toString('utf-8'))
        let eventsB = (await feedB.getEvents()).map(e => e.content.toString('utf-8'))
        
        expect(eventsA.length).toEqual(2)
        expect(eventsB.length).toEqual(2)
        expect(await feedA.getCoreLength()).toEqual(2)
        expect(await feedB.getCoreLength()).toEqual(2)

        for (let i = 0; i < 2; i++) {
            expect(eventsA[i]).toEqual(eventsB[i])
        }
        await sleep(1000)
        const result = await feedA.newEvent(eventTypePost, Buffer.from("test3"))
        expect(result).toEqual(VerificationResult.VALID)
        await sleep(1000)
        expect(await feedA.getCoreLength()).toEqual(3)
        expect(await feedB.getCoreLength()).toEqual(3)
        eventsA = (await feedA.getEvents()).map(e => e.content.toString('utf-8'))
        eventsB = (await feedB.getEvents()).map(e => e.content.toString('utf-8'))
        
        for (let i = 0; i < 3; i++) {
            expect(eventsA[i]).toEqual(eventsB[i])
        }
    })
})