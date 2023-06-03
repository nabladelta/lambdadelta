import { Lambdadelta }  from "@bernkastel/lambdadelta"

export class BulletinBoard extends Lambdadelta {
    protected async validateContent(eventID: string, eventType: string, buf: Buffer): Promise<boolean> {
        return true
    }
}