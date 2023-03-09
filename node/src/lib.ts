import crypto from 'crypto'
import { Filestore } from './core/filestore'
import sharp from 'sharp'
import fs from 'fs'

export async function processAttachment(filestore: Filestore, fileData: IFileData, post: IPost, tid: string) {
    const buf = Buffer.from(fileData.data, 'base64')

    post.sha256 = crypto.createHash('sha256').update(buf).digest('hex')
    post.md5 = crypto.createHash('md5').update(buf).digest('base64')

    const {cid, blobId} = await filestore.store(tid, buf, fileData.type) || {}
    if (!cid || !blobId) return false

    // Where the period splits filename and ext
    const pos = (fileData.filename.lastIndexOf(".") - 1 >>> 0) + 1

    post.filename = fileData.filename.slice(0, pos)
    post.ext = fileData.filename.slice(pos) // Includes ., ex: ".jpg"
    post.fsize = buf.length
    post.mime = fileData.type
    post.tim = cid + '-' + blobId.byteOffset.toString(16) 
        + '-' + blobId.blockOffset.toString(16) 
        + '-' + blobId.blockLength.toString(16) 
        + '-' + blobId.byteLength.toString(16)
    return true
}

export function parseFileID(fileID: string): { cid: string, blobId: BlobID } {
    const id = fileID.split('.')[0]
    const [cid, byteOffset, blockOffset, blockLength, byteLength] = id.split('-')

    return {cid, blobId: {
      byteOffset: parseInt(byteOffset, 16), 
      blockOffset: parseInt(blockOffset, 16),
      blockLength: parseInt(blockLength, 16), 
      byteLength: parseInt(byteLength, 16)
    }}

}

export async function makeThumbnail(filestore: Filestore, fid: string, filename: string) {
    const id = parseFileID(fid)
    const content = await filestore.retrieve(id.cid, id.blobId)
    if (!content) return false
    try {
        const r = await sharp(content.data).resize(
            512, 512, 
            {
                fit: 'inside',
                withoutEnlargement: true
            })
        .toFormat('jpeg')
        .toFile(filename)
        return r
    } catch (e) {
        console.log(e)
        return false
    }
}

export const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(e => false));
