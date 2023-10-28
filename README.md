# Lambdadelta

## P2P Event Feed secured by RLN proofs

```
npm i @nabladelta/lambdadelta
```

Built on [js-libp2p](https://github.com/libp2p/js-libp2p) and secured by the [Rate Limiting Nullifier](https://github.com/Rate-Limiting-Nullifier/).
Provides a decentralized, peer to peer, (optionally) permissionless multiwriter event feed that is both anonymous and private, which can be used as a platform to build many kinds of decentralized applications.

## Usage

To try it out, you need to create an RLN group, instantiate a Lambdadelta instance, and add messages to it.

``` ts
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
import { Lambdadelta } from "@nabladelta/lambdadelta"

```
Create libp2p nodes:
``` ts
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

const libp2p = await createNode()
const libp2pB = await createNode()

await libp2p.peerStore.patch(libp2pB.peerId, {
    multiaddrs: libp2pB.getMultiaddrs()
})

await libp2pB.peerStore.patch(libp2p.peerId, {
    multiaddrs: libp2p.getMultiaddrs()
})
await libp2p.start()
await libp2pB.start()

await libp2p.dial(libp2pB.peerId)
await libp2pB.dial(libp2p.peerId)
```
Initialize the nodes, ensuring they are part of the same group and share a common gid:

``` ts
const secretA = 'secret1secret1secret1'
const secretB = 'secret1secret1secret2'
const gData = MemoryProvider.write(
[
    GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
    GroupDataProvider.createEvent(new Identity(secretB).commitment),
], undefined)

const rlnstore = new MemoryDatastore()
const rlnstoreB = new MemoryDatastore()
const rln = await RLN.loadMemory(secretA, gData, rlnstore)
const rlnB = await RLN.loadMemory(secretB, gData, rlnstoreB)

const nodeA = await Lambdadelta.create({topic: 'a', groupID: '1', rln, libp2p})
const nodeB = await Lambdadelta.create({topic: 'a', groupID: '1', rln: rlnB, libp2p: libp2pB})

```
Start producing new events:
``` ts
await nodeA.newEvent('POST', 'hello world')
```

After a while events propagate to all nodes that have joined the topic:

``` ts
await delay(2000)
console.log((await nodeA.getEvents()).map(e => e.header.payloadHash))
```