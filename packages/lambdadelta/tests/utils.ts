import { FileProvider, GroupDataProvider, MemoryProvider, RLN } from "@nabladelta/rln";
import { LDNode } from "../src/node";
import { Identity } from "@semaphore-protocol/identity";
import { existsSync, rmSync } from "fs";
import createTestnet from "@hyperswarm/testnet";
import { Logger } from "tslog";
import { Lambdadelta } from "../src";
import { LDRelayerNode } from "../src/dandelion/relayerNode";

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function nodeSetup() {
    let anode: LDNode
    let bnode: LDNode
    let cnode: LDNode

    let nodes: LDNode[]

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
    anode = new LDNode(secretA, gid, await RLN.loadMemory(secretA, gData), {logger: logA, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
    bnode = new LDNode(secretB, gid, await RLN.loadMemory(secretB, gData), {logger: logB, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
    cnode = new LDNode(secretC, gid, await RLN.loadMemory(secretC, gData), {logger: logC, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})

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

export async function nodeSetupDandelion() {
    let anode: LDRelayerNode
    let bnode: LDRelayerNode
    let cnode: LDRelayerNode

    let nodes: LDRelayerNode[]

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
    anode = new LDRelayerNode(secretA, gid, await RLN.loadMemory(secretA, gData), {logger: logA, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
    bnode = new LDRelayerNode(secretB, gid, await RLN.loadMemory(secretB, gData), {logger: logB, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
    cnode = new LDRelayerNode(secretC, gid, await RLN.loadMemory(secretC, gData), {logger: logC, memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})

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

export function findMissingTopics(peers: LDNode[], topics: string[]) {
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

export function findMissingPeersInFeed(peers: LDNode[], topics: string[]) {
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

export function findMissingPeers(peers: LDNode[]) {
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

export const printer = (feed: Lambdadelta, fname: string) => {
    const eventNames = [
        'peerAdded',
        'peerRemoved',
        'publishReceivedTime',
        'syncEventStart',
        'syncFatalError',
        'syncEventResult',
        'syncPayloadResult',
        'syncDuplicateEvent',
        'syncEventReceivedTime',
        'timelineAddEvent',
        'timelineRemoveEvent',
        'timelineRejectedEvent',
        'consensusTimeChanged',
        'syncCompleted',
        'peerUpdate'
    ] as const

    for (let name of eventNames) {
        feed.on(name, (...args: any[]) => console.log(`${fname}: [${name}] ${args.join(' | ')}`))
    }
}