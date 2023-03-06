import Protomux from 'protomux'
import c from 'compact-encoding'
import b4a from 'b4a'
import Hypercore from 'hypercore'
import { difference } from './utils/utils'
import { TypedEmitter } from 'tiny-typed-emitter'
import { ThreadEvents } from './events'
export class Thread extends TypedEmitter<ThreadEvents> {
  uid: string
  base: any
  get: any
  storage: any
  _ready: Promise<void | void[]>

  constructor (uid: string, base: any, get: any, storage: any) {
    super()
    this.uid = uid
    this.base = base
    this.get = get
    this.storage = Hypercore.defaultStorage(storage)

    // Load storage
    this._ready = Promise.resolve().then(() => {
        const coresToLoad = []

        // Load local cores first
        if (this.base.localInput) {
          coresToLoad.push(this._addKeys([this.base.localInput.key.toString('hex')]))
        }

        // Load storage cores
        coresToLoad.push(this.readStorageKeys())

        return Promise.all(coresToLoad)
    })
  }

  ready() {
    return this._ready
  }

  allInputs() {
    // Ensure thread ID is first
    return [this.uid].concat(this.base.inputs
    .map((core: any) => core.key.toString('hex'))
    .filter((k: string) => k != this.uid))
  }

  async allow(msg: string) {
    return true
  }

  async recv(msgs: string[]) {
    this.emit('receivedCores', msgs)
    const allowedKeys = msgs.filter((msg: string) => this.allow(msg))
    if (allowedKeys.length) {
      // Check if any are new
      const allKeys = new Set(this.allInputs())
      const newKeys = difference(allowedKeys, allKeys)
      if (newKeys.size > 0) {
        await this._addKeys(newKeys)
        await this.updateStorageKeys()
        return this.allInputs()
      }
      return false
    }
  }

  async _addKeys(keys: string[] | Set<string>) {
    // Get & Ready Cores
    const cores = await Promise.all(Array.from(keys).map(async (key) => {
      const core = this.get(b4a.from(key, 'hex'))
      // Necessary for autobase id (aka the core's id) setup
      await core.ready()
      return core
    }))
    // Add to the corresponding place in autobase
    for (const core of cores) {
      await this.base.addInput(core)
    }
    this.emit("addedCores", cores.map(c => c.key.toString('hex')))
  }

  async readStorageKeys() {
    const loadedInputs = new Set<string>()
    await this._readStorageKey('inputs', loadedInputs)
    await this._addKeys(loadedInputs)
  }

  async updateStorageKeys() {
    await this._updateStorageKey('inputs', new Set(this.allInputs()))
  }

  _getStorage (file: string) {
    return this.storage('thread-rep/' + this.uid + '/' + file)
  }

  _readStorageKey (file: string, output: Set<string>) {
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

  async _updateStorageKey (file: string, input: Set<string>) {
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