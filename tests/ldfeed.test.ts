
import crypto from 'crypto'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { RLN, FileProvider, GroupDataProvider, nullifierInput, RLNGFullProof, VerificationResult, MemoryProvider } from '@nabladelta/rln'
import { existsSync, rmSync } from "fs"
import { Identity } from '@semaphore-protocol/identity'
import { generateMemberCID, verifyMemberCIDProof } from '../src/membercid'
import { Lambdadelta } from '../src'
import Corestore from 'corestore'
import ram from 'random-access-memory'
import { NullifierSpec } from '../src/lambdadelta'
import { Timeline } from '../src/timeline'
import { calculateConsensusTime } from '../src/consensusTime'
import { printer } from './utils'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

jest.setTimeout(120000)
describe('Event feed', () => {
    let peerA: { rln: RLN, mcid: string, corestore: any}
    let peerB: { rln: RLN, mcid: string, corestore: any}
    let feedA: Lambdadelta
    let feedB: Lambdadelta

    const topic = "a"
    const eventTypePost = "POST"
    const postNullifierSpec: NullifierSpec = {
        messageLimit: 1,
        epoch: 1
    }

    beforeEach(async () => {
        const secretA = "secret1secret1secret1"
        const secretB = "secret2secret2secret2"
        const gData = MemoryProvider.write(
            [
                GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
                GroupDataProvider.createEvent(new Identity(secretB).commitment)
            ],
            undefined)

        const rln = await RLN.loadMemory(secretA, gData)
        const rlnB = await RLN.loadMemory(secretB, gData)

        const corestoreA = new Corestore(ram, {primaryKey: Buffer.from(secretA)})

        peerA = {rln, mcid: "MCID-A", corestore: corestoreA}
        peerB = {rln: rlnB, mcid: "MCID-B", corestore: corestoreA.namespace('b')}

        feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)

        feedB = new Lambdadelta(topic, peerB.corestore, peerB.rln)
        feedB.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        printer(feedA, "[A]")
        printer(feedB, "[B]")
    })

    it('Replicates events', async () => {
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        await feedB.newEvent(eventTypePost, Buffer.from("test2"))

        expect(await feedA.getCoreLength()).toEqual(1)
        expect(await feedB.getCoreLength()).toEqual(1)

        feedB.on('publishReceivedTime', async (eventID, time) => {
            const event = await feedB.getEventByID(eventID)
            expect(event?.header.eventType).toEqual(eventTypePost)
        })

        await feedA.addPeer(peerB.mcid, feedB.getCoreIDs()[0], feedB.getCoreIDs()[1])
        // Adding twice should have no effect
        const added = await feedA.addPeer(peerB.mcid, feedB.getCoreIDs()[0], feedB.getCoreIDs()[1])
        expect(added).toEqual(false)

        await feedB.addPeer(peerA.mcid, feedA.getCoreIDs()[0], feedA.getCoreIDs()[1])
        await sleep(1500)

        let eventsA = (await feedA.getEvents()).map(e => e.payload.toString('utf-8'))
        let eventsB = (await feedB.getEvents()).map(e => e.payload.toString('utf-8'))
        expect(eventsA.length).toEqual(2)
        expect(eventsB.length).toEqual(2)

        expect(await feedA.getCoreLength()).toEqual(2)
        expect(await feedB.getCoreLength()).toEqual(2)

        for (let i = 0; i < 2; i++) {
            expect(eventsA[i]).toEqual(eventsB[i])
        }
        await sleep(1000)
        const result = await feedA.newEvent(eventTypePost, Buffer.from("test3"))
        expect(result.result).toEqual(VerificationResult.VALID)
        await sleep(10000)
        expect(await feedA.getCoreLength()).toEqual(3)
        expect(await feedB.getCoreLength()).toEqual(3)
        eventsA = (await feedA.getEvents()).map(e => e.payload.toString('utf-8'))
        eventsB = (await feedB.getEvents()).map(e => e.payload.toString('utf-8'))
        
        for (let i = 0; i < 3; i++) {
            expect(eventsA[i]).toEqual(eventsB[i])
        }
    })

    it("Sets and unsets times", () => {
        const timeline = new Timeline()
        timeline.setTime('test', 100)
        // Should work twice
        timeline.setTime('test', 100)
        timeline.setTime('test2', 100)
        timeline.unsetTime('test1')
        expect(timeline['timeline'].has(100000)).toEqual(true)
        expect(timeline['timeline'].has(100001)).toEqual(true)
    })

    it("Consensus time calculation", () => {
        expect(Math.floor(calculateConsensusTime([10, 100, 1000, 0], 4))).toEqual(36)
        expect(calculateConsensusTime([0, 1, 1000, 1001], 4)).toEqual(500.5)
    })

})