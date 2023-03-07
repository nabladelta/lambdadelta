import Hyperblobs from 'hyperblobs'

export class Filestore {
    private corestore: any

    constructor(corestore: any) {
        this.corestore = corestore.namespace('filestore')
    }

    public async store(tid: string, data: Buffer) {
        const core = this.corestore.namespace('op').get({ name: tid})
        await core.ready()
        const blobs = new Hyperblobs(core)
        return await blobs.put(data)
    }

    public async retrieve(tid: string, id: BlobID) {
        const core = this.corestore.namespace('op').get({ name: tid})
        await core.ready()
        const blobs = new Hyperblobs(core)
        return await blobs.get(id)
    }
}