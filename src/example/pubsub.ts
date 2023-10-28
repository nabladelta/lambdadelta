import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { bootstrap } from '@libp2p/bootstrap'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { kadDHT } from '@libp2p/kad-dht'
import { CID } from 'multiformats/cid'
import * as json from 'multiformats/codecs/json'
import { sha256 } from 'multiformats/hashes/sha2'
import { identifyService } from 'libp2p/identify'
import { tcp } from '@libp2p/tcp'
import all from 'it-all'

const asyncSleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const run = async () => {
  const topic = json.encode({ name: 'world' })

  const topicHash = await sha256.digest(topic)
  const cid = CID.create(1, json.code, topicHash)

  // Known peers addresses
  const bootstrapMultiaddrs = [
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN'
  ]

  const node = await createLibp2p({
    // libp2p nodes are started by default, pass false to override this
    start: false,
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    transports: [webSockets(), tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    peerDiscovery: [
      bootstrap({
        list: bootstrapMultiaddrs, // provide array of multiaddrs
      })
    ],
    services: {
      // we add the Pubsub module we want
      pubsub: gossipsub({ allowPublishToZeroPeers: true }),
      dht: kadDHT(),
      identify: identifyService()
    },
  })

  // start libp2p
  await node.start()
  console.log('libp2p has started')

  const listenAddrs = node.getMultiaddrs()
  console.log('libp2p is listening on the following addresses: ', listenAddrs)

  node.addEventListener('peer:discovery', (evt) => {
      console.log('Discovered %s', evt.detail.id.toString()) // Log discovered peer
  })

  node.addEventListener('peer:connect', (evt) => {
      console.log('Connected to %s', evt.detail.toString()) // Log connected peer
  })

  node.services.pubsub.addEventListener("message", (evt) => {
  console.log(`node received: ${uint8ArrayToString(evt.detail.data)} on topic ${evt.detail.topic}`)
  })
  node.services.pubsub.subscribe(cid.toString())

  await asyncSleep(5000)

  // Once the node is ready, you can start using the DHT
  node.contentRouting.provide(cid);
  await asyncSleep(5000)
   setInterval(async () => {
     try {
       for (const peerInfo of await all(node.contentRouting.findProviders(cid))) {
          console.log(`Found peer providing topic: ${peerInfo.id.toString()}`);
          console.log(`Addresses: ${peerInfo.multiaddrs.toString()}`);
       };
     } catch (err) {
       console.error(`Error finding providers: ${err}`);
     }
   }, 5000); // Check for peers every 5 seconds

  await asyncSleep(1200000)
}