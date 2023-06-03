import { LDNode, Lambdadelta }  from "@bernkastel/lambdadelta"
import { BulletinBoard } from "./board"

export class BBNode extends LDNode {
    public static appID = "BBS"
    public static protocolVersion = "1"

    protected newFeed(topicHash: string): Lambdadelta {
        return new BulletinBoard(topicHash, this.corestore, this.rln!)
    }
}

