import Hyperblobs from 'hyperblobs'
import b4a from 'b4a'
import c from 'compact-encoding'
import { FILE_FETCH_TIMEOUT_MS, FILE_SIZE_LIMIT_DOWNLOAD } from '../constants'
import { mainLogger } from './logger'

const log = mainLogger.getSubLogger({name: 'filestore'})
export class Filestore {
    private corestore: any

    constructor(corestore: any) {
        this.corestore = corestore.namespace('filestore')
    }

    public async store(tid: string, data: Buffer, mime?: string) {
        const core = this.corestore.namespace('op').get({ name: tid })
        await core.ready()
        const blobs = new Hyperblobs(core)
        if (!mime) mime = ""

        const state = c.state()
        c.string.preencode(state, mime)
        c.buffer.preencode(state, data)
        state.buffer = Buffer.allocUnsafe(state.end)
        c.string.encode(state, mime)
        c.buffer.encode(state, data)
        try {
            const blobId: BlobID = await blobs.put(state.buffer)
            return { cid: core.key.toString('hex') as string, blobId }
        } catch (e) {
            log.error(e)
        }
        return false
    }

    public async retrieve(cid: string, id: BlobID, timeout?: number, maxLength?: number): Promise<{mime: string, data: Buffer} | false> {
        timeout = timeout || FILE_FETCH_TIMEOUT_MS
        maxLength = maxLength || FILE_SIZE_LIMIT_DOWNLOAD
        if (id.byteLength > maxLength) return false
        try {
            const core = this.corestore.get(b4a.from(cid, 'hex'))
            await core.ready()
            const blobs = new Hyperblobs(core)
            const buffer: Buffer = await blobs.get(id, { timeout })

            const state = { start: 0, end: buffer.length, buffer, cache: null }
            const mime = c.string.decode(state)
            const data = c.buffer.decode(state)

            return {mime, data}
        } catch (e) {
            log.error(e)
            return false
        }
    }
}