import 'jest'
import { findMissingPeers, findMissingPeersInFeed, findMissingTopics, nodeSetupDandelion, printer, sleep } from './utils'
import { VerificationResult } from '@nabladelta/rln'
import { LDRelayerNode } from '../src/dandelion/relayerNode'

const TOPICS = ['a', 'b', 'c', 'd']

const T = TOPICS[0]

describe('LDRelayerNode', () => {
    let anode: LDRelayerNode
    let bnode: LDRelayerNode
    let cnode: LDRelayerNode

    let nodes: LDRelayerNode[]

    let destroy: () => Promise<void>

    beforeEach(async () => {
        const data = await nodeSetupDandelion()
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

    it('Join a topic and post', async () => {
        await anode.join([T])
        await bnode.join([T])
        const a = anode.getTopic(T)!
        const b = bnode.getTopic(T)!
        printer(a, "[A]")
        printer(b, "[A]")
        await sleep(10000)
        await a.newEvent("POST", Buffer.from("TEST"))
        await sleep(10000)
        const events = 
        (await b.getEvents())
                .map(e => e.payload.toString())

        const events2 = 
        (await a.getEvents())
                .map(e => e.payload.toString())
        expect(events[0]).toEqual(events2[0])
    })

    it('Join a topic and post multiple', async () => {
        for (const node of nodes) {
            await node.join([T])
        }

        await sleep(10000)

        expect(findMissingPeers(nodes).length).toBe(0)
        expect(findMissingTopics(nodes, [T]).length).toBe(0)
        expect(findMissingPeersInFeed(nodes, [T]).length).toBe(0)

        const feeds = nodes.map(n => n.getTopic(T)!)
        const messages = [0, 1, 2].map(n => Buffer.from(`test ${n}`))
        let i = 0

        for (const feed of feeds) {
            await sleep(1000)
            expect((await feeds[0].newEvent("POST", messages[i++])).result)
                .toEqual(VerificationResult.VALID)
            expect(feed.getPeerList().length).toBe(2)
        }

        await sleep(10000)
        const messageLists = []
        for (const feed of feeds) {
            const messages = (await feed.getEvents())
                                .map(e => e.payload.toString())
            messageLists.push(messages)
        }

        for (let i = 0; i < messageLists[0].length; i++) {
            expect(messageLists[0][i]).toEqual(messageLists[1][i])
            expect(messageLists[0][i]).toEqual(messageLists[2][i])
        }
    })

    it('Post multiple at a time', async () => {
        for (const node of nodes) {
            await node.join([T])
        }

        await sleep(10000)

        expect(findMissingPeers(nodes).length).toBe(0)
        expect(findMissingTopics(nodes, [T]).length).toBe(0)
        expect(findMissingPeersInFeed(nodes, [T]).length).toBe(0)

        const feeds = nodes.map(n => n.getTopic(T)!)
        let messages = []
        let n = 0
        for (const feed of feeds) {
            messages.push(Buffer.from(`test ${n++}`))
            expect((await feeds[0].newEvent("POST", messages[n - 1])).result)
                .toEqual(VerificationResult.VALID)
            await sleep(1600)
            messages.push(Buffer.from(`test ${n++}`))
            expect((await feeds[0].newEvent("POST", messages[n - 1])).result)
            .toEqual(VerificationResult.VALID)
            expect(feed.getPeerList().length).toBe(2)
            await sleep(1600)
        }

        await sleep(10000)
        const messageLists = []
        for (const feed of feeds) {
            const feedMessages = (await feed.getEvents())
                                .map(e => e.payload.toString())
            expect(feedMessages.length).toEqual(n)
            messageLists.push(feedMessages)
        }

        for (let i = 0; i < messageLists[0].length; i++) {
            expect(messageLists[0][i]).toEqual(messageLists[1][i])
            expect(messageLists[0][i]).toEqual(messageLists[2][i])
        }
    })
})