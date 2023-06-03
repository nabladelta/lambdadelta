import { GroupDataProvider, MemoryProvider, RLN } from "@bernkastel/rln"
import { BBNode } from "../src"
import { Identity } from "@semaphore-protocol/identity"
import { Logger } from "tslog"
import createTestnet from "@hyperswarm/testnet"

export async function nodeSetup() {
    let anode: BBNode
    let bnode: BBNode
    let cnode: BBNode

    let nodes: BBNode[]

    let destroy: () => Promise<void>

    const secretA = 'secret1secret1secret1'
    const secretB = 'secret1secret1secret2'
    const secretC = 'secret1secret1secret3'
    const gData = MemoryProvider.write(
    [
        GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
        GroupDataProvider.createEvent(new Identity(secretB).commitment),
        GroupDataProvider.createEvent(new Identity(secretC).commitment, 5)
    ], undefined)

    let mapping: Map<string, string> = new Map()
    const mainLogger = new Logger({
        prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t[{{name}}]\t",
        overwrite: {
            formatLogObj(maskedArgs, settings) {
                for (let i = 0; i < maskedArgs.length; i++) {
                    if (typeof maskedArgs[i] !== "string") {
                        continue
                    }
                    for (const [str, repl] of mapping) {
                        maskedArgs[i] = (maskedArgs[i] as string).replace(str, repl)
                    }
                }
                return { args: maskedArgs, errors: []}
            },
        }
    })
    const logA = mainLogger.getSubLogger({name: 'node A'})
    const logB = mainLogger.getSubLogger({name: 'node B'})
    const logC = mainLogger.getSubLogger({name: 'node C'})
    const gid = 'AAA'
    const testnet = await createTestnet(3)
    anode = new BBNode(secretA, gid, await RLN.loadMemory(secretA, gData), {logger: logA, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
    bnode = new BBNode(secretB, gid, await RLN.loadMemory(secretB, gData), {logger: logB, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
    cnode = new BBNode(secretC, gid, await RLN.loadMemory(secretC, gData), {logger: logC, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})

    mapping.set(anode.peerId.slice(-6), "A")
    mapping.set(bnode.peerId.slice(-6), "B")
    mapping.set(cnode.peerId.slice(-6), "C")

    await Promise.all([anode.ready(), bnode.ready(), cnode.ready()])
    nodes = [anode, bnode, cnode]
    destroy = async() => {
        await Promise.all([testnet.destroy(), anode.destroy(), bnode.destroy(), cnode.destroy()])
    }
    return {anode, bnode, cnode, nodes, destroy, bootstrap: testnet.bootstrap, groupData: gData}
}