interface IPost {
    id?: string, // The post's locator
    no?: string, // 16 hex digit ID
    time: integer, // UNIX timestamp the post was created
    com: string, // Comment
    sub?: string, // OP Subject text
    name?: string, // Name user posted with. Defaults to Anonymous
    trip?: string, // The user's tripcode, in format: !tripcode or !!securetripcode
    resto?: string, // For replies: this is the ID of the thread being replied to. For OP: this value is zero
    replies?: number, // Replies
    images?: number, // Image replies
    filename?: string, // Filename as it appeared on the poster's device
    ext?: string, // Filetype
    tim?: string, // File ID
    w?: number, // Image width dimension
    h?: number, // Image height dimension
    sha256?: string, // File hash
    md5?: string // File hash
    fsize?: number, // File size
    mime?: string // File mime type
    last_replies?: IPost[]
    last_modified?: number // Last modified time in ms 
}

interface IThread {
    posts: IPost[]
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

interface IBoard {
    board: string // Topic
    pages: number
    per_page: number
}
interface IBoardList {
    boards: IBoard[]
}