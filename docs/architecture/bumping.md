# Thread bumping on a decentralized BBS
## Underlying idea
Every board can hold up to a maximum number of discussion threads at any given time. This is determined by the `MAX_THREADS` constant which is set to 256.

Threads are ordered following the time of the last post they received, in reverse chronological order.
This is called a thread's `lastModified` time.

Meaning, the first thread on a board is the one that has been posted on most recently. The last thread is the one that received a new post the longest time ago, and therefore has the lowest `lastModified` value.

Whenever a new thread is created, it is placed on top of the board, in first place.
If the total number of threads now exceeds `MAX_THREADS`, the thread in last place is deleted, bringing the total down to our target.

Therefore:
1. Every newly created thread kills another thread, specifically the one modified least recently.
2. Every new thread starts at the top of the board.
3. Every time a thread is replied to, it moves to the top. This is called a `bump`.

## Base assumptions
The previous paragraph details how the bumping system is supposed to work *in principle*. That is our *target*, our desired effect, however we cannot directly implement it that way on a decentralized board.

The main issue lies in the unreliability of a post's timestamp value. *In principle*, all we need to do is order threads by their most recent post's `time` field.

In practice we can't do that. We cannot trust our peers, and therefore we cannot trust the values they claim. There is no way we can consistently determine at what point in time a given piece of information was originally published. Especially not *after the fact*.
A new node needs to be able to synchronize information dated long before it came online.

The only way to establish such an ordering would be to have a global consensus involving something like a blockchain, where posts are individually added, new blocks are constantly made at regular known intervals and validated by the rest of the network.

Such a system would be too expensive for our purposes, and impose a prohibitive cost on posters.

Therefore, our design has to assume timestamps are unreliable.

## Problems
Several problems arise from a node's ability to publish posts with an incorrect date. For example:

### Future
If a date is in the future, and we decide to accept it as a thread's new `lastModified` value, said thread will remain at the top of the board above every honest thread until that date is reached.

It would be easy to pin a thread to the top permanently by setting the value to a time far away, for example 100 years from now. It would also force everyone else to do the same in order to remain visible.

### Past
Setting a date to the past doesn't give any specific advantage to said thread, since it would probably not be bumped to the top, however it would illegitimately change its position on the board.

### Rate limiting
Whether it is set in the future or past, a fake time effectively evades our rate limiting scheme, which is based on the timestamp value on the post. We can prevent users from making more than one post per timestamp/epoch, but this means they can spam by simply back- or forward-dating the content they publish.

For example if we define an epoch as a 15-second period, you are only allowed to make one post for every 15 second period. But nothing prevents you from making a post for every 15 second period of the past 24 hours for example. Methods to limit and penalize this behaviour are further discussed in the rate-limiting document.

## Design restrictions

If we decided to take the information we are given at face value, and order threads based on the most recent timestamp within them, we would have an ordering, and therefore an overall board state, that is *eventually consistent* between all nodes.

Eventually, all nodes will have all messages and threads, and therefore they will be in the same order since all the information to decide on the order is contained in them.

However, we would suffer from the problems detailed above.

Since we can't determine the true time, we have to sacrifice some *consistency* between nodes in exchange for higher resistance to attacks.

*By design* we can not guarantee that all nodes will have the same order, or the same set of threads. Instead, each node will compile their own thread order, using heuristics based on the time a post was received by the node itself, in addition to the claimed timestamps.

However, it is important to maintain some level of consistency between honest nodes that are well connected, *especially* in regards to which threads are present, and which have been deleted.
Nodes stop replicating deleted threads to other nodes, which could cause disruption to nodes that think a particular thread should still be alive.

# Implementation
As mentioned previously, we consider the time we *receive* an update, whether it is a new thread, or a new post, in addition to the time said update is dated, as well as the times of previous related updates.

Based on that, an update can be:
1. `Valid`: the timestamp on the post is close to the time we received it, +- our `TOLERANCE` period.
2. `Future`: the timestamp is in the future compared to our current time.
3. `Stale`: the timestamp is in the past. It's a stale update that we *should*, in principle, have received *earlier*, but didn't.

We can simply trust any `Valid` updates to be dated correctly, as we witnessed them being published in real time. Other nodes not online at the time cannot attest to it or trust us, but this is why every node builds their thread order independently.

`Future` updates seem easy to handle in principle. We could just reject them, because we know for sure that the original creator lied about the date, unlike with `Stale` updates.
It's not normal for clocks on different machines to not be perfectly synchronized, but our `TOLERANCE` period setting covers for a small difference.

