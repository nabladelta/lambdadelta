import b4a from 'b4a'
import Hypercore from 'hypercore'
import { difference, getThreadEpoch, getTimestampInSeconds, keySetFormat } from './utils/utils'
import { TypedEmitter } from 'tiny-typed-emitter'
import { ThreadEvents } from './types/events'
import Autobase from 'autobase'
import { Keystorage } from './keystorage'
import crypto from 'crypto'
import { FILE_FETCH_TIMEOUT_MS, FUTURE_TOLERANCE_SECONDS } from '../constants'
import { Readable } from 'streamx'
import { mainLogger } from './logger'

const log = mainLogger.getSubLogger({name: 'thread'})

export class Thread extends TypedEmitter<ThreadEvents> {
  public tid: string
  private opCore: any
  private get: any
  private keystore: Keystorage
  private _ready: Promise<void | void[]>
  private stream: Readable | undefined
  public localInput: string
  public base: any

  public creationTime: number | undefined // Epoch in seconds
  public op: IPost | undefined

  private constructor(tid: string, corestore: any, autobase: any, written?: boolean) {
    super()
    this.tid = tid
    this.get = corestore.get.bind(corestore)
    this.keystore = new Keystorage(Hypercore.defaultStorage(corestore.storage), 'thread/' + this.tid + '/')
    this.base = autobase

    this.opCore = corestore.get(b4a.from(tid, 'hex'))

    this.localInput = this.base.localInput.key.toString('hex')

    // Load storage
    this._ready = (async () => {
        await this.opCore.ready()
        await this.readStorageKeys()
        try {
          this.op = await this.getOp(1000)
        } catch(e) {
          throw new Error(`Failed to fetch OP in 1000ms for ${tid}`)
        }
        // Timestamp is not in the future, 60 second tolerance
        if (this.op?.time && this.op.time < (getTimestampInSeconds() + FUTURE_TOLERANCE_SECONDS)) {
          this.creationTime = this.op.time
          return
        }
        throw new Error(`Malformed thread ${tid} (time)`)
    })()
  }

  public static async create(corestore: any, getOp: ((tid: string) => Promise<IPost|false>)) {
    const opcore = corestore.namespace('op').get({ name: `${getThreadEpoch()}`})
    await opcore.ready()
    if (opcore.length != 0) return false
    const tid = opcore.key.toString('hex')

    const op = await getOp(tid)
    if (!op) return false
    await opcore.append(Thread.serialize(op))
    
    return Thread.load(tid, corestore)
  }

  public static async load(tid: string, corestore: any) {
    const inputCore = corestore.namespace('reply').get({name: tid})
    await inputCore.ready()

    const outputCore = corestore.namespace('output').get({name: tid})
    await outputCore.ready()

    const base = new Autobase({
      inputs: [inputCore],
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
    await this.opCore.close()
    for (let core of this.base.inputs) {
      await core.close()
    }
    for (let core of this.base.outputs) {
      await core.close()
    }
  }

  public async getOp(timeout?: number) {
    timeout = timeout || FILE_FETCH_TIMEOUT_MS
    const op: IPost = Thread.deserialize(await this.opCore.get(0, {timeout}))
    op.id = this.tid
    op.no = op.id.slice(0, 16)
    return op
  }

  public static processNode(node: OutputNode) {
    const post: IPost = Thread.deserialize(node.value)
    post.id = node.id + '-' + node.seq.toString(16)
    post.no = crypto.createHash('sha256').update(post.id).digest('hex').slice(0, 16)
    return post
  }

  public async start() {
    const self = this
    await this.base.start({
        async apply(view: any, batch: OutputNode[], clock: any, change: any) {
          if (view.length == 0) {
            await view.append([Thread.serialize(await self.getOp())])
          }
          log.debug(`New batch for ${self.tid.slice(0, 8)} of length ${batch.length}`)
          const pBatch = batch.map((node) => {
            return Thread.serialize(Thread.processNode(node))
          })
          await view.append(pBatch)
        }
    })
    await this.base.view.update()

    this.stream = this.base.createReadStream({
      live: true,
      tail: true,
      map: (node: InputNode) => node,
      wait: true,
      // onresolve: async (node: InputNode) => {
      //   console.log(`${self.tid.slice(0,8)} found new core at ${node._id.slice(-8)}`)
      // },
      onwait: async (node: InputNode) => undefined
    })

    this.stream?.on('data', (node: InputNode) => {
      this.emit('receivedPost', self.tid, Thread.processNode({id: node._id, batch:[], operations: 0, ...node}))
    })
  }

  private static serialize(obj: any) {
    return Buffer.from(JSON.stringify(obj), 'utf-8')
  }

  private static deserialize(buf: Buffer) {
    return JSON.parse(buf.toString())
  }


  public allInputs() {
    // Ensure thread ID is first
    return [this.tid].concat(this.base.inputs
    .map((core: any) => core.key.toString('hex'))
    .filter((k: string) => 
      // Thread ID already added at the start
      k != this.tid 
      && 
      // Do not return (and gossip) localinput until we write to it
      (this.base.localInput.length > 0 || (k != this.localInput) )))
  }

  public async getUpdatedView() {
    const view = this.base.view

    const timeout = setTimeout(() => {
      log.error(`View update for ${this.tid.slice(0,8)} started 5000ms ago`)
      },
      5000)

    await view.ready()
    await view.update()
    clearTimeout(timeout)
    
    return view
  }

  public async newMessage(post: IPost) {
    await this.getUpdatedView()
    await this.base.append(Thread.serialize(post))

    if (this.base.localInput.length == 1) {
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
    const allKeys = new Set(this.allInputs()).add(this.localInput) // Make sure we never think localInput is new (loop-race condition)
    const newKeys = difference(allowedKeys, allKeys)
    if (newKeys.size == 0) return false
    log.debug(`Adding ${newKeys.size} new cores to ${this.tid}`)
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
    await this.keystore._readStorageKey('inputs', loadedInputs)
    await this._addKeys(loadedInputs)
  }

  private async updateStorageKeys() {
    await this.keystore._updateStorageKey('inputs', new Set(this.allInputs()))
  }
}