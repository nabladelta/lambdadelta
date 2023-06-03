import { Lambdadelta }  from "@bernkastel/lambdadelta"
import { NullifierSpec } from "@bernkastel/lambdadelta"
import { serializePost } from "./utils"
import { VerificationResult } from "@bernkastel/rln"
import { FeedEventHeader } from "@bernkastel/lambdadelta/src/lambdadelta"

const TYPE_THREAD = "THREAD"
const TYPE_POST = "POST"

export class BulletinBoard extends Lambdadelta {
    
    protected async validateContent(eventID: string, eventType: string, buf: Buffer): Promise<boolean> {
        return true
    }

    protected registerTypes(): void {
        const singlePost: NullifierSpec = {
            epoch: 10, // 10 Seconds per epoch
            messageLimit: 1 // 1 Message per epoch
        }
        const dailyPosts: NullifierSpec = {
            epoch: 86400, // 1 hour per epoch
            messageLimit: 2048 // 2048 messages per epoch
        }
        this.addEventType(TYPE_POST, [singlePost, dailyPosts], 4096)

        const singleThread: NullifierSpec = {
            epoch: 1000, // 1000 seconds per epoch
            messageLimit: 1 // 1 thread per epoch
        }
        const dailyThreads: NullifierSpec = {
            epoch: 86400, // 1 hour per epoch
            messageLimit: 16 // 16 threads per epoch
        }
        this.addEventType(TYPE_THREAD, [singleThread, dailyThreads], 4096)
    }

    protected async onTimelineAddEvent(eventID: string, time: number, consensusTime: number) {
        const event = await this.getEventByID(eventID)
        if (!event) throw new Error("Missing event")
        switch(event.header.eventType) {
            case TYPE_THREAD:
                this.recvThread(eventID, event.header, event.content)
                break
        }
    }

    private recvThread(eventID: string, header: FeedEventHeader, content: Buffer) {

    }

    public async newThread(op: IPost) {
        const result = await this.newEvent(TYPE_THREAD, serializePost(op))
        if (result !== VerificationResult.VALID) {
            return false
        }

    }
}