# Lambdadelta

## P2P Event Feed secured by RLN proofs

```
npm i @nabladelta/lambdadelta
```

Built on top of .

Built on [hypercore](https://github.com/holepunchto/hypercore) and secured by the [Rate Limiting Nullifier](https://github.com/Rate-Limiting-Nullifier/).
Provides a decentralized, peer to peer, (optionally) permissionless multiwriter event feed that is both anonymous and private, which can be used to build many kinds of decentralized applications.

## Usage

To try it out, you need to create a group, instantiate a Node, then subscribe to a topic and publish events to it.

``` js
import DHT from 'hyperdht'

const node = new DHT()
```