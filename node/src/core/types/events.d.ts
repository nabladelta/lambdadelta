import { Thread } from "../thread";

interface BoardEvents {
    'joinedThread': (threadId: string, thread: Thread) => void
    'peerConnected': (publicKey: Buffer) => void
}

interface ThreadEvents {
    'addedCores': (coreIds: string[]) => void
    'receivedCores': (coreIds: string[]) => void
    'receivedPost': (threadId: string, post: IPost) => void
}