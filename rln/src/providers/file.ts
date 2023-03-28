import { readFile, writeFile } from "fs/promises"
import { GroupDataProvider, GroupEvent } from "./dataProvider"
import poseidon from 'poseidon-lite'

export interface GroupFile {
    id: string,
    treeDepth: number,
    groupEvents: GroupEvent[]
}

export class FileProvider extends GroupDataProvider {
    private filename: string

    private constructor(gid: string, treeDepth: number, filename: string) {
        super(gid, treeDepth)
        this.filename = filename
    }

    private static async loadFile(filename: string): Promise<GroupFile> {
        const file = await readFile(filename)
        const groupData = JSON.parse(file.toString('utf-8'))
        return groupData
    }

    private static async saveFile(data: GroupFile, filename: string): Promise<void> {
        const groupData = JSON.stringify(data)
        await writeFile(filename, groupData)
    }

    protected async loadEvents(lastEventIndex: number): Promise<GroupEvent[]> {
        const groupData = await FileProvider.loadFile(this.filename)
        return groupData.groupEvents.slice(lastEventIndex)
    }

    protected async retrieveRoot(_: string) {
        return [undefined, undefined]
    }

    public static async load(filename: string) {
        const groupData = await FileProvider.loadFile(filename)
        const provider = new FileProvider(groupData.id, groupData.treeDepth, filename)
        await provider.update()
        return provider
    }

    public static async write(groupEvents: GroupEvent[], filename: string) {
        let groupData: GroupFile | undefined
        try {
            groupData = await this.loadFile(filename)
        } catch (e) {}
        if (!groupData) groupData = {id: "1", treeDepth: 20, groupEvents: []}
        groupData.groupEvents = groupData.groupEvents.concat(groupEvents)
        FileProvider.saveFile(groupData, filename)
    }
    public async slash(secretIdentity: bigint) {
        const identityCommitment = poseidon([secretIdentity])
        const event = GroupDataProvider.createEvent(
            identityCommitment,
            this.getMultiplier(identityCommitment),
            "REMOVE")
        await FileProvider.write([event], this.filename)
        await this.update()
    }
}