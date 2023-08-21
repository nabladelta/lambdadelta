import 'jest'
import { RoutingTable } from '../src'
import { sleep } from './utils'

describe('Routing Table', () => {
    it('Performs basic routing', async () => {
        const me = 'me'
        const t = new RoutingTable(me, 2, 2, 0)
        const users = ['alice', 'bob', 'carl', 'dennis', 'earnest', 'francis', 'goober', 'smith']
        t.updatePeers(users)
        const destinations = t.getCurrentDestinations()
        expect(destinations.length).toEqual(2)
        expect(new Set(destinations).size).toEqual(2)
        for (const dest of destinations) {
            expect(dest).not.toEqual(me)
            expect(users.includes(dest))
        }
        expect(destinations.includes(t.getDestination(me) || "a"))
        const mapping: {[user: string]: string} = {}
        for (const user of users) {
            const dest = t.getDestination(user)
            expect(dest !== undefined)
            if (!dest) continue
            mapping[user] = dest
            expect(destinations.includes(dest))
        }
        for (let i = 0; i < 3; i++) {
            for (const user of users) {
                expect(t.getDestination(user) == mapping[user])
            }
        }
        const users_2 = [...users, 'alex', 'stephanie']
        t.updatePeers(users_2)
        for (const user of users) {
            expect(t.getDestination(user) == mapping[user])
        }
        expect(t.getDestination('alex') != undefined)
        expect(t.getDestination('stephanie') != undefined)
        
        const users_3_set = (new Set(users))
        for (const dest of destinations) {
            users_3_set.delete(dest)
        }
        const users_3 = Array.from(users_3_set)

        t.updatePeers(users_3)
        expect(!t.getCurrentDestinations().includes(destinations[0]))
        expect(!t.getCurrentDestinations().includes(destinations[1]))
        const destinations_2 = t.getCurrentDestinations()
        await sleep(3000)
        expect(t.getCurrentDestinations()[0] != destinations_2[0])
    })
})