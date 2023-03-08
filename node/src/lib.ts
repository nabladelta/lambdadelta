import crypto from 'crypto'
import { Filestore } from './core/filestore'

export async function processAttachment(filestore: Filestore, fileData: IFileData, post: IPost, tid: string) {
    const buf = Buffer.from(fileData.data, 'base64')
    const id = await filestore.store(tid, buf)
    const sha256 = crypto.createHash('sha256')
    sha256.update(buf)
    post.sha256 = sha256.digest('hex')
    const md5 = crypto.createHash('sha256')
    md5.update(buf)
    post.md5 = md5.digest('base64')
    console.log('length', post.md5.length)
    const [filename, ext] = fileData.filename.split('.')
    post.filename = filename
    post.ext = '.' + ext
    post.fsize = buf.length
    post.tim = id.cid + '-' + id.blobId.byteOffset.toString(16) + '-' + id.blobId.blockOffset.toString(16) + '-' + id.blobId.blockLength.toString(16) + '-' + id.blobId.byteLength.toString(16)
    post.mime = fileData.type
}
  
export async function parseFileID(fileID: string) {
    const id = fileID.split('.')[0]
    const [cid, byteOffset, blockOffset, blockLength, byteLength] = id.split('-')
    return {cid, blobId: {
      byteOffset: parseInt(byteOffset, 16), 
      blockOffset: parseInt(blockOffset, 16),
      blockLength: parseInt(blockLength, 16), 
      byteLength: parseInt(byteLength, 16)
    }}
  }