declare module 'corestore'
declare module 'hypercore'
declare module 'autobase'
declare module 'protomux'
declare module 'compact-encoding'
declare module 'hyperblobs'

interface OutputNode {
    header: { protocol: '@autobase/input/v1' },
    id: string, // Hypercore ID
    seq: number, // Block ID?
    change: Buffer,
    clock: Map<string, number>, // Hypercore => number
    value: Buffer,
    batch: number[]
}

interface BlobID {
    byteOffset: number,
    blockOffset: number,
    blockLength: number,
    byteLength: number
}