While we can ignore `Future` updates for the purpose of bumping, we can't delete the post/thread *permanently*; ie, blacklist it as fraudulent within our node.
What we have to take into consideration, is that not every other peer will have witnessed the `Future` update as it happened; and eventually the future date will be reached. A node that was offline and later receives such a message might classify it as `Present` and there would be no way for other peers to prove otherwise. We don't want to be missing content which an honest peer is replicating.

Our general policy with future dated messages is to ignore them but not blacklist them since they might eventually become `Valid` to other nodes.

The most difficult case is `Stale` updates.
An update can be stale due to a number of causes:

1. There was a network partition, ie, some nodes were disconnected from each other for a while, and the update did not come through to us until now.
2. We had this information previously, but deleted it. This is mainly applicable to *threads* which got bumped off the board for us but not another node, then receive an update on said node, which gets relayed to us. It is not really a concern with individual posts.
3. The author lied about the `time`.

The first case is always a possibility. Since what we are building is a distributed database, we are bound by the CAP theorem, which states that if we want network partition tolerance, we need to sacrifice consistency of our data between nodes or availability of our node.
Since there is no consensus system anyways, we need to sacrifice consistency.

The second case will be considered more in depth when we discuss how exactly we handle "new" threads we discover.

A special case of 1 is when we are initially synchronizing the board as a new node or a node that has been offline for a while. That situation has to be treated in a special way in order to ensure some consistency with existing online nodes, as almost all information we receive will technically be `Stale`, but we know it's mostly "our fault".

We will now discuss the current, concrete decision making process.

## Threads
The first scenario to discuss is receiving a new thread we didn't know of from a peer.

What to do here is a particularly sensitive question given that adding the thread will most likely mean deleting another.

We refer to the time of the OP post as the thread's `creationTime`.

1. If the given `creationTime` is within our `TOLERANCE` margin, the update is considered `Valid`, we accept the thread, and set its `lastModified` value to its `creationTime`. 

2. If the `creationTime` is in the past, the update is `Stale`. We accept the thread, but set its `lastModified` value to its `creationTime`, rather than, for example, the time of the most recent post.
(The rationale for this will be explained shortly.) It's likely in this scenario that the thread will be immediately chosen for removal, since its `lastModified` would be often be the least recent on the board at that point.

3. If the `creationTime` is in the future and beyond our margins, the update is `Future`. We reject the thread and do not add it to the board nor do we gossip it to other nodes.
If we receive the same thread again in the future, but past its `creationTime`, it will be considered again as if this never happened.

This process can be summarized as: we set the `lastModified` to `creationTime`, unless the thread is from the future, in which case we ignore it and don't add it.

One might notice the process for `Valid` (1) and `Stale` threads is the same. Why?

If a thread is `Valid`, it was recently created. Which means posts on it are also more or less equally recent, if there even are any (there normally would not be any yet, assuming the network replicates quickly). There's no reason to check them. Therefore its `lastModified` can be set to the `creationTime`.

Why do the same for `Stale`? There's three scenarios why a thread might be `Stale` when we find out about it, and this design works in each of them:

### The publishing node lied
The timestamp is incorrect. A node created a thread that is dated in the past in order to elude the rate limiting (as only one thread per user can be created for each `THREAD_EPOCH` which is `1000` seconds, whereas a post can be made for each `POST_EPOCH` which is 15 seconds).
If we considered the latest reply post timestamp for `lastModified` in this situation, then he 
could have added posts that are dated to the present time, or close to it, in order to bump the thread to the top (or close to the top).

This is a dangerous situation to allow, because every newly created thread is deleting an older one.
By back-dating the thread creation time, and giving more recent dates to posts in the thread, we can quickly eclipse the board, getting many regular threads deleted.
It's why new threads are allowed to be made less often than new posts. Posts themselves merely move threads around the board, new threads *delete* others.

This is the main reason we need to "penalize" threads that are received `Stale`. By only considering the `creationTime` of the thread, and not the `time` of reply posts, we limit the damage that can be done.
The further back a thread is dated when received, the lower it will be inserted on the board.
The more threads one wants to create fraudulently, the further they need to be dated back in time.

Again, the main idea is that there is a huge discrepancy in how many threads vs posts one can make for a given time window without running afoul of the rate limiting nullifier.

#### Example
If an attacker wanted to eclipse an entire board, he would need to make 256 threads, each with timestamps 1000 seconds apart from the others, and none of them set in the future.
The "oldest" of these threads would have to be dated **three days** in the past (~71 hours).
Since it would then be assigned that time as its `lastModified` time, it would be placed below any other thread that has received *any posts* within the last 3 days.

