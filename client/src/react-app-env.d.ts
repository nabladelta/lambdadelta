/// <reference types="react-scripts" />

interface IPost {
    no: string, // The post ID
    time: integer, // UNIX timestamp the post was created
    com: string, // Comment
    sub?: string, // OP Subject text
    name?: string, // Name user posted with. Defaults to Anonymous
    trip?: string, // The user's tripcode, in format: !tripcode or !!securetripcode
    resto?: string, // For replies: this is the ID of the thread being replied to. For OP: this value is zero
    filename?: string, // Filename as it appeared on the poster's device
    ext?: string, // Filetype
    tim?: string, // File ID
    sha256?: string, // File hash
    fsize?: number, // File size
    w?: number, // Image width dimension
    h?: number, // Image height dimension
    tn_w?: number, // Thumb w
    tn_h?: number, // Thumb h
}