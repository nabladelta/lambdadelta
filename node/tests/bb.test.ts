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

function formatThread(tr?: IThread) {
    return tr?.posts.map(p => p.com)
}

async function validateThread(boards: BulletinBoard[], tid: string, postComs: string[], strict?: boolean) {
    for (let b of boards) {
        const tr = formatThread(await b.getThreadContent(tid))
        if (!tr) return false
        if (tr[0] != postComs[0]) return false // Verify OP
        const pSet = new Set(tr)
        for (let com of postComs) {
            if (!pSet.has(com)) return false
        }
        // Also check there are no posts we didn't expect
        if (strict) {
            const providedSet = new Set(postComs)
            for (let com of pSet) {
                if (!providedSet.has(com)) return false
            }
        }
    }
    return true
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
    for (let hid of hids) {
        if (hid == "") {
            throw new Error("Invalid Hid")
        }
    }
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
        const replyCore = await a.newMessage(threadId, {com: "test-2", time: getTimestampInSeconds()})
        // Reply core should have a different ID from OPcore
        expect(replyCore != threadId).toBe(true)

        // Reply core from same board/thread should not change
        expect(await a.newMessage(threadId, {com: "test-3", time: getTimestampInSeconds()})).toBe(replyCore)

        await waitForThreadJoins([a, b, c], [threadId])

        await waitForHypercoresReceiveMulti([a, b, c], threadId, [
            replyCore || "",
            await b.newMessage(threadId, {com: "test2", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId, {com: "test3", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId, {com: "test3-2", time: getTimestampInSeconds()})||""
        ])

        const threadId2 = await b.newThread({com: "test4", time: getTimestampInSeconds()})

        await waitForThreadJoins([a, b, c], [threadId2])

        await waitForHypercoresReceiveMulti([a, b, c], threadId2, [
            await a.newMessage(threadId2, {com: "test5", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId2, {com: "test6", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId2, {com: "test6-2", time: getTimestampInSeconds()})||"",
            await a.newMessage(threadId2, {com: "test5-2", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId2, {com: "test6-3", time: getTimestampInSeconds()})||"",
        ])

        await sleep(1000)

        expect(await validateThread([a, b, c], threadId, ["test", "test-2", "test-3", "test2", "test3", "test3-2"], true)).toBe(true)
        expect(await validateThread([a, b, c], threadId2, ["test4", "test5", "test6", "test6-2", "test5-2", "test6-3"], true)).toBe(true)

        console.log("a", formatCatalog(await a.getCatalog()))
        console.log("b", formatCatalog(await b.getCatalog()))
        console.log("c", formatCatalog(await c.getCatalog()))

        console.log((await a.getThreadContent(threadId)))

    })
})