This gives an inherent advantage to non-`Stale` threads in terms of being included in the board at all, since we *do* consider their posts for `lastModified`, if we received said posts live.

Still, assuming that, for example, the bottom half (128 threads) on the board have not received *any replies* in the last 1.5 days, they would be replaced by the top "most recent" half of the new threads created by the attacker.

A board with less activity is much more subsceptible to such an issue. A board where, for example, the bottom thread has received replies in the last hour or so, would be almost unaffected. The only threads to be deleted would be threads that were close to deletion anyways. And the newly added threads will be close to deletion from the start.

In order to further limit the impact of flooding a board with back-dated threads, we can limit how many threads a user can create per day, in addition to the limitation of one per 1000 seconds; this option is further discussed in the rate-limiting documentation.

### The thread was previously bumped off the board

The second situation is straightforward. A thread was previously bumped off the bottom of the board, and deleted. Now we receive it from another node, and since we deleted it we do not recognize it. It's marked as `Stale` since its creation time is in the past.

The main reason why a node would send us a thread that we already removed, is that they didn't know it was removed in the first place. Different nodes inevitably have different thread orders, which means that node might have "bumped off" a different thread instead, and thinks this one is still valid, therefore sends updates to other nodes.

Previously, this thread was deleted due to its last update being too far in the past compared to others on our board.

Said last update would always be more recent than or equal to the thread's own `creationTime`. Meaning, by adding this thread back on the board and assigning `creationTime` to `lastModified`, we all but guarantee the thread will be immediately deleted as soon as it is added, not affecting any other threads.

So, once deleted threads will tend to stay deleted.

### Network partitions
Finally, there is the situation where our thread was legitimately created a while ago, but didn't reach us until now.
In which case, setting its `lastModified` to the `creationTime` would penalize its position compared to the one it occupies on the boards of nodes that received it in time, before it became `Stale`.

We might even end up deleting it immediately, whereas other nodes still have it near the top of their list.

Unfortunately, as we cannot verify when the replies were created, this is our only sensible option.

## Posts
For post updates, the stakes are lower, since a post only *moves* its thread.

However, posts can be made more often, so some heuristics are necessary.

It should be noted that this section applies to post updates we receive "live".
After we load a thread, we fetch all previously posted replies, and *then* start listening for new content.
It does not apply to posts *already* on a thread when we receive it. Those posts are ignored for bumping, as is obvious from the previous paragraphs.

This is what we do when we receive a post update:

1. If the post's `time` value is within the `TOLERANCE` margin of the current node's local time, we consider it `Valid`. If the thread's `lastModified` is more recent than the post, we do not update it, though: there's no reason to allow a post to push a thread *back* in time. Additionally, if the `time` value of our post is within the `TOLERANCE` margin, but still somewhat in the future, we use the current node's time instead of the post's `time` value in order to update `lastModified`. That way it isn't set to the future in any situation.

2. If the post is `Stale`, we do not change the thread's `lastModified`, and ignore the post for the purpose of bumping, however the post is still stored and displayed to users normally.

3. If the post is `Future`, we do the same as with `Stale`.

This behaviour can cause different nodes to end up with inconstent thread orders depending on when exactly they receive a particular update.

The `TOLERANCE` margin doesn't always mitigate this. For example, one node might receive a post that's timestamped within 1 second of being outside its margin, and bump the thread.
The next node receives it one second later, and doesn't bump it, because it's outside the tolerance.

An attacker that wants to introduce inconsistencies between nodes might intentionally make posts barely within the margin.

We could avoid this inconsistency by altering the beviour for cases `2` and `3`:

1.  If the post is `Stale`, but its time more recent than the thread's `lastModified` value, we could still update the thread's `lastModified` to the post's time. This will likely not move the thread to the top of the board, but it could move the thread up a few places.

2. If the post is `Future`, we do not immediately update `lastModified`, instead we save this new `time` value until it becomes the present, and *then* update it. So we delay bumping the thread with a post from the future, until that post is in the present/recent past. This avoids letting future dated posts keep a thread pinned to the top of the board, while making sure all nodes are still *eventually consistent* on the bump time.

There are issues with these alternative behaviours.

For number `2`, aside from the slight difficulty in implementation of such a system, it would allow one to essentially easily "schedule" bumps indefinitely into the future, simulating someone posting live every 15 seconds. It would still allow someone to pin a thread to the top unless there is a lot of board activity.

We could, of course, introduce a limit to how far in the future we are willing to wait, however that reintroduces the inconsistency issue from before.

