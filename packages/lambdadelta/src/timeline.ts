import BTree from 'sorted-btree'

export class Timeline {
    private timeline: BTree<number, string> // Timestamp (ms) => EventID
    private eidTime: Map<string, number> // EventID => Timestamp (ms)
    
    constructor() {
        this.timeline = new BTree()
        this.eidTime = new Map()
    }

    /**
     * Sets an event's timestamp in the internal timeline
     * @param time The event's timestamp in seconds
     * @param eventID ID of the event
     * @returns The previously saved timestamp (ms), or undefined
     */
    public setTime(eventID: string, time: number) {
        const prevTime = this.eidTime.get(eventID)
        if (prevTime) { // Already existing key
            this.timeline.delete(prevTime)
        }
        let newTime = time * 1000 // Convert to ms
        while(!this.timeline.setIfNotPresent(newTime, eventID)) {
            // Keep trying with a newer time until we find an empty spot
            newTime++
        }
        this.eidTime.set(eventID, newTime)
        return prevTime
    }

    /**
     * Removes an event from the timeline
     * @param eventID ID of the event
     * @returns The previously set time or undefined
     */
    public unsetTime(eventID: string) {
        const prevTime = this.eidTime.get(eventID)
        if (prevTime !== undefined) { // Already existing key
            this.timeline.delete(prevTime)
        }
        this.eidTime.delete(eventID)
        return prevTime
    }

    /**
     * Get events from the timeline dated between `startTime` and `endTime`
     * @param startTime Events with this timestamp or newer will be included
     * @param endTime Events with this timestamp or older will be included
     * @param maxLength Maximum number of results
     * @param includeHigh Whether the reange is inclusive or exclusive of endTime
     * @returns Array of [time, eventID]
     */
    public getEvents(
        startTime: number = 0,
        endTime?: number,
        maxLength?: number,
        includeHigh: boolean = true
        ): [number, string][] {

        endTime = endTime || this.timeline.maxKey()
        if (!endTime) return []

        return this.timeline
            .getRange(startTime, endTime, includeHigh, maxLength)
    }

    public getTime(eventID: string) {
        return this.eidTime.get(eventID)
    }
}