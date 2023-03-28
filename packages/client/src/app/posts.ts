import { API_URL } from "../constants"

async function handleError(resp: Response, defaultMessage: string) {
    if (!resp.ok) {
        let response
        try {
            response = await resp.json()
        } catch {
            throw new Error(defaultMessage)
        }
        throw new Error(response.error || defaultMessage)
    }
}

const jsonPOSTOptions = {
    method: 'POST',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
}

export async function postThread(board: string, postData: {post: IPost, attachments: IFileData[]}) {
    const r = await fetch(`${API_URL}/${board}`, {
        ...jsonPOSTOptions,
        body: JSON.stringify(postData)
    })
    await handleError(r, "Post failed")
    return await r.json()
}

export async function postReply(board: string, threadId: string, postData: {post: IPost, attachments: IFileData[]}) {
    postData.post.resto = threadId
    const r = await fetch(`${API_URL}/${board}/thread/${threadId}`, {
        ...jsonPOSTOptions,
        body: JSON.stringify(postData)
    })
    await handleError(r, "Post failed")
    return await r.json()
}

export async function fetchThread(board: string, threadId: string): Promise<IThread> {
    const r = await fetch(`${API_URL}/${board}/thread/${threadId}`)
    await handleError(r, "Failed to fetch thread")
    return await r.json()
}

export async function fetchCatalog(board: string): Promise<ICatalogPage[]> {
    const r = await fetch(`${API_URL}/${board}/catalog`)
    await handleError(r, "Failed to fetch catalog")
    return await r.json()
}

export async function fetchBoards(): Promise<IBoardList> {
    const r = await fetch(`${API_URL}/boards`)
    await handleError(r, "Failed to fetch boards")
    return await r.json()
}