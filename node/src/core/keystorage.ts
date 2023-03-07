import b4a from 'b4a'

export class Keystorage {
    private storage: any
    private path: string

    constructor(storage: any, path: string) {
        this.storage = storage
        this.path = path
    }

    private _getStorage(file: string) {
        return this.storage('keystore/' + this.path + file)
    }

    public _readStorageKey(file: string, output: Set<string>) {
        const store = this._getStorage(file)
        return new Promise<void>((resolve, reject) => {
            store.stat(async (err: any, stat: any) => {
                if (err) {
                    resolve()
                    return
                }

                const len = stat.size
                for (let start = 0; start < len; start += 32) {
                    await new Promise<void>((resolve, reject) => {
                        store.read(start, 32, function (err: any, buf: Buffer) {
                            if (err) throw err

                            output.add(buf.toString('hex'))
                            resolve()
                        })
                    })
                }

                store.close()
                resolve()
            })
        }
        )
    }

    public async _updateStorageKey(file: string, input: Set<string>) {
        const store = this._getStorage(file)
        let i = 0
        for (const data of input) {
            const start = i * 32
            // console.log('write data', data)
            await new Promise<void>((resolve, reject) => {
                store.write(start, b4a.from(data, 'hex'), (err: any) => {
                    if (err) return reject(err)

                    resolve()
                })
            })
            i++
        }
        store.close()
    }
}