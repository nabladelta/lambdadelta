import 'jest'
import { BulletinBoard } from '../src/core/board'
import { getTimestampInSeconds } from '../src/core/utils/utils'
import createTestnet from '@hyperswarm/testnet'

describe('Environment', () => {
    let board: BulletinBoard
    let board2: BulletinBoard

    beforeEach(() => {
        board = new BulletinBoard('secret1secret1secret1', 'a', true)
        board2 = new BulletinBoard('secret1secret1secret2', 'a', true)
    })

    it('message', async () => {
        const {bootstrap} = await createTestnet(3)
        console.log(bootstrap)
        await board.ready()
        const threadId = await board.newThread()
        await board.newMessage(threadId, {com: "test", time: getTimestampInSeconds()})
        await board2.joinThread(threadId)
        await board2.newMessage(threadId, {com: "test2", time: getTimestampInSeconds()})

        console.log(await board2.getThreadContent(threadId))

    })
})