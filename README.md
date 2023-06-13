# Lambdadelta

## P2P Event Feed secured by RLN proofs

```
npm i @nabladelta/lambdadelta
```

Lambdadelta uses [hypercore](https://github.com/holepunchto/hypercore) alongside the [Rate Limiting Nullifier](https://github.com/Rate-Limiting-Nullifier/) in order to provide a peer to peer, (optionally) permissionless, anonymous and private, multiwriter event feed, on top of which many kinds of applications can be built.

## Usage

To try it out, first create a group, then instantiate a Node instance, and finally add topics:

Imports
``` ts
import { FileProvider, GroupDataProvider, MemoryProvider, RLN } from "@nabladelta/rln"
import { LDNode } from "@nabladelta/lambdadelta"

import createTestnet from "@hyperswarm/testnet"
```

Setup
``` ts
const secretA = 'secret1secret1secret1'
const secretB = 'secret1secret1secret2'
const secretC = 'secret1secret1secret3'
const gData = MemoryProvider.write(
[
    GroupDataProvider.createEvent(new Identity(secretA).commitment, 2),
    GroupDataProvider.createEvent(new Identity(secretB).commitment),
    GroupDataProvider.createEvent(new Identity(secretC).commitment, 5)
], undefined)
const gid = 'exampleGroupID'
const testnet = await createTestnet(3)
anode = new LDNode(secretA, gid, await RLN.loadMemory(secretA, gData), { memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
bnode = new LDNode(secretB, gid, await RLN.loadMemory(secretB, gData), { memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
cnode = new LDNode(secretC, gid, await RLN.loadMemory(secretC, gData), { memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})

await Promise.all([anode.ready(), bnode.ready(), cnode.ready()])
```

Join topics and create new events:
``` ts
const TOPICA = "example"
const TOPICB = "other"
await anode.join([TOPICA, TOPICB])
await bnode.join([TOPICA, TOPICB])
const a = anode.getTopic(TOPICA)!
const b = bnode.getTopic(TOPICA)!

await a.newEvent("POST", Buffer.from("message"))
await b.newEvent("POST", Buffer.from("another message"))
```

Eventually, the events will be synced by both nodes:

``` ts
    console.log((await a.getEvents()).map(e => e.content.toString()))
    console.log((await b.getEvents()).map(e => e.content.toString()))
```