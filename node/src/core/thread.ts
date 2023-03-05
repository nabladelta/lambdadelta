import Protomux from 'protomux'
import c from 'compact-encoding'
import b4a from 'b4a'
import Hypercore from 'hypercore'

export function difference (setA: Set<any> | string[], setB: Set<any>) {
  const _difference = new Set(setA)
  for (const elem of setB) {
    _difference.delete(elem)
  }
  return _difference
}
export class Thread {
  uid: string
  base: any
  get: any
  storage: any
  _inputKeys: Set<string>
  _streams: Set<{stream: any, inputAnnouncer: any}>
  _ready: Promise<void | void[]>

  constructor (uid: string, base: any, get: any, storage: any) {
    this.uid = uid
    this.base = base
    this.get = get
    this.storage = Hypercore.defaultStorage(storage)

    this._inputKeys = new Set()
    this._streams = new Set()

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

  ready () {
    return this._ready
  }

  attachStream (stream: any) {
    const self = this

    const mux = Protomux.from(stream)

    const channel = mux.createChannel({
      protocol: 'thread-rep',
      id: Buffer.from(this.uid),
      unique: false
    })
    channel.open()

    const inputAnnouncer = channel.addMessage({
      encoding: c.array(c.string),
      async onmessage (msgs: string[], session: any) {
        const allowedKeys = msgs.filter((msg: string) => self.allow(msg, session))
        console.log("session", session)
        if (allowedKeys.length) {
          // Check if any are new
          const newKeys = difference(allowedKeys, self._inputKeys)
          if (newKeys.size > 0) {
            await self._addKeys(newKeys)
            await self.updateStorageKeys()
          }
        }
      }
    })

    const streamRecord = { stream, inputAnnouncer }
    this._streams.add(streamRecord)
    stream.once('close', () => {
      this._streams.delete(streamRecord)
    })

    if (this.base.localInput || this.base.inputs) this.announce(streamRecord)
  }

  async allow(msg: string, session: any) {
    return true
  }

  async announce(stream: { stream: any, inputAnnouncer: any}) {
    await this.ready()

    const keys = this.base.inputs.map((core: any) => core.key.toString('hex'))
    if (keys.length) {
      stream.inputAnnouncer.send(keys)
    }
  }

  async announceAll() {
    for (const stream of this._streams) {
      await this.announce(stream)
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
      if (core.fork != 0) {
        console.log("Forked Core")
      }
      this._inputKeys.add(core.key.toString('hex'))
      await this.base.addInput(core)
    }
  }

  async readStorageKeys() {
    await this._readStorageKey('inputs', this._inputKeys)
    await this._addKeys(this._inputKeys)
  }

  async updateStorageKeys() {
    await this._updateStorageKey('inputs', this._inputKeys)
    await this.announceAll()
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