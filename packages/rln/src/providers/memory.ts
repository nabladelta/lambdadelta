import { readFile, writeFile } from "fs/promises"
import { GroupDataProvider, GroupEvent } from "./dataProvider"
import poseidon from 'poseidon-lite'

export interface GroupData {
    id: string,
    treeDepth: number,
    groupEvents: GroupEvent[]
}

export class MemoryProvider extends GroupDataProvider {
    private groupData: GroupData

    private constructor(gid: string, treeDepth: number, groupData: GroupData) {
        super(gid, treeDepth)
        this.groupData = groupData
    }

    protected async loadEvents(lastEventIndex: number): Promise<GroupEvent[]> {
        return this.groupData.groupEvents.slice(lastEventIndex)
    }

    protected async retrieveRoot(_: string) {
        return [undefined, undefined]
    }

    public static async load(groupData: GroupData) {
        const provider = new MemoryProvider(groupData.id, groupData.treeDepth, groupData)
        await provider.update()
        return provider
    }

    public static write(groupEvents: GroupEvent[], groupData: GroupData | undefined) {        
        if (!groupData) groupData = {id: "1", treeDepth: 20, groupEvents: []}
        groupData.groupEvents = groupData.groupEvents.concat(groupEvents)
        return groupData
    }
    public async slash(secretIdentity: bigint) {
        const identityCommitment = poseidon([secretIdentity])
        const event = GroupDataProvider.createEvent(
            identityCommitment,
            this.getMultiplier(identityCommitment),
            "REMOVE")
        MemoryProvider.write([event], this.groupData)
        await this.update()
    }
}