For number `1`, the problem is that it allows bumping threads with posts more often than the rate-limiter should allow.

It doesn't let you bring threads to the top, since your post is backdated to a previous time. Additionally, the more backdated posts you make, the further back in time they have to be dated, reducing its impact on the board. No matter how many times you do this, you wouldn't be causing any threads to be deleted, either.

Meanwhile, just a single regular post dated at the current time made by someone else can raise a thread to the top.

However, threads that receive these fake backdated posts are still at an advantage compared to ones that do not, and would still move up on the board.
A risk lies in someone using this in conjunction with the creation of backdated threads, creating those threads first, and then "bumping" them up somewhat using backdated posts.

### Example
Suppose that currently, the `lastModified` value for a thread in position `128` on our board is `5 hours` in the past.

This means that the `127` threads above have received a reply *less than* 5 hours ago.
Meanwhile, the `128` threads below, have received their last reply *more than* 5 hours ago.
Let's assume the thread at the bottom in position `256` received its last reply `2 days` ago.

Our attacker wants to delete as many threads as possible, replacing them with his own.

If he creates `256` threads, the first one will have the current timestamp, and will be placed on top of our board.
The second one will be dated `1000` seconds earlier, which means it will be places near a thread that has not received any replies in 16 minutes. And so on.

Given that the `128`th thread in our assumption received a reply `5 hours` ago, and every thread above it has more recent updates, our attacker will only be able to place at most `18 threads` above the middle of the board, pushing **at most** `18` threads from the top half to the bottom half, and then deleting `18` previously existing threads from the bottom.

**In total**, given that the last post on the board is `48 hours` since the last update, our attacker would manage to have `128 threads` removed from the board's bottom half out of `128` total, and add **at most** that many.

Note that we say *at most* because the deleted threads amount include some of the attacker's newly created threads. Without knowing all the existing threads' `lastModified`, values, it's hard to say exactly which threads will end up where.

When we say 18 threads move from the top half to the lower half, those could also include several of the attacker's new threads, pushed down by the ones he himself created.

Still, by the end of it, ***at least 19 threads*** created by the attacker will be standing.

The danger lies in the attacker being able to backdate 19 posts, of which the oldest would be dated 5 minutes in the past, in order to bring these 19 threads to close to the top in an instant.

We can prevent this by simply not allowing bumping through posts that are over `TOLERANCE` in the past or future.


## Initial synchronization

A big remaining issue with our protocol is intial synchronization for a node that just started up.
Following the previously laid out logic, we would receive nearly all threads as `Stale`, and order them based on creation time.

This leaves us with a **radically** different board order compared to other nodes. Which would lead us to delete very different threads, possibly fairly active ones. Two nodes might never end up reaching the same state.

Therefore, a special protocol has to be introduced for initial synchronization.

One option would be to temporarily accept the most recent reply post `time` as `lastModified` for each thread we receive. That would work in most cases. However it still leaves us vulnerable to attackers who fake post times during that period, and ultimately results in us having a different board order compared to our peers.

Instead, the idea is to allow our peers to tell us what they believe is the `lastModified` time for our threads.

1. When a node first starts up, it puts itself in a `syncing` state. This lasts for a set period of time.
2. During the syncing state, we receive threads and post updates exactly as normal.
3. However we enable a special protocol, and start accepting messages from our peers containting their known `lastModified` time for each thread they know.
4. Any time a node that is **not** in a syncing state makes a new connection to a node, they send these known `lastModified` values to them.
5. If we receive said messages after syncing stopped, we simply ignore them.
6. We combine information from different nodes. For each thread, we compute an average of the timestamps given, after throwing out any that are more than a standard deviation away from the rest.
7. Once the syncing period ends, we start ignoring new submissions, and we *apply* these `lastModified` averaged out computed timestamps to our board.

Note that we don't wipe the current board state at step `7`. For each thread, we compare if the computed `lastModified` is newer than the one we currently have. If it is, we apply it. If our current `lastModified` is newer than the one computed, we don't do anything. It means that most likely we received a post while syncing.

If a thread was deleted while syncing, we re-add it if it would still fit in the board with the new value.

By using the rate limiting nullifier, we can also prevent a single node from making too many submissions to us in order to skew the numbers.

A useful change we can make if we introduce the syncing system, is that we can reject new threads that are *too* `Stale`. For example, if a thread is four hours out of date, and we are **not** syncing, we can assume it was probably created maliciously. The chances of it simply being delayed by network issues are considerably lower. This reduces our attack surface in regards to eclipsing the board with backdated threads.