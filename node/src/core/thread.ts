import Protomux from 'protomux'
import c from 'compact-encoding'
import b4a from 'b4a'
import Hypercore from 'hypercore'

export function difference (setA: Set<any>, setB: Set<any>) {
  const _difference = new Set(setA)
  for (const elem of setB) {
    _difference.delete(elem)
  }
  return _difference
}
export class Thread {
  uid: string
  base: any
  allow: any
  get: any
  storage: any
  _inputKeys: any
  _outputKeys: any
  _streams: any
  _ready: any

  constructor (uid: string, base: any, allow: any, get: any, storage: any) {
    this.uid = uid
    this.base = base
    this.allow = allow
    this.get = get
    this.storage = Hypercore.defaultStorage(storage)

    this._inputKeys = new Set()
    this._outputKeys = new Set()
    this._streams = []

    // Load storage
    this._ready = Promise.resolve().then(() => {
      const coresToLoad = []

      // Load local cores first
      if (this.base.localInput) {
        coresToLoad.push(this._addKeys([this.base.localInput.key.toString('hex')], 'input'))
      }
      if (this.base.localOutput) {
        coresToLoad.push(this._addKeys([this.base.localOutput.key.toString('hex')], 'output'))
      }

      // Load storage cores
      coresToLoad.push(this.readStorageKeys())

      return Promise.all(coresToLoad)
    })
      .then(() => Promise.all([
        this._addKeys(this._inputKeys, 'input'),
        this._addKeys(this._outputKeys, 'output')
      ]))
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
      async onmessage (msgs: any, session: any) {
        const allowedKeys = msgs.filter((msg: any) => self.allow(msg, 'input', session))
        if (allowedKeys.length) {
          // Check if any are new
          const newKeys = difference(allowedKeys, self._inputKeys)
          if (newKeys.size > 0) {
            await self._addKeys(newKeys, 'input')
            await self.updateStorageKeys()
          }
        }
      }
    })

    const outputAnnouncer = channel.addMessage({
      encoding: c.array(c.string),
      async onmessage (msgs: any, session: any) {
        const allowedKeys = msgs.filter((msg: any) => self.allow(msg, 'output', session))
        if (allowedKeys.length) {
          // Check if any are new
          const newKeys = difference(allowedKeys, self._outputKeys)
          if (newKeys.size > 0) {
            await self._addKeys(newKeys, 'output')
            await self.updateStorageKeys()
          }
        }
      }
    })

    const streamRecord = { stream, inputAnnouncer, outputAnnouncer }
    this._streams.push(streamRecord)
    stream.once('close', () => {
      this._streams.splice(this._streams.indexOf(streamRecord), 1)
    })

    if (this.base.localInput || this.base.inputs || this.base.outputs || this.base.localOutput) this.announce(streamRecord)
  }

  async announce (stream: any) {
    await this.ready()

    const keys = this.base.inputs.map((core: any) => core.key.toString('hex'))
    if (keys.length) {
      // console.log('[' + this.base.localOutput.key.toString('hex').slice(-6) +
      //       '] announce keys', keys.map((key) => key.slice(-6)))
      stream.inputAnnouncer.send(keys)
    }

    const outputKeys = this.base.outputs.map((core: any) => core.key.toString('hex'))
    if (outputKeys.length) {
      // console.log('[' + this.base.localOutput.key.toString('hex').slice(-6) +
      //       '] announce outputKeys', outputKeys.map((key) => key.slice(-6)))
      stream.outputAnnouncer.send(outputKeys)
    }
  }

  async announceAll () {
    for (const stream of this._streams) {
      await this.announce(stream)
    }
  }

  async _addKeys (keys: any, destination: any) {
    // Get & Ready Cores
    const cores = await Promise.all(Array.from(keys).map(async (key) => {
      const core = this.get(b4a.from(key as any, 'hex'))
      // Necessary for autobase id (aka the core's id) setup
      await core.ready()
      return core
    }))

    // Add to the corresponding place in autobase
    for (const core of cores) {
      if (destination === 'output') {
        this._outputKeys.add(core.key.toString('hex'))

        // Skip local output lest we get a 'Batch is out-of-date' error
        if (this.base.localOutput.key === core.key) {
          console.log('found local output, continuing')
          continue
        }

        // Update output to ensure up to date before adding
        // Get a 'Batch is out-of-date.' error otherwise
        if (this.base.started) await this.base.view.update()

        await this.base.addOutput(core)
      } else {
        if (core.fork != 0) {
          console.log("Forked Core")
        }
        this._inputKeys.add(core.key.toString('hex'))
        await this.base.addInput(core)
      }
    }
  }

  _getStorage (file: any) {
    const MANAGER_DIR = 'thread-rep/' + this.uid + "/"
    return this.storage(MANAGER_DIR + file)
  }

  readStorageKeys () {
    return Promise.all([
      this._readStorageKey('inputs', this._inputKeys),
      this._readStorageKey('outputs', this._outputKeys)
    ])
  }

  _readStorageKey (file: any, output: any) {
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
            store.read(start, 32, function (err: any, buf: any) {
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

  async updateStorageKeys () {
    await this._updateStorageKey('inputs', this._inputKeys)
    await this._updateStorageKey('outputs', this._outputKeys)
    await this.announceAll()
  }

  async _updateStorageKey (file: any, input: any) {
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