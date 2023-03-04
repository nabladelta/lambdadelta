import 'jest'
import { BulletinBoard } from '../src/core/board'

describe('Environment', () => {
    let board: BulletinBoard

    beforeEach(() => {
        board = new BulletinBoard('secret1secret1secret1', '', true)
    })

    it('should get the current environment', async () => {
        expect(board).toBeInstanceOf(BulletinBoard)
        await board.ready()
        await board.newThread()
    })
})