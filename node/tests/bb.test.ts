import 'jest'
import { BulletinBoard } from '../src/core/board'
import { difference, getTimestampInSeconds } from '../src/core/utils/utils'
import createTestnet from '@hyperswarm/testnet'
import { BBNode } from '../src/core/node'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const T = 'a'


function formatCatalog(cat: ICatalogPage[]) {
    return cat[0].threads.map(thread => {
        const op = [thread.no?.slice(-8), thread.com]

        for (let reply of thread.last_replies!) {
            op.push(reply.no?.slice(-8), reply.com)
        }
        return op
    })
}

// Wait until the board has joined thread
async function waitForThreadJoin(b: BulletinBoard, tid: string) {
    if (b.threads[tid]) return // Already joined
    await new Promise<void>(
        (resolve, reject) => 
            b.on("joinedThread", (id, thread) => {/*console.log(id.slice(-8), tid.slice(-8));*/ if (tid == id) resolve()}))
}

async function waitForThreadJoins(bs: BulletinBoard[], tids: string[]) {
    for (let b of bs) {
        for (let tid of tids) await waitForThreadJoin(b, tid)
    }
}

async function waitForHypercoresReceive(b: BulletinBoard, tid: string, hids: string[]) {
    const alreadyPresent: string[] = b.threads[tid].base.inputs.map((core: any) => core.key.toString('hex'))
    console.log(hids.map(i=> i.slice(-8)), alreadyPresent.map(i=> i.slice(-8)))

    const missing: Set<string> = difference(hids, alreadyPresent)
    if (missing.size == 0) return
    await new Promise<void>(
        (resolve, reject) => b.threads[tid].on("addedCores", (addedIds) => {
            console.log("Found", addedIds.map(i=> i.slice(-8)))
            for (let id of addedIds) {
                if (missing.delete(id)) console.log("removed", id.slice(-8), Array.from(missing))
            }
            if (missing.size == 0) {
                resolve()
            }
        })
    )
}

async function waitForHypercoresReceiveMulti(bs: BulletinBoard[], tid: string, hids: string[]) {
    let i = 0
    for (let b of bs) {
        console.log("wait ", i++)
        await waitForHypercoresReceive(b, tid, hids)
    }
}

describe('Environment', () => {
    let anode: BBNode
    let bnode: BBNode
    let cnode: BBNode

    beforeEach(async () => {
        
    })
    jest.setTimeout(120000)
    it('streams', async () => {
        const {bootstrap} = await createTestnet(3)
        anode = new BBNode('secret1secret1secret1', true, {bootstrap})
        bnode = new BBNode('secret1secret1secret2', true, {bootstrap})
        cnode = new BBNode('secret1secret1secret3', true, {bootstrap})
        await anode.ready()
        await anode.join(T)
        await bnode.ready()
        await bnode.join(T)
        await cnode.ready()
        await cnode.join(T)

        const a = anode.boards.get(T)!
        const b = bnode.boards.get(T)!
        const c = cnode.boards.get(T)!

        const threadId = await a.newThread({com: "test", time: getTimestampInSeconds()})
        await a.newMessage(threadId, {com: "testX2", time: getTimestampInSeconds()})
        await a.newMessage(threadId, {com: "testX3", time: getTimestampInSeconds()})

        await waitForThreadJoins([c,b], [threadId])

        await waitForHypercoresReceiveMulti([a, c, b], threadId, [
            await b.newMessage(threadId, {com: "test2", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId, {com: "test3", time: getTimestampInSeconds()})||""
        ])

        const threadId2 = await b.newThread({com: "test4", time: getTimestampInSeconds()})

        await waitForThreadJoins([c, a, b], [threadId2])

        await waitForHypercoresReceiveMulti([a, c, b], threadId2, [
            await a.newMessage(threadId2, {com: "test5", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId2, {com: "test6", time: getTimestampInSeconds()})||""
        ])

        await sleep(1000)
        console.log("a", formatCatalog(await a.getCatalog()))
        console.log("b", formatCatalog(await b.getCatalog()))
        console.log("c", formatCatalog(await c.getCatalog()))

        console.log((await a.getThreadContent(threadId)))

    })
})