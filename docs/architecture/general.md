# A private, unpermissioned, P2P multiwriter event feed based on RLN

This project involves building a multiwriter event feed protocol and datastructure, which will be described in detail below, as well as an anonymous BBS powered by it.

## Design requirements

1. Event author privacy
2. Asynchronous posting and validation of content
3. Consistency between nodes that witnessed an event and nodes that synchronize from scratch later
4. Validation of RLN without the assumption of witnessing live events (necessary for #3)
5. Posting of events is only allowed for members of a certain "group" (economic cost can be involved)
6. Violation of rate-limiting rules results in being removed from "group" (slashing)

### Privacy
Privacy is achieved in two ways: when it comes to the event feed data itself, no information about event authors is leaked thanks to the properties of the Rate-Limiting-Nullifier.

It would still be possible for an attacker to observe which node obtains an event first, which would pin them as its author. This will be prevented in the future by implementing the Dandelion++ protocol, which is currently used by Monero to hide the origin of transactions.

### Consistency and asynchronous posting

A major problem in the implementation of our system lies in maintaining consistency between nodes which might not be online at the same time, while at the same time allowing for posting to be asynchronous and low overhead.

It would be easy to enforce RLN validation under the assumption that all events are received live, as they are produced; one can simply reject any events with future or past timestamps.
This works for applications where live messages are most important, and synchronizing older state is not treated as a first-class feature. A chat system can work with no common chat history at all (for example, IRC), but applications such as a BBS or a KV database require peers to have a consistent view of past events.
If an attacker was allowed to lie about the creation time of past events, he could create an infinite number of them, by backdating their timestamps and thus sidestepping the RLN slashing mechanism.
The issue of how a new node can safely synchronize "from scratch" and know which events were produced at which time, in order to validate their RLN proofs, is the main problem we are going to solve with our design.

Absolute dating of events is possible with synchronous blockchains like Bitcoin and Ethereum. They produce blocks at a fixed average rate, and have algorithms that allow them to reject blocks with timestamps that are too "off". Proof of work or validator votes serve to validate past blocks and enforce a single, consistent timeline of transactions.

This comes at a considerable cost. Blocks must be limited in capacity to allow for fast network propagation within the time epoch they belong to. Constant effort is required by miners or stakers in order to validate the blocks and proceed to the next one. Full history has to be maintained for maximum security.
There are many applications for which such a system is not appropriate due to its overhead; many do not require resistance against double-spending (and therefore a global consensus is not needed).

Furthermore, a synchronous blockchain produces blocks at a regular rate; this would be wasteful for something like a BBS during times when no one is posting, leading to empty blocks. It would also be bad UX if users had to wait until the next block for their posts to be included, and multiple posts were suddenly added all at once.

This is why our system is fundamentally asynchronous, sacrificing finality and some consistency for lower latency and costs.

## Differences from prior work

There are a good number of decentralized databases that have been developed over the years;
some good examples are OrbitDB and Textile, which are both based on IPFS.
The platform we are using, which is the Hypercore/DAT ecosystem, has its own multi-writer feed library, Autobase.

All the examples I know of are either only useful for certain classes of applications which have different assumptions compared to the one we are trying to develop, and/or lack some features that make them safely usable in a real-world scenario (under our assumptions).

In the case of both OrbitDB and Autobase, their main application is a chat system, respectively OrbitChat and Keet.io.

A chat has known, identifiable, trusted participants. It is not unpermissioned, and we can assume that members have been vetted and are not malicious. Misbehaving members can be identified and removed.
Both OrbitDB and Autobase are built under these assumptions, and are therefore designed as multi-writer structures for a set of authorized public keys.

There is no built-in rate limiting for members. As soon as we add a requirement that members be anonymous, and that access is not permissioned, the safety mechanisms these systems provide are no longer sufficient.

There is no obvious way to build something *anyone* can write to, as there is no mechanism to prevent abuse under those circumstances.

That is what we seek to create. Other than blockchains, which are too expensive to use for publishing content, I am not aware of any system that allows for this functionality, while also guaranteeing author privacy.

The objective lies not only in allowing individuals to publish content independently, to be found under some identifier. That is already possible with IPFS. What makes this special is the ability to allow different users to publish *within the same space*, allowing their posts to interact with each other.

The flagship application of our event feed is going to be Bernkastel, an anonymous bulletin board.
However, any kind of database can be built on top of such a feed. It would not be difficult to implement something similar to Reddit, for example, with upvoting and downvoting as a content curation mechanism. RLN could enforce a limit of one upvote or downvote per user, per post.

We'd like to build a foundation that all sorts of other applications can leverage in the future.

## Consensus algorithm

The purpose of the consensus algorithm is to establish whether or not a particular event was created at the time it claims to have been created (`claimed` time). A `consensusTime` is calculated for the event, and it is checked whether or not this is within a certain threshold of the `claimed` time. This results in a binary outcome of ***acceptance*** or ***rejection*** of a particular event.

This is achieved through a local consensus from our direct peers, rather than a more costly global consensus from all peers.

### Sybil resistance

We gain Sybil resistance thanks to temporary identities validated by RLN proofs. Whenever two peers connect, they exchange their own `memberCID`s, unique identifiers that are specific to that connection.
These are validated by an attached RLN proof containing as a signal the ID itself, and as nullifier the current `memberCIDEpoch` concatenated with the ***other*** peer's public key.

This ensures that we are only able to generate a single `memberCID` for each `memberCIDEpoch` (currently, 100000 seconds, or just under 28 hours), for each peer we connect to. Therefore we have a guarantee that each connected node represents a unique member of our RLN Group.

This exchange needs to be repeated on every new epoch with a new ID and proof as long as two peers are connected, in order to ensure the uniqueness assumption holds.

### Time consensus
Each node has a public event feed which is readable by all connected peers, and it listens to changes on every one of its peers' respective feeds.

Each entry in the feed represents an event the node has received. It contains the values `EventID`, which is a hash of event data, and `received`, which is a timestamp representing when the node first received the event.

The process for an event to be propagated is simple:

1. A node adds an event to its feed, setting `received` to its current local time.
2. Its peers, listening for changes, pick up on the new event, download and validate it, then add it to their feed, setting `received` to their local time
3. If their local time is within a threshold of the `received` time of the node they picked the event up from, they set their own `received` for it to the same value instead. This mechanism improves privacy since many nodes will write the same timestamp.
4. Nodes collect the `received` timestamps for each event from all of their peers
5. Whenever a new `received` time for an event is collected, the `consensusTime` for the corresponding event is recalculated using all the collected timestamps.
6. The resulting `consensusTime` determines whether an event is valid or not. Each event has an internal `claimed` timestamp, chosen by the author, which is also used in the RLN proof epoch. If `consensusTime` is within a `TOLERANCE` threshold of `claimed`, the event is considered valid and added to the internal event timeline.

This works differently when a node is synchronizing old events that it never witnessed being added "live", for example during initial sync when starting up, or following a network partition:

When receiving an old event, we cannot use our current local time for the `received` timestamp.
Instead, we first collect all the `received` values from our peers, use them to calculate a `consensusTime`, which we then use as our `received` value.

That means, we can publish our entry in the feed only after collecting all peers' "votes" and deriving the current consensus. This mechanism reinforces the consensus over time, providing some probabilistic finality.

This is how `consensusTime` is currently calculated:

1. We check whether there is a sufficient **quorum** of timestamps: we need to have collected `received` values from at least 2/3 of our connected peers. If not, we cannot derive a consensus.
2. If 2/3rds of the timestamps have the same value, that is our `consensusTime`
3. If there is no 2/3 majority, we calculate the mean and standard deviation, then throw out any timestamps that are not within a standard deviation of the mean. The mean of the resulting set is our `consensusTime`.

## Milestones and mid term objectives

1. Working P2P replication of events between nodes with validation following consensus rules
2. Enforcement of protocol rules through banning of memberCIDs of peers that violate them (ie, posting invalid events, invalid proofs; posting multiple `received` times for one event, etc.)
2. "Slashing": automatic removal of members that violate RLN conditions from group
3. On-chain group contract with deposits and slashing
4. Working bulletin board based on the event feed, with frontend UI and post image attachments
6. Initial work on moderation system: moderator tagging of content
7. Simple KV store based on the event feed, with time based key expiry
8. Garbage collection: periodic removal of all data related to expired/invalid events/peers