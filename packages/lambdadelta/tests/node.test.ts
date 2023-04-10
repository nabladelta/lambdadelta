import 'jest'
import createTestnet from '@hyperswarm/testnet'

import { FileProvider, GroupDataProvider } from 'bernkastel-rln'
import { Identity } from '@semaphore-protocol/identity'
import { existsSync, rmSync } from 'fs'
import { LDNode } from '../src/node'
import { Logger } from 'tslog'

jest.mock("../src/lambdadelta.ts")

const GROUP_FILE = 'testData.json'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const T = 'a'

const TOPICS = ['a', 'b', 'c', 'd']

function findMissingTopics(peers: LDNode[], topics: string[]) {
    const missing: {node: LDNode, peer: LDNode, topic: string}[] = []
    for (const node of peers) {
        for (const peer of peers) {
            if (peer.peerId === node.peerId) continue
            for (const topic of topics) {
                if (!node.peerHasTopic(peer.peerId, topic)) {
                    missing.push({node, peer, topic})
                }
            }
        }
    }
    return missing
}

function findMissingPeersInFeed(peers: LDNode[], topics: string[]) {
    const missing: {node: LDNode, peer: LDNode, topic: string}[] = []
    for (const node of peers) {
        for (const topic of topics) {
            const feed = node.getTopic(topic)
            if (!feed) throw new Error("No feed")

            for (const peer of peers) {
                if (peer.peerId === node.peerId) continue

                if (!feed.hasPeer(peer.peerId)) {
                    missing.push({node, peer, topic})
                }
            }
        }
    }
    return missing
}

function findMissingPeers(peers: LDNode[]) {
    const missing: {node: LDNode, peer: LDNode}[] = []
    for (const node of peers) {
        const peerSet = new Set(node.getPeerList())
        for (const peer of peers) {
            if (peer.peerId === node.peerId) continue

            if (!peerSet.has(peer.peerId)) {
                missing.push({node, peer})
            }
        }
    }
    return missing
}

describe('LDNode', () => {
    let anode: LDNode
    let bnode: LDNode
    let cnode: LDNode

    let nodes: LDNode[]

    let destroy: () => Promise<void>

    beforeEach(async () => {
        const secretA = 'secret1secret1secret1'
        const secretB = 'secret1secret1secret2'
        const secretC = 'secret1secret1secret3'
        await FileProvider.write(
        [
            GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
            GroupDataProvider.createEvent(new Identity(secretB).commitment),
            GroupDataProvider.createEvent(new Identity(secretC).commitment, 5)
        ],
        GROUP_FILE)
        let mapping: Map<string, string> = new Map()
        const mainLogger = new Logger({
            prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t[{{name}}]\t",
            overwrite: {
                formatLogObj(maskedArgs, settings) {
                    const args = maskedArgs as string[]
                    for (let i = 0; i < args.length; i++) {
                        for (const [str, repl] of mapping) {
                            args[i] = args[i].replace(str, repl)
                        }
                    }
                    return { args, errors: []}
                },
            }
        })
        const logA = mainLogger.getSubLogger({name: 'node A'})
        const logB = mainLogger.getSubLogger({name: 'node B'})
        const logC = mainLogger.getSubLogger({name: 'node C'})
        const gid = 'AAA'
        const testnet = await createTestnet(3)
        anode = new LDNode(secretA, gid, {logger: logA, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
        bnode = new LDNode(secretB, gid, {logger: logB, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
        cnode = new LDNode(secretC, gid, {logger: logC, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})

        mapping.set(anode.peerId.slice(-6), "A")
        mapping.set(bnode.peerId.slice(-6), "B")
        mapping.set(cnode.peerId.slice(-6), "C")

        await Promise.all([anode.ready(), bnode.ready(), cnode.ready()])
        nodes = [anode, bnode, cnode]
        destroy = async() => {
            if (existsSync(GROUP_FILE)) rmSync(GROUP_FILE, {force: true})
            await Promise.all([testnet.destroy(), anode.destroy(), bnode.destroy(), cnode.destroy()])
        }
    })

    afterEach(async () => {
        await destroy()
    })

    jest.setTimeout(120000)

    it('Join a topic', async () => {
        for (const node of nodes) {
            await node.join([T])
        }

        await sleep(10000)

        expect(findMissingPeers(nodes).length).toBe(0)
        expect(findMissingTopics(nodes, [T]).length).toBe(0)
        expect(findMissingPeersInFeed(nodes, [T]).length).toBe(0)
    })

    it('Join many topics', async () => {
        for (const node of nodes) {
            await node.join(TOPICS)
        }

        await sleep(10000)

        expect(findMissingPeers(nodes).length).toBe(0)
        expect(findMissingTopics(nodes, TOPICS).length).toBe(0)
        expect(findMissingPeersInFeed(nodes, TOPICS).length).toBe(0)
    })

    it('Join many topics', async () => {
        for (const node of nodes) {
            await node.join(TOPICS)
        }

        await sleep(10000)

        expect(findMissingPeers(nodes).length).toBe(0)
        expect(findMissingTopics(nodes, TOPICS).length).toBe(0)
        expect(findMissingPeersInFeed(nodes, TOPICS).length).toBe(0)
    })

    it.only('Join topics one by one', async () => {
        for (const topic of TOPICS) {
            for (const node of nodes) {
                await node.join([topic])
            }
            for (const node of nodes) {
                await node.awaitPending()
            }
            await sleep(10000)
            expect(findMissingPeers(nodes).length).toBe(0)
        }
        expect(findMissingTopics(nodes, TOPICS).length).toBe(0)
        expect(findMissingPeersInFeed(nodes, TOPICS).length).toBe(0)
        console.log("END")
    })
})