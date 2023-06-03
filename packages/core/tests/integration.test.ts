import 'jest'
import { BBNode } from '../src/node'
import { nodeSetup, sleep } from './utils'
import { TypedEmitter } from 'tiny-typed-emitter'

const TOPICS = ['a', 'b', 'c', 'd']

const T = TOPICS[0]

describe('LDNode', () => {
    let anode: BBNode
    let bnode: BBNode
    let cnode: BBNode

    let nodes: BBNode[]

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

    jest.setTimeout(1200000000)

    it('Join a topic and post', async () => {
        await anode.join([T])
        await bnode.join([T])
        const a = anode.getTopic(T)!
        const b = bnode.getTopic(T)!

        const patchEmitter = (emitter: TypedEmitter) => {
            var oldEmit = emitter.emit
    
            emitter.emit = function() {
                var emitArgs = arguments
                console.log(emitArgs)
                oldEmit.apply(emitter, arguments as any)
            } as any
        }
        patchEmitter(a)
        await a.newEvent("POST", Buffer.from("TEST"))

        await sleep(3000)
        const events = 
        (await b.getEvents())
                .map(e => e.content.toString())

        const events2 = 
        (await a.getEvents())
                .map(e => e.content.toString())
        expect(events[0]).toEqual(events2[0])
    })

})