import b4a from 'b4a'
import Hypercore from 'hypercore'
import { difference, getThreadEpoch } from './utils/utils'
import { TypedEmitter } from 'tiny-typed-emitter'
import { ThreadEvents } from './events'
import Autobase from 'autobase'

export class Thread extends TypedEmitter<ThreadEvents> {
  public tid: string
  public base: any

  // Whether we have posted to this thread, determines if we gossip our localInput core
  private written: boolean

  private get: any
  private storage: any
  private _ready: Promise<void | void[]>
  public localInput: string

  constructor(tid: string, corestore: any, autobase: any, written?: boolean) {
    super()
    this.tid = tid
    this.get = corestore.get.bind(corestore)
    this.storage = Hypercore.defaultStorage(corestore.storage)
    this.base = autobase

    this.written = !!written
    this.localInput = this.base.localInput.key.toString('hex')

    // Load storage
    this._ready = (async () => {
        await this.readStorageKeys()
    })()
  }

  public static async create(corestore: any) {
    const opcore = corestore.namespace('op').get({ name: `${getThreadEpoch()}`})
    await opcore.ready()
    const tid = opcore.key.toString('hex')

    const outputCore = corestore.namespace('output').get({name: tid})
    await outputCore.ready()

    const base = new Autobase({
          inputs: [opcore],
          localInput: opcore,
          localOutput: outputCore
    })
    
    // Newly created thread is always "written" because we will write the OP
    const thread = new Thread(tid, corestore, base, true)
    await thread.ready()
    return thread
  }

  public static async load(tid: string, corestore: any) {
    const opcore = corestore.get(b4a.from(tid, 'hex'))
    await opcore.ready()
    const inputCore = corestore.namespace('reply').get({name: tid})
    await inputCore.ready()

    const outputCore = corestore.namespace('output').get({name: tid})
    await outputCore.ready()

    const base = new Autobase({
      inputs: [opcore, inputCore],
      localInput: inputCore,
      localOutput: outputCore
    })

    // If inputcore is already written to, set thread to already written
    const thread = new Thread(tid, corestore, base, inputCore.length > 0)
    await thread.ready()
    return thread
  }

  public ready() {
    return this._ready
  }

  public async destroy() {
    for (let core of this.base.inputs) {
      await core.close()
    }
    for (let core of this.base.outputs) {
      await core.close()
    }
  }

  public async start() {
    await this.base.start({
        async apply(batch: OutputNode[], clocks: any, change: any, view: any) {
          const pBatch = batch.map((node) => {
            const post: IPost = JSON.parse(node.value.toString())
            post.no = node.id + '>' + node.seq
            return Buffer.from(JSON.stringify(post), 'utf-8')
          })
          await view.append(pBatch)
        }
    })
    await this.base.view.update()
  }

  public allInputs() {
    // Ensure thread ID is first
    return [this.tid].concat(this.base.inputs
    .map((core: any) => core.key.toString('hex'))
    .filter((k: string) => 
      // Thread ID already added at the start
      k != this.tid 
      && 
      // Do not return (and gossip) localinput if the thread has not been written to by us
      (this.written || (k != this.localInput) )))
  }

  public async getUpdatedView() {
    const view = this.base.view
    await view.ready()
    await view.update()
    return view
  }

  public async newMessage(post: IPost) {
    await this.getUpdatedView()
    this.base.append(JSON.stringify(post))

    if (!this.written) {
      this.written = true
      return true // Is the first message we posted
    }
    return false
  }

  private async allow(msg: string) {
    return true
  }

  public async recv(msgs: string[]) {
    this.emit('receivedCores', msgs)

    const allowedKeys = msgs.filter((msg: string) => this.allow(msg))

    if (allowedKeys.length == 0) return false
    // Check if any are new
    const allKeys = new Set(this.allInputs())
    const newKeys = difference(allowedKeys, allKeys)
    if (newKeys.size == 0) return false

    await this._addKeys(newKeys)
    await this.updateStorageKeys()
    return this.allInputs()
  }

  private async _addKeys(keys: string[] | Set<string>) {
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

  private async readStorageKeys() {
    const loadedInputs = new Set<string>()
    await this._readStorageKey('inputs', loadedInputs)
    await this._addKeys(loadedInputs)
  }

  private async updateStorageKeys() {
    await this._updateStorageKey('inputs', new Set(this.allInputs()))
  }

  private _getStorage (file: string) {
    return this.storage('thread-rep/' + this.tid + '/' + file)
  }

  private _readStorageKey (file: string, output: Set<string>) {
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

  private async _updateStorageKey (file: string, input: Set<string>) {
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