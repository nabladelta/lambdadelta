import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { mplex } from '@libp2p/mplex'
import { tcp } from '@libp2p/tcp'
import { GroupDataProvider, MemoryProvider, RLN } from '@nabladelta/rln'
import { createLibp2p } from 'libp2p'
import { identifyService } from 'libp2p/identify'
import { MemoryDatastore } from 'datastore-core'
import { Identity } from '@semaphore-protocol/identity'
import { Logger } from "tslog"
import delay from "delay"
import { kadDHT } from '@libp2p/kad-dht'
import { Lambdadelta } from '../lambdadelta.js'

const createNode = async () => {
  const node = await createLibp2p({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    transports: [tcp()],
    streamMuxers: [yamux(), mplex()],
    connectionEncryption: [noise()],
    services: {
      pubsub: gossipsub({
        allowPublishToZeroPeers: true
        }),
      identify: identifyService(),
      dht: kadDHT({
        allowQueryWithZeroPeers: true,
      })
    }
  })

  return node
}

async function main() {
    const secretA = "secret1secret1secret1"
    const secretB = "secret2secret2secret2"
    const secretC = "secret3secret3secret3"
    const gData = MemoryProvider.write(
        [
            GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
            GroupDataProvider.createEvent(new Identity(secretB).commitment),
            GroupDataProvider.createEvent(new Identity(secretC).commitment)
        ],
    undefined)
    const rlnstore = new MemoryDatastore()
    const rlnstoreB = new MemoryDatastore()
    const rlnstoreC = new MemoryDatastore()
    const rln = await RLN.loadMemory(secretA, gData, rlnstore)
    const rlnB = await RLN.loadMemory(secretB, gData, rlnstoreB)
    const rlnC = await RLN.loadMemory(secretC, gData, rlnstoreC)
    const libp2p = await createNode()
    const libp2pB = await createNode()
    const libp2pC = await createNode()

    await libp2p.peerStore.patch(libp2pB.peerId, {
        multiaddrs: libp2pB.getMultiaddrs()
    })

    await libp2pB.peerStore.patch(libp2p.peerId, {
        multiaddrs: libp2p.getMultiaddrs()
    })

    await libp2pC.peerStore.patch(libp2pB.peerId, {
        multiaddrs: libp2pB.getMultiaddrs()
    })

    await libp2p.start()
    await libp2pB.start()
    await libp2pC.start()

    await libp2p.dial(libp2pB.peerId)
    await libp2pB.dial(libp2p.peerId)
    await libp2pC.dial(libp2pB.peerId)
    await libp2pB.dial(libp2pC.peerId)

    await delay(1500)

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
    mapping.set(libp2p.peerId.toString(), 'node A')
    mapping.set(libp2pB.peerId.toString(), 'node B')
    mapping.set(libp2pC.peerId.toString(), 'node C')

    const nodeA = await Lambdadelta.create({topic: 'a', groupID: '1', rln, libp2p, logger: logA})
    const nodeB = await Lambdadelta.create({topic: 'a', groupID: '1', rln: rlnB, libp2p: libp2pB, logger: logB, initialSyncPeriodMs: 1000})
    await nodeA.newEvent('POST', 'hello world')
    await delay(2000)
    await delay(2000)
    console.log((await nodeB.getEvents())[0]?.header.payloadHash)
    const nodeC = await Lambdadelta.create({topic: 'a', groupID: '1', rln: rlnC, libp2p: libp2pC, logger: logC, initialSyncPeriodMs: 1000})
    await delay(100)
    console.log((await nodeC.getEvents()).map(e => e.header.payloadHash))
    await nodeB.newEvent('POST', 'hello world2', true)
    await delay(2000)
    console.log((await nodeA.getEvents()).map(e => e.header.payloadHash))
    await delay(2000)
    console.log((await nodeC.getEvents()).map(e => e.header.payloadHash))
    await nodeB.newEvent('POST', 'hello world3', true)
}

main().catch(console.error)

