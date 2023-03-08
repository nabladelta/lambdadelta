
const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = error => reject(error)
})
  
export async function getFileData(file: File): Promise<IFileData> {
    return {
    filename: file.name,
    type: file.type,
    data: (await toBase64(file))
    }
}
  