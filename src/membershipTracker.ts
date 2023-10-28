import { Logger } from "tslog"
import { Timeline } from "./timeline.js"
import { getMemberCIDEpoch, getSecondsSinceCurrentMemberCIDEpoch, getTimestampInSeconds, isTimestampAfterEpochStart } from "./utils.js"

/**
 * Keeps track of member (in)activity and membership proofs expiration
 */
export class MemberTracker {
    private log: Logger<unknown>

    /**
     * Epoch of the latest membership proof of a member
     */
    private epoch: Map<string, number> = new Map()
    /**
     * Last time we received an event timestamp from a member
     */
    private lastEventFrom: Timeline = new Timeline()

    /**
     * Last epoch we purged members
     */
    private lastPurgeEpoch: number = 0

    constructor(logger: Logger<unknown>) {
        this.log = logger
    }
    /**
     * Add a new membership proof for a member
     * @param member PeerID
     * @param epoch Epoch of the membership proof
     * @returns boolean indicating if the membership proof epoch was set
     */
    public add(member: string, epoch: number) {
        if (this.epoch.has(member) && (this.epoch.get(member) || 0) >= epoch) return false
        if (!this.epoch.has(member)) {
            this.log.info(`Tracking new member: ${member}`)
        }
        this.epoch.set(member, epoch)
        return true
    }
    /**
     * Received a new timestamp for an event from a member
     * @param sourceMember 
     */
    public receiveEventTimestamp(sourceMember: string) {
        this.lastEventFrom.unsetTime(sourceMember)
        this.lastEventFrom.setTime(sourceMember, getTimestampInSeconds())
        this.executePurge()
    }

    /**
     * Update the member list. Executes the purge logic.
     */
    public updateMemberList() {
        this.executePurge()
    }

    /**
     * Purge members that have not sent a new membership proof 20 minutes after the start of the new epoch
     */
    private executePurge() {
        // Only execute the expiration logic once per epoch
        if (this.lastPurgeEpoch === getMemberCIDEpoch()) return
        const timeSinceEpoch = getSecondsSinceCurrentMemberCIDEpoch()
        // If we are still in the first 20 minutes of the epoch, we don't want to purge yet
        if (timeSinceEpoch < 600 * 2) return
        this.lastPurgeEpoch = getMemberCIDEpoch()
        this.purgeMembers()
    }
    /**
     * Remove members that have not renewed their membership in the current epoch
     */
    private purgeMembers() {
        this.log.info(`Purging members that have not renewed their membership in epoch ${getMemberCIDEpoch()}`)
        for (const [member, epoch] of this.epoch.entries()) {
            if (epoch < getMemberCIDEpoch()) {
                this.log.info(`Removing member ${member} from tracking`)
                this.epoch.delete(member)
                this.lastEventFrom.unsetTime(member)
            }
        }
    }

    /**
     * Check if a member is currently not expired
     * @param member 
     * @returns boolean indicating if the member is currently expired
     */
    public isMember(member: string) {
        return this.epoch.has(member)
    }

    /**
     * Get the number of active members
     * @returns number of active members
     */
    public getNActiveMembers() {
        const [lastPublishTime, _] = this.lastEventFrom.getMostRecent()
        if (!lastPublishTime) return 0
        const activeMembers = this.lastEventFrom.getEvents(lastPublishTime - (600*1000)).length
        return activeMembers
    }
}