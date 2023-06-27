# Lambdadelta

## P2P Event Feed secured by RLN proofs

```
npm i @nabladelta/lambdadelta
```

Built on [hypercore](https://github.com/holepunchto/hypercore) and secured by the [Rate Limiting Nullifier](https://github.com/Rate-Limiting-Nullifier/).
Provides a decentralized, peer to peer, (optionally) permissionless multiwriter event feed that is both anonymous and private, which can be used as a platform to build many kinds of decentralized applications.

## Usage

To try it out, you need to create a group, instantiate a Node, then subscribe to a topic and publish events to it.

``` ts
import { FileProvider, GroupDataProvider, MemoryProvider, RLN } from "@nabladelta/rln"
import { LDNode } from "@nabladelta/lambdadelta"
import createTestnet from "@hyperswarm/testnet"
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

const gid = 'exampleGroupID'
const testnet = await createTestnet(3)
const anode = new LDNode(secretA, gid, await RLN.loadMemory(secretA, gData), { memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})
const bnode = new LDNode(secretB, gid, await RLN.loadMemory(secretB, gData), { memstore: true, swarmOpts: {bootstrap: testnet.bootstrap}})

await Promise.all([anode.ready(), bnode.ready()])
```

``` ts
const TOPIC = 'example'
const TOPICB = 'other'
await anode.join([TOPIC. TOPICB])
await bnode.join([TOPIC, TOPICB])
const a = anode.getTopic(TOPIC)!
const b = bnode.getTopic(TOPIC)!

await a.newEvent("POST", Buffer.from("some message"))
```

After a while events propagate to all nodes that have joined the topic:

``` ts
const events = (await b.getEvents())
                .map(e => e.content.toString())
console.log(events)
```