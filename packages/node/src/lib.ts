import crypto from 'crypto'
import sharp from 'sharp'
import fs from 'fs'
import mime from 'mime'
import MediaInfo from 'mediainfo.js'
import { FILE_SIZE_LIMIT_UPLOAD, THUMB_FORMAT, THUMB_SIZE } from './constants'
import { mainLogger } from './logger'
import c from 'compact-encoding'

const log = mainLogger.getSubLogger({name: 'HTTP'})

export function encodeMime(data: Buffer, mime: string = ""): Buffer {
    const state = c.state()
    c.string.preencode(state, mime)
    c.buffer.preencode(state, data)
    state.buffer = Buffer.allocUnsafe(state.end)
    c.string.encode(state, mime)
    c.buffer.encode(state, data)
    return state.buffer
}

export function decodeMime(buffer: Buffer): {mime: string, data: Buffer} {
    const state = { start: 0, end: buffer.length, buffer, cache: null }
    const mime = c.string.decode(state)
    const data = c.buffer.decode(state)
    return {mime, data}
}

export async function processAttachment(fileData: IFileData, post: IPost, topic: string) {
    const buf = Buffer.from(fileData.data, 'base64')

    if (buf.length > FILE_SIZE_LIMIT_UPLOAD) throw new Error(`File too large (FILE_SIZE_LIMIT_UPLOAD: ${buf.length} Bytes`)
    
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
            log.error(e)
            throw new Error("Failed to process image")
        }
    }

    const encoded = encodeMime(buf, post.mime)

    post.sha256 = crypto.createHash('sha256').update(encoded).digest('hex')

    // Where the period splits filename and ext
    const pos = (fileData.filename.lastIndexOf(".") - 1 >>> 0) + 1

    post.filename = fileData.filename.slice(0, pos)
    post.ext = fileData.filename.slice(pos) // Includes ., ex: ".jpg"
    post.fsize = buf.length
    post.tim = topic + '-' + post.sha256
    return { post, attachment: encoded }
}

export function parseFileID(fileID: string) {
    const id = fileID.split('.')[0]
    const [topic, attachmentHash] = id.split('-')
    return {topic, attachmentHash}
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
            log.error(e)
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


export async function makeThumbnail(data: Buffer, filename?: string) {
    try {
        const i = sharp(data).resize(
            THUMB_SIZE, THUMB_SIZE,
            {
                fit: 'inside',
                withoutEnlargement: true
            })
        .toFormat(THUMB_FORMAT)

        if (filename) {
            return await i.toFile(filename)
        }
        return await i.toBuffer()
    } catch (e) {
        log.error(e)
        return false
    }
}

export const fileExists = async (path: string) => !!(await fs.promises.stat(path).catch(e => false));
