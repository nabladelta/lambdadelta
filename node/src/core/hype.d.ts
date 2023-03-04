declare module '@hyperswarm/dht'
declare module 'hyperswarm'
declare module 'corestore'
declare module 'hypercore'
declare module 'autobase'
declare module 'random-access-memory'
declare module 'protomux'
declare module 'compact-encoding'
declare module 'b4a'
declare module 'cors'

interface OutputNode {
    header: { protocol: '@autobase/input/v1' },
    id: string, // Hypercore ID
    seq: number, // Block ID?
    change: Buffer,
    clock: Map<string, number>, // Hypercore => number
    value: Buffer,
    batch: number[]
}