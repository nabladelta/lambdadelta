import 'jest'
import { LDNode } from '../src/node'
import { findMissingPeers, findMissingPeersInFeed, findMissingTopics, nodeSetup, sleep } from './utils'

jest.mock("../src/lambdadelta.ts")

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

    jest.setTimeout(150000)

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

    it('Join topics one by one', async () => {
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

    it('Join and leave topics', async () => {

        await anode.join([T])

        await bnode.join([TOPICS[2]])
        await bnode.leave([TOPICS[2]])
        await bnode.join([TOPICS[1]])
        await bnode.join([T])
        expect(bnode.getTopicList().length).toBe(2)
        await sleep(10000)
        expect(findMissingTopics([anode, bnode], [T]).length).toBe(0)
        await bnode.leave([T])
        await sleep(10000)
        expect(findMissingTopics([anode, bnode], [T]).length).toBe(2)
    })
})