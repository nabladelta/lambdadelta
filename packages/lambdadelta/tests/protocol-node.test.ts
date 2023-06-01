import 'jest'
import { LDNode } from '../src/node'
import { findMissingPeers, findMissingPeersInFeed, findMissingTopics, nodeSetup, sleep } from './utils'
import { VerificationResult } from '@bernkastel/rln'
import crypto from 'crypto'
import Hyperswarm, { PeerInfo } from 'hyperswarm'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { HandshakeErrorCode } from '../src/node'

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

    it('Reject invalid membership proof', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])
        const seed = 'evil'
        const swarmKeySeed = crypto.createHash('sha256')
            .update('DHTKEY')
            .update(seed)
            .update("0")
            .digest()
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
                async onmessage(proof: Buffer[], _: any) { }})

            handshakeSender.send([Buffer.from("test"), Buffer.from("test2")])
            info.ban(true)
        })

        swarm.join(topicHash(T, "DHT"))
        await swarm.flush()
        await sleep(5000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.FailedDeserialization,
            localPeerId)
    })

    it('Reject wrong membership proof', async () => {
        jest.spyOn(anode, 'emit')
        await anode.join([T])
        const seed = 'evil'
        const swarmKeySeed = crypto.createHash('sha256')
            .update('DHTKEY')
            .update(seed)
            .update("0")
            .digest()
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
                    handshakeSender.send(proof)
                    info.ban(true)
            }})            
        })

        swarm.join(topicHash(T, "DHT"))
        await swarm.flush()
        await sleep(5000)
        expect(anode.emit).toHaveBeenCalledWith(
            "handshakeFailure",
            HandshakeErrorCode.InvalidProof,
            localPeerId)
    })
})