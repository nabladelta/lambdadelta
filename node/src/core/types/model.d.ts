interface IPost {
    no?: string, // The post ID
    time: integer, // UNIX timestamp the post was created
    com: string, // Comment
    sub?: string, // OP Subject text
    name?: string, // Name user posted with. Defaults to Anonymous
    trip?: string, // The user's tripcode, in format: !tripcode or !!securetripcode
    resto?: string, // For replies: this is the ID of the thread being replied to. For OP: this value is zero
    replies?: number,
    filename?: string, // Filename as it appeared on the poster's device
    ext?: string, // Filetype
    tim?: string, // File ID
    sha256?: string, // File hash
    md5?: string // File hash
    fsize?: number, // File size
    mime?: string
    last_replies?: IPost[]
}

interface IThread {
    posts: IPost[]
}

interface IBoard {
    threads: string[]
}

interface ICatalogPage {
    page: number
    threads: IPost[]
}

interface IFileData {
    filename: string
    type: string
    data: string
}

interface IAttachment {
    filename: string
    type: string
    address: { cid: string, blobId: BlobID} 
}