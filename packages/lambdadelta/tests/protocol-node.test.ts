import 'jest'
import { LDNode } from '../src/node'
import { findMissingPeers, findMissingPeersInFeed, findMissingTopics, nodeSetup, sleep } from './utils'
import { RLN, VerificationResult, serializeProof } from '@bernkastel/rln'
import crypto from 'crypto'
import Hyperswarm, { PeerInfo } from 'hyperswarm'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { HandshakeErrorCode } from '../src/node'
import { generateMemberCID } from '../src'

const TOPICS = ['a', 'b', 'c', 'd']

const T = TOPICS[0]

function topicHash(topic: string, namespace: string) {
    return crypto
        .createHash('sha256')
        .update(LDNode.appID)
        .update(LDNode.protocolVersion)
        .update('AAA')
        .update(namespace)
        .update(topic).digest()
}



describe('LDNode', () => {
    let anode: LDNode
    let bnode: LDNode
    let cnode: LDNode

    let nodes: LDNode[]

    let destroy: () => Promise<void>
    let bootstrap: any
    beforeEach(async () => {
        const data = await nodeSetup()
        bootstrap = data.bootstrap
        anode = data.anode
        bnode = data.bnode
        cnode = data.cnode
        nodes = data.nodes
        destroy = data.destroy
    })

    afterEach(async () => {
        await destroy()
    })

    jest.setTimeout(1200000000)

    const fakeNode = async (secret: string, handler: (proof: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => Promise<void>) => {
        const swarmKeySeed = crypto.createHash('sha256')
            .update('DHTKEY')
            .update(secret)
            .update("0")
            .digest()
        const GROUP_FILE = 'testGroup.json'
        const rln = await RLN.load(secret, GROUP_FILE)
        const swarm = new Hyperswarm({ seed: swarmKeySeed, bootstrap})
        const localPeerId = swarm.keyPair.publicKey.toString('hex')
        swarm.on('connection', (stream: any, info: PeerInfo) => {
            console.log("connected")

            const remotePeerID = stream.remotePublicKey.toString('hex')

            stream.once('close', async () => {
                console.log(`Peer ${info.publicKey.toString('hex').slice(-6)} left`)
            })
            const mux = Protomux.from(stream)

            const channel = mux.createChannel({
                protocol: 'ldd-topic-rep'
            })
            channel.open()
            const handshakeSender = channel.addMessage({
                encoding: c.array(c.buffer),
                async onmessage(proof: Buffer[], _: any) {
                    await handler(proof, stream, info, rln, handshakeSender)
            }})
        })

        swarm.join(topicHash(T, "DHT"))
        await swarm.flush()
        return localPeerId
    }

    it('Rejects invalid membership proof', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])
        const secretB = 'secret1secret1secret2'
        const localPeerId = await fakeNode(secretB,    
            async (_: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => {
                handshakeSender.send([Buffer.from('test1'), Buffer.from('test2')])
                info.ban(true)
        })
        await sleep(3000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.FailedDeserialization,
            localPeerId)
    })

    it('Rejects wrong membership proof', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])
        const secretB = 'secret1secret1secret2'
        const localPeerId = await fakeNode(secretB,    
            async (proof: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => {
                handshakeSender.send(proof)
                info.ban(true)
        })
        await sleep(3000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.InvalidProof,
            localPeerId)
    })

    it('Rejects wrong bee core ID', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])

        const secretB = 'secret1secret1secret2'
        const localPeerId = await fakeNode(secretB,    
            async (_: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => {
                const ourProof = await generateMemberCID(secretB, stream, rln)
                const proofBuf = serializeProof(ourProof)
                handshakeSender.send([proofBuf, Buffer.from('a')])
                info.ban(true)
        })
        await sleep(3000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.InvalidHyperbee,
            localPeerId)
    })

    it('Rejects double handshake', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])

        const secretB = 'secret1secret1secret2'
        const localPeerId = await fakeNode(secretB,    
            async (proof: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => {
                const ourProof = await generateMemberCID(secretB, stream, rln)
                const proofBuf = serializeProof(ourProof)
                handshakeSender.send([proofBuf, proof[1]])
                handshakeSender.send([proofBuf, proof[1]])
                info.ban(true)
        })
        await sleep(3000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.DoubleHandshake,
            localPeerId)
    })

    it('Rejects second handshake', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])

        const secretB = 'secret1secret1secret2'
        const localPeerId = await fakeNode(secretB,    
            async (proof: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => {
                const ourProof = await generateMemberCID(secretB, stream, rln)
                const proofBuf = serializeProof(ourProof)
                handshakeSender.send([proofBuf, proof[1]])
                await sleep(3000)
                handshakeSender.send([proofBuf, proof[1]])
                info.ban(true)
        })
        await sleep(5000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.DuplicateHandshake,
            localPeerId)
    })

    it('Rejects duplicate memberCID', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])
        const secretB = 'secret1secret1secret2'
        const localPeerIdB = await fakeNode(secretB,    
            async (proof: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => {
                const ourProof = await generateMemberCID(secretB, stream, rln)
                const proofBuf = serializeProof(ourProof)
                handshakeSender.send([proofBuf, proof[1]])
                info.ban(true)
        })
        await sleep(2000)
        const localPeerIdC = await fakeNode(secretB,    
            async (proof: Buffer[], stream: any, info: PeerInfo, rln: RLN, handshakeSender: any) => {
                const ourProof = await generateMemberCID(secretB, stream, rln)
                const proofBuf = serializeProof(ourProof)
                handshakeSender.send([proofBuf, proof[1]])
                info.ban(true)
        })

        await sleep(3000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.DuplicateMemberCID,
            localPeerIdC)
    })
})