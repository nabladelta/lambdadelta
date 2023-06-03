
export function serializePost(post: IPost) {
    return Buffer.from(JSON.stringify(post), 'utf-8')
}

export function deserializePost(buf: Buffer): IPost {
    return JSON.parse(buf.toString())
}