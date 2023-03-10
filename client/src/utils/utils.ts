
const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split('base64,')[1])
    reader.onerror = error => reject(error)
})

export async function getFileData(file: File): Promise<IFileData> {
    return {
        filename: file.name,
        type: file.type,
        data: (await toBase64(file))
    }
}

export function formatBytes(bytes: number, decimals = 0) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function truncateText(str: string, n: number){
    return (str.length > n) ? str.slice(0, n-1) + '(…)' : str;
}

export function isVideo(post: IPost) {
    return post.mime == 'video/webm' || post.mime == 'video/mp4' ? true : false
}

export function getPostDateString(time: number) {
    const date = new Date(time * 1000)
    const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return `${date.getDate()}/${date.getMonth()}/${date.getFullYear().toString().slice(2)}(${weekday[date.getDay()]})${date.toLocaleTimeString()}`
}