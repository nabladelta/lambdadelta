import { readFile } from "fs/promises"
import { GroupDataProvider, GroupEvent } from "./dataProvider"
import { GROUP_FILE } from "../../../constants"

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

    protected async loadEvents(lastEventIndex: number): Promise<GroupEvent[]> {
        const groupData = await FileProvider.loadFile(this.filename)
        return groupData.groupEvents.slice(lastEventIndex)
    }

    protected async retrieveRoot(_: string) {
        return [undefined, undefined]
    }

    public static async load(filename?: string) {
        const groupData = await FileProvider.loadFile(filename || GROUP_FILE)
        const provider = new FileProvider(groupData.id, groupData.treeDepth, GROUP_FILE)
        await provider.update()
        return provider
    }
}