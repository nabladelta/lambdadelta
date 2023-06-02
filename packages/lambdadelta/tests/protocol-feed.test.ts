
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

        const pubkeyA = crypto.createHash('sha256').update(secretA).update('fakekey').digest()
        const pubkeyB = crypto.createHash('sha256').update(secretB).update('fakekey').digest()
        const mockStreamA: NoiseSecretStream = {publicKey: pubkeyA, remotePublicKey: pubkeyB} as NoiseSecretStream // Stream from persp. of A
        const mockStreamB: NoiseSecretStream = {publicKey: pubkeyB, remotePublicKey: pubkeyA} as NoiseSecretStream // Stream from persp. of B

        const proofA = await generateMemberCID(secretA, mockStreamA, rln)
        const proofB = await generateMemberCID(secretB, mockStreamB, rlnB)

        const corestoreA = new Corestore(ram, {primaryKey: Buffer.from(secretA)})
        corestoreA.replicate(true)
        peerA = {rln, mcid: proofA.signal, corestore: corestoreA}
        peerB = {rln: rlnB, mcid: proofB.signal, corestore: corestoreA.namespace('b')}
    })

    afterEach(async () => {
    })

    const fakeFeed = async (topic: string, conf: { rln: RLN, mcid: string, corestore: Corestore}) => {
        const core = conf.corestore.get({ name: `${topic}-received` })
        const drive = new Hyperdrive(conf.corestore.namespace('drive'))
        await core.ready()
        await drive.ready()
        return {core, drive, ids: [core.key!.toString('hex'), drive.key.toString('hex')]}
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
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const fake = await fakeFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const [coreAkey, driveAkey] = feedA.getCoreIDs()
        const coreA = peerB.corestore.get(b4a.from(coreAkey, 'hex'))
        const entry0 = await coreA.get(0)
        await fake.core.append(entry0)
        await fake.core.append(entry0)
        await feedA.addPeer(peerB.mcid, fake.ids[0], fake.ids[1])
        const entryData = deserializeFeedEntry(entry0)
        await sleep(5000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncDuplicateEvent', peerB.mcid, entryData.eventID, 1, 0)
        expect(feedA.emit).toHaveBeenCalledWith('peerRemoved', peerB.mcid)
    })

    it('Handles missing headers gracefully', async () => {
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const fake = await fakeFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const nullifiers = feedA['createNullifier'](eventTypePost)
        let id1, id2
        {
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test5"))
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id1 = eventID
        }

        {
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test6"))
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id2 = eventID
        }
        await feedA.addPeer(peerB.mcid, fake.ids[0], fake.ids[1])
        await sleep(1000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, HeaderVerificationError.UNAVAILABLE, undefined)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id2, HeaderVerificationError.UNAVAILABLE, undefined)
    })

    it('Handles missing content gracefully', async () => {
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const fake = await fakeFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        
        let id1, id2
        {
            const nullifiers = feedA['createNullifier'](eventTypePost)
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test6"))
            const header = {
                eventType,
                proof,
                claimed,
                contentHash
            }
            const ebuf = serializeEvent(header)
            await fake.drive.put(`/events/${eventID}/header`, ebuf)
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id1 = eventID
        }
        await sleep(1000)
        {
            const nullifiers = feedA['createNullifier'](eventTypePost)
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test7"))
            const header = {
                eventType,
                proof,
                claimed,
                contentHash
            }
            const ebuf = serializeEvent(header)
            await fake.drive.put(`/events/${eventID}/header`, ebuf)
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id2 = eventID
        }

        await feedA.addPeer(peerB.mcid, fake.ids[0], fake.ids[1])
        await sleep(1000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.UNAVAILABLE)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id2, VerificationResult.VALID, ContentVerificationResult.UNAVAILABLE)
    })

    it('Handles reused proof', async () => {
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const fake = await fakeFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const nullifiers = feedA['createNullifier'](eventTypePost)
        let id1, id2
        {
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test6"))
            const header = {
                eventType,
                proof,
                claimed,
                contentHash
            }
            const ebuf = serializeEvent(header)
            await fake.drive.put(`/events/${eventID}/header`, ebuf)
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id1 = eventID
        }
        {
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test7"))
            const header = {
                eventType,
                proof,
                claimed,
                contentHash
            }
            const ebuf = serializeEvent(header)
            await fake.drive.put(`/events/${eventID}/header`, ebuf)
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id2 = eventID
        }

        await feedA.addPeer(peerB.mcid, fake.ids[0], fake.ids[1])
        await sleep(1000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.UNAVAILABLE)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id2, HeaderVerificationError.UNEXPECTED_NULLIFIER, undefined)
    })

    it('Handles header hash mismatch', async () => {
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const fake = await fakeFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const nullifiers = feedA['createNullifier'](eventTypePost)
        let claimedTime
        let id1
        {
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test6"))
            const header = {
                eventType,
                proof,
                claimed,
                contentHash
            }
            header.claimed = 0
            const ebuf = serializeEvent(header)
            await fake.drive.put(`/events/${eventID}/header`, ebuf)
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id1 = eventID
        }

        await feedA.addPeer(peerB.mcid, fake.ids[0], fake.ids[1])
        await sleep(1000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, HeaderVerificationError.HASH_MISMATCH, undefined)
    })

    it('Handles content hash mismatch', async () => {
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1000)
        const fake = await fakeFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const nullifiers = feedA['createNullifier'](eventTypePost)
        let claimedTime
        let id1
        {
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test6"))
            const header = {
                eventType,
                proof,
                claimed,
                contentHash
            }
            const ebuf = serializeEvent(header)
            await fake.drive.put(`/events/${eventID}/header`, ebuf)
            await fake.drive.put(`/events/${eventID}/content`, Buffer.from("test7"))
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id1 = eventID
        }

        await feedA.addPeer(peerB.mcid, fake.ids[0], fake.ids[1])
        await sleep(1000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.HASH_MISMATCH)
    })

    it('Handles content size mismatch', async () => {
        const topic = "a"
        const eventTypePost = "POST"
        const postNullifierSpec: NullifierSpec = {
            messageLimit: 1,
            epoch: 1
        }
        const feedA = new Lambdadelta(topic, peerA.corestore, peerA.rln)
        jest.spyOn(feedA, 'emit')
        // patchEmitter(feedA)
        feedA.addEventType(eventTypePost, [postNullifierSpec, postNullifierSpec], 1)
        const fake = await fakeFeed(topic, peerB)
        await feedA.newEvent(eventTypePost, Buffer.from("test1"))
        const nullifiers = feedA['createNullifier'](eventTypePost)
        let claimedTime
        let id1
        {
            const [{
                eventType,
                proof,
                claimed,
                contentHash
            },
            eventID] = await feedA['createEvent'](eventTypePost, nullifiers, Buffer.from("test6"))
            const header = {
                eventType,
                proof,
                claimed,
                contentHash
            }
            const ebuf = serializeEvent(header)
            await fake.drive.put(`/events/${eventID}/header`, ebuf)
            await fake.drive.put(`/events/${eventID}/content`, Buffer.from("test6"))
            const entry = serializeFeedEntry({eventID, received: claimed, oldestIndex: 0})
            await fake.core.append(entry)
            id1 = eventID
        }

        await feedA.addPeer(peerB.mcid, fake.ids[0], fake.ids[1])
        await sleep(1000)
        expect(feedA.emit).toHaveBeenCalledWith('peerAdded', peerB.mcid)
        expect(feedA.emit).toHaveBeenCalledWith('syncEventResult', peerB.mcid, id1, VerificationResult.VALID, ContentVerificationResult.SIZE)
    })
})