import 'jest'
import { BulletinBoard } from '../src/core/board'
import { difference, getTimestampInSeconds } from '../src/core/utils/utils'
import createTestnet from '@hyperswarm/testnet'
import { BBNode } from '../src/core/node'
import ram from 'random-access-memory'
import Corestore from 'corestore'
import { Keystorage } from '../src/core/keystorage'
import Hypercore from 'hypercore'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const T = 'a'

function formatCatalog(cat: ICatalogPage[]) {
    return cat.map(p => p.threads) // Page
            .map(t => t.map(thread => 
                [thread.no?.slice(-8), thread.com] // OP
                    .concat(thread.last_replies!.map(reply => 
                        [reply.no?.slice(-8), reply.com]) // Replies
                        .flat(1))
    )).flat(1)
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


async function validateCatalog(boards: BulletinBoard[], opComs: string[], strict?: boolean) {
    for (let b of boards) {
        const ops = formatCatalog(await b.getCatalog()).map(thread => thread[1]) // Extracts each OP's com field
        if (strict) {
            return ops == opComs
        }
        const opSet = new Set(ops)
        for (let opCom of opComs) {
            if (!opSet.has(opCom)) { console.log(ops, opComs); return false }
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
    // console.log(hids.map(i=> i.slice(-8)), alreadyPresent.map(i=> i.slice(-8)))

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
    // let i = 0
    for (let b of bs) {
        // console.log("wait ", i++)
        await waitForHypercoresReceive(b, tid, hids)
    }
}

describe('Keystore', () => {
    it('Stores and retrieves keys', async () => {
        const corestore = new Corestore(`./data/test`, {primaryKey: Buffer.from('secret1secret1secret1')})
        const keystore = new Keystorage(Hypercore.defaultStorage(corestore.storage), 'test/')
        const keys = new Set<string>()
        await keystore._readStorageKey('test', keys)
        expect(keys.size).toBe(0)
        const storeKeys = new Set<string>(
            [
                '4ced5d6b6a87a34b1123c1db3823639759ac762707934199eaa1f2e2009e98b2',
                'a040e3796509f598ea2e56dcdf8b84aa81f7aa6d66631b25b9806cbc5ed5d44c',
                '2fdde410f7c5e3b50603d1b0dcfd6e183a9dfc2d353811b47763a3709fcd4473',
                '7f52d113f0e2e233fa59929fbd229baed4f0d47f817c0efa39e2137af9cb2140'
            ])
        await keystore._updateStorageKey('test', storeKeys)
        await keystore._readStorageKey('test', keys)
        expect(keys.size).toBe(4)
        for (let key of storeKeys) {
            expect(keys.has(key)).toBe(true)
        }
        await corestore.close()
    })
})

describe('BulletinBoard', () => {
    let anode: BBNode
    let bnode: BBNode
    let cnode: BBNode

    let destroy: () => Promise<void>

    beforeEach(async () => {
        const testnet = await createTestnet(3)
        anode = new BBNode('secret1secret1secret1', true, {bootstrap: testnet.bootstrap})
        bnode = new BBNode('secret1secret1secret2', true, {bootstrap: testnet.bootstrap})
        cnode = new BBNode('secret1secret1secret3', true, {bootstrap: testnet.bootstrap})
        await anode.ready()
        await anode.join(T)
        await bnode.ready()
        await bnode.join(T)
        await cnode.ready()
        await cnode.join(T)

        destroy = async() => {
            await Promise.all([testnet.destroy(), anode.destroy(), bnode.destroy(), cnode.destroy()])
        }
    })

    afterEach(async () => {
        await destroy()
    })

    jest.setTimeout(120000)

    it('Creates new threads, posts in them, and replicates', async () => {
        const a = anode.boards.get(T)!
        const b = bnode.boards.get(T)!
        const c = cnode.boards.get(T)!

        const threadId = await a.newThread({com: "test", time: getTimestampInSeconds()}) as string
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

        const threadId2 = await b.newThread({com: "test4", time: getTimestampInSeconds()}) as string

        await waitForThreadJoins([a, b, c], [threadId2])

        await waitForHypercoresReceiveMulti([a, b, c], threadId2, [
            await a.newMessage(threadId2, {com: "test5", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId2, {com: "test6", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId2, {com: "test6-2", time: getTimestampInSeconds()})||"",
            await a.newMessage(threadId2, {com: "test5-2", time: getTimestampInSeconds()})||"",
            await c.newMessage(threadId2, {com: "test6-3", time: getTimestampInSeconds()})||"",
        ])

        await sleep(1000)

        // Ensure all threads replicated fully on all nodes
        expect(await validateThread([a, b, c], threadId, ["test", "test-2", "test-3", "test2", "test3", "test3-2"], true)).toBe(true)
        expect(await validateThread([a, b, c], threadId2, ["test4", "test5", "test6", "test6-2", "test5-2", "test6-3"], true)).toBe(true)

        expect(await validateCatalog([a, b, c], ["test4", "test"])).toBe(true)

        // console.log("a", formatCatalog(await a.getCatalog()))
        // console.log("b", formatCatalog(await b.getCatalog()))
        // console.log("c", formatCatalog(await c.getCatalog()))
        console.log((await a.getThreadContent(threadId))?.posts)

    })
})