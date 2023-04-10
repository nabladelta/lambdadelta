import 'jest'
import { LDNode } from '../src/node'
import { findMissingPeers, findMissingPeersInFeed, findMissingTopics, nodeSetup, sleep } from './utils'
import { VerificationResult } from 'bernkastel-rln'

const TOPICS = ['a', 'b', 'c', 'd']

const T = TOPICS[0]

describe('LDNode', () => {
    let anode: LDNode
    let bnode: LDNode
    let cnode: LDNode

    let nodes: LDNode[]

    let destroy: () => Promise<void>

    beforeEach(async () => {
        const data = await nodeSetup()
        anode = data.anode
        bnode = data.bnode
        cnode = data.cnode
        nodes = data.nodes
        destroy = data.destroy
    })

    afterEach(async () => {
        await destroy()
    })

    jest.setTimeout(120000)

    it('Join a topic and post', async () => {
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
            feed.on('syncEventReceivedTime', async (peerId, eventID, result) => {
                console.log(`[FEED]: ${peerId} ${eventID} ${result}`)
            })
            expect(feed.getPeerList().length).toBe(2)

            expect(await feed.newEvent("POST", messages[i++]))
            .toEqual(VerificationResult.VALID)
        }
        await sleep(10000)

        for (const feed of feeds) {
            console.log(
                (await feed.getEvents())
                .map(e => e.content.toString()))
        }
    })
})