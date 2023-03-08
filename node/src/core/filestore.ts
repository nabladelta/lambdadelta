import Hyperblobs from 'hyperblobs'
import b4a from 'b4a'

export class Filestore {
    private corestore: any

    constructor(corestore: any) {
        this.corestore = corestore.namespace('filestore')
    }

    public async store(tid: string, data: Buffer) {
        const core = this.corestore.namespace('op').get({ name: tid})
        await core.ready()
        const blobs = new Hyperblobs(core)
        return { cid: core.key.toString('hex'), blobId: await blobs.put(data) as BlobID }
    }

    public async retrieve(cid: string, id: BlobID): Promise<Buffer> {
        const core = this.corestore.get(b4a.from(cid, 'hex'))
        await core.ready()
        const blobs = new Hyperblobs(core)
        return await blobs.get(id)
    }
}