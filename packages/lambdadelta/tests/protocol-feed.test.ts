
import crypto from 'crypto'
import { NoiseSecretStream } from '@hyperswarm/secret-stream'
import { RLN, deserializeProof, FileProvider, GroupDataProvider, nullifierInput, RLNGFullProof, serializeProof, VerificationResult, MemoryProvider } from '@bernkastel/rln'
import { existsSync, rmSync } from "fs"
import { Identity } from '@semaphore-protocol/identity'
import { generateMemberCID, verifyMemberCIDProof } from '../src/membercid'
import { Lambdadelta } from '../src'
import Corestore from 'corestore'
import ram from 'random-access-memory'
import { ContentVerificationResult, HeaderVerificationError, NullifierSpec } from '../src/lambdadelta'
import Hyperdrive from 'hyperdrive'
import b4a from 'b4a'
import { TypedEmitter } from 'tiny-typed-emitter'
import { deserializeFeedEntry, serializeEvent, serializeFeedEntry } from '../src/utils'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

jest.setTimeout(120000)
describe('Event feed', () => {
    let peerA: { rln: RLN, mcid: string, corestore: Corestore}
    let peerB: { rln: RLN, mcid: string, corestore: Corestore}
    let feedA: Lambdadelta

    const topic = 'a'
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
    })

    const createMockFeed = async (topic: string, conf: { rln: RLN, mcid: string, corestore: Corestore}) => {
        const core = conf.corestore.get({ name: `${topic}-received` })
        const drive = new Hyperdrive(conf.corestore.namespace('drive'))
        await core.ready()
        await drive.ready()
        return {core, drive, ids: [core.key!.toString('hex'), drive.key.toString('hex')]}
    }

    const createEvent = async(content: string, nullifiers?: nullifierInput[]) => {
        nullifiers = nullifiers || feedA['createNullifier'](eventTypePost)
        const [header,
        eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from(content))
        const headerBuf = serializeEvent(header)
        const entryBuf = serializeFeedEntry({eventID, received: header.claimed, oldestIndex: 0})
        return {header, headerBuf, entryBuf, eventID}
    }

    const patchEmitter = (emitter: TypedEmitter) => {
        var oldEmit = emitter.emit;
      
        emitter.emit = function() {
            var emitArgs = arguments
            console.log(emitArgs)
            oldEmit.apply(emitter, arguments as any)
        } as any
    }

    it('Rejects duplicate events', async () => {
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const mockFeed = await createMockFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const [coreAkey, driveAkey] = feedA.getCoreIDs()
        const coreA = peerB.corestore.get(b4a.from(coreAkey, 'hex'))
        const entry0 = await coreA.get(0)
        await mockFeed.core.append(entry0)
        await mockFeed.core.append(entry0)
        await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
        const entryData = deserializeFeedEntry(entry0)
        await sleep(5000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncDuplicateEvent', peerB.mcid, entryData.eventID, 1, 0)
        expect(feedA.emit).toHaveBeenCalledWith('peerRemoved', peerB.mcid)
    })

    it('Handles missing headers gracefully', async () => {
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const mockFeed = await createMockFeed(topic, peerB)
        let id1, id2
        {
            const {entryBuf, eventID} = await createEvent("test1")
            await mockFeed.core.append(entryBuf)
            id1 = eventID
        }
        {
            const {entryBuf, eventID} = await createEvent("test2")
            await mockFeed.core.append(entryBuf)
            id2 = eventID
        }
        await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
        await sleep(1000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, HeaderVerificationError.UNAVAILABLE, undefined)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id2, HeaderVerificationError.UNAVAILABLE, undefined)
    })

    it('Handles missing content gracefully', async () => {
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const mockFeed = await createMockFeed(topic, peerB)        
        let id1, id2
        {
            const {eventID, entryBuf, headerBuf, header} = await createEvent("test1")
            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.core.append(entryBuf)
            id1 = eventID
        }
        await sleep(1000)
        {
            const {eventID, entryBuf, headerBuf, header} = await createEvent("test2")
            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.core.append(entryBuf)
            id2 = eventID
        }

        await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
        await sleep(2000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.UNAVAILABLE)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id2, VerificationResult.VALID, ContentVerificationResult.UNAVAILABLE)
    })

    it('Handles reused nullifier', async () => {
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const mockFeed = await createMockFeed(topic, peerB)
        const nullifiers = feedA['createNullifier'](eventTypePost)
        let id1, id2
        {
            const {eventID, entryBuf, headerBuf, header} = await createEvent("test1", nullifiers)
            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.core.append(entryBuf)
            id1 = eventID
        }
        {
            const {eventID, entryBuf, headerBuf, header} = await createEvent("test2", nullifiers)
            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.core.append(entryBuf)
            id2 = eventID
        }

        await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
        await sleep(3000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.UNAVAILABLE)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id2, HeaderVerificationError.UNEXPECTED_NULLIFIER, undefined)
    })

    it('Handles header hash mismatch', async () => {
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const mockFeed = await createMockFeed(topic, peerB)
        let id1
        {
            const {eventID, entryBuf, header} = await createEvent("test1")
            header.claimed = header.claimed - 50
            const headerBuf = serializeEvent(header)
            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.core.append(entryBuf)
            id1 = eventID
        }

        await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
        await sleep(2000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, HeaderVerificationError.HASH_MISMATCH, undefined)
    })

    it('Handles content hash mismatch', async () => {
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const mockFeed = await createMockFeed(topic, peerB)
        let id1
        {
            const {eventID, entryBuf, headerBuf, header} = await createEvent("test1")
            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.drive.put(`/events/${eventID}/content`, Buffer.from("test7"))
            await mockFeed.core.append(entryBuf)
            id1 = eventID
        }

        await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
        await sleep(2000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.HASH_MISMATCH)
    })

    it('Handles content size mismatch', async () => {
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1)
        const mockFeed = await createMockFeed(topic, peerB)
        let id1
        {
            const {eventID, entryBuf, headerBuf, header} = await createEvent("test6")

            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.drive.put(`/events/${eventID}/content`, Buffer.from("test6"))
            await mockFeed.core.append(entryBuf)
            id1 = eventID
        }

        await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
        await sleep(2000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.SIZE)
    })

    it('Can fetch content and header separately', async () => {
        // jest.spyOn(feedA, 'emit')
        patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const mockFeed = await createMockFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const nullifiers = feedA['createNullifier'](eventTypePost)
        let id1
        {
            const {eventID, entryBuf, headerBuf, header} = await createEvent("test6")
            await mockFeed.drive.put(`/events/${eventID}/header`, headerBuf)
            await mockFeed.core.append(entryBuf)
            await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
            await sleep(2000)
            await mockFeed.drive.put(`/events/${eventID}/content`, Buffer.from("test6"))
            await feedA.removePeer(peerB.mcid)
            await feedA.addPeer(peerB.mcid, mockFeed.ids[0], mockFeed.ids[1])
            id1 = eventID
        }
        await sleep(2000)
        // expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.UNAVAILABLE)
        // expect(feedA.emit).toHaveBeenCalledWith('peerRemoved', peerB.mcid)
        // expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.VALID)
    })
})