import crypto from 'crypto'
import { Filestore } from './core/filestore'
import sharp from 'sharp'
import fs from 'fs'
import mime from 'mime'
import MediaInfo from 'mediainfo.js'

export async function processAttachment(filestore: Filestore, fileData: IFileData, post: IPost, tid: string) {
    const buf = Buffer.from(fileData.data, 'base64')

    post.sha256 = crypto.createHash('sha256').update(buf).digest('hex')
    post.md5 = crypto.createHash('md5').update(buf).digest('base64')

    if (fileData.type == 'video/webm' || fileData.type == 'video/mp4') {
        const videoInfo = await processVideo(buf)
        post.w = videoInfo.w
        post.h = videoInfo.h
        post.mime = videoInfo.mime
    } else { // Image
        try {
            const meta = await sharp(buf).metadata()
            post.w = meta.width
            post.h = meta.height
            post.mime = mime.getType(meta.format || "") || fileData.type
        } catch (e) {
            console.log(e)
            throw new Error("Failed to process image")
        }
    }

    const {cid, blobId} = await filestore.store(tid, buf, post.mime) || {}
    if (!cid || !blobId) throw new Error(`Failed to store file (size: ${buf.length}, type: ${post.mime})`)

    // Where the period splits filename and ext
    const pos = (fileData.filename.lastIndexOf(".") - 1 >>> 0) + 1

    post.filename = fileData.filename.slice(0, pos)
    post.ext = fileData.filename.slice(pos) // Includes ., ex: ".jpg"
    post.fsize = buf.length
    post.tim = cid + '-' + blobId.byteOffset.toString(16)
        + '-' + blobId.blockOffset.toString(16)
        + '-' + blobId.blockLength.toString(16)
        + '-' + blobId.byteLength.toString(16)
    return post
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

async function processVideo(buf: Buffer) {
        const info = await MediaInfo({format: 'object'})
        let tracks: Track[] | undefined
        try {
            info.openBufferInit(buf.length, 0)
            info.openBufferContinue(buf, buf.length)
            info.openBufferFinalize()
            tracks = JSON.parse(info.inform()).media?.track
            if (!tracks) throw new Error("No tracks")
        } catch (e) {
            console.log(e)
            throw new Error("Failed to process video")
        }

        const general = tracks.find(t => t['@type'] == 'General')
        let mime = ''
        if (general?.Format == 'WebM') {
            mime = 'video/webm'
        } else if (general?.Format == 'MPEG-4') {
            mime = 'video/mp4'
        } else {
            throw new Error(`Unsupported video format: ${general?.Format}`)
        }
        
        const video = tracks.find(t => t['@type'] == 'Video')
        if (video?.['@type'] != 'Video') {
            throw new Error("No video track found")
        }
        return {w: parseInt(video.Height), h: parseInt(video.Width), mime}
}


export async function makeThumbnail(filestore: Filestore, fid: string, filename?: string) {
    const {cid, blobId} = parseFileID(fid)
    const content = await filestore.retrieve(cid, blobId)
    if (!content) return false
    try {
        const i = sharp(content.data).resize(
            512, 512,
            {
                fit: 'inside',
                withoutEnlargement: true
            })
        .toFormat('jpeg')

        if (filename) {
            return await i.toFile(filename)
        }
        return await i.toBuffer()
    } catch (e) {
        console.log(e)
        return false
    }
}

export const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(e => false));
