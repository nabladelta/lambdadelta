import 'jest'
import { LDNode } from '../src/node'
import { findMissingPeers, findMissingPeersInFeed, findMissingTopics, nodeSetup, sleep } from './utils'

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

    it('Join a topic', async () => {
        for (const node of nodes) {
            await node.join([T])
        }

        await sleep(10000)

        expect(findMissingPeers(nodes).length).toBe(0)
        expect(findMissingTopics(nodes, [T]).length).toBe(0)
        expect(findMissingPeersInFeed(nodes, [T]).length).toBe(0)
    })
})