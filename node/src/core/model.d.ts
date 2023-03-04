interface IPost {
    no?: string, // The post ID
    time: integer, // UNIX timestamp the post was created
    com: string, // Comment
    sub?: string, // OP Subject text
    name?: string, // Name user posted with. Defaults to Anonymous
    trip?: string, // The user's tripcode, in format: !tripcode or !!securetripcode
    resto?: string, // For replies: this is the ID of the thread being replied to. For OP: this value is zero
    replies?: number,
    last_replies?: IPost[]
}

interface IThread {
    posts: IPost[]
}

interface IBoard {
    threads: string[]
}
