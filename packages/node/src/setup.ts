import { RLN } from "@bernkastel/rln"
import { BBNode } from "@bernkastel/core"
import { DATA_FOLDER, GROUPID, GROUP_FILE, SECRET } from './constants'


export async function nodeSetup() {
    const rln = await RLN.load(SECRET!, GROUP_FILE)
    const node = new BBNode(SECRET!, GROUPID, rln, {memstore: true, dataFolder: DATA_FOLDER})
    await node.ready()
    await node.join(['a', 'b'])
    return node
}