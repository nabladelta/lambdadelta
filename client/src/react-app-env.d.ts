/// <reference types="react-scripts" />

interface IPost {
    no: string, // The post ID
    time: integer, // UNIX timestamp the post was created
    com: string, // Comment
    parsedCom?: JSX.Element // Injected afterwards
    sub?: string, // OP Subject text
    name?: string, // Name user posted with. Defaults to Anonymous
    trip?: string, // The user's tripcode, in format: !tripcode or !!securetripcode
    resto?: string, // For replies: this is the ID of the thread being replied to. For OP: this value is zero
    replies?: number,
    images?: number,
    filename?: string, // Filename as it appeared on the poster's device
    mime?: string,
    ext?: string, // Filetype
    tim?: string, // File ID
    sha256?: string, // File hash
    fsize?: number, // File size
    w?: number, // Image width dimension
    h?: number, // Image height dimension
    tn_w?: number, // Thumb w
    tn_h?: number, // Thumb h
}

interface IThread {
    posts: IPost[]
}

interface ICatalogPage {
    page: number,
    threads: IPost[]
}

interface IFileData {
    filename: string;
    type: string;
    data: string;
}

interface IBoard {
    board: string // Topic
    pages: number
    per_page: number
}
interface IBoardList {
    boards: IBoard[]
}

interface IProcessedThread {
    replies: {
        [no: string]: Set<IPost>
    }
    posts: IPost[]
    postsByRef: {
        [no: string]: IPost
    }
}