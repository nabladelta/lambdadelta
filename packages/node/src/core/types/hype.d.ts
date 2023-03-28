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
    batch: number[],
    operations: number
}
interface InputNode {
    header: { protocol: '@autobase/input/v1' },
    _id: string, // Hypercore ID
    seq: number, // Block ID?
    change: Buffer,
    clock: Map<string, number>, // Hypercore => number
    key: Buffer,
    value: Buffer,
}

interface BlobID {
    byteOffset: number,
    blockOffset: number,
    blockLength: number,
    byteLength: number
}
interface GeneralTrack {
    '@type': 'General',
   VideoCount: string,
   AudioCount: string,
   Format: 'MPEG-4' | 'WebM',
   Format_Profile: string,
   CodecID: string,
   CodecID_Compatible: string,
   FileSize: string,
   Duration: string,
   OverallBitRate: string,
   FrameRate: string,
   FrameCount: string,
   StreamSize: string,
   HeaderSize: string,
   DataSize: string,
   FooterSize: string,
   IsStreamable: 'Yes' | 'No',
   Encoded_Application: string
}

interface VideoTrack {
    '@type': 'Video',
    StreamOrder: string,
    ID: string,
    Format: string,
    Format_Profile: string,
    Format_Level: string,
    Format_Settings_CABAC: string,
    Format_Settings_RefFrames: string,
    CodecID: string,
    Duration: string,
    BitRate: string,
    Width: string,
    Height: string,
    Sampled_Width: string,
    Sampled_Height: string,
    PixelAspectRatio: string,
    DisplayAspectRatio: string,
    Rotation: string,
    FrameRate_Mode: string,
    FrameRate: string,
    FrameCount: string,
    Standard: string,
    ColorSpace: string,
    ChromaSubsampling: string,
    BitDepth: string,
    ScanType: string,
    StreamSize: string,
    Title: string,
    Language: string,
    Encoded_Date: string,
    Tagged_Date: string,
}

interface AudioTrack {
    '@type': 'Audio',
    StreamOrder: string,
    ID: string,
    Format: string,
    Format_AdditionalFeatures: string,
    CodecID: string,
    Duration: string,
    Duration_FirstFrame: string,
    BitRate_Mode: string,
    BitRate: string,
    Channels: string,
    ChannelPositions: string,
    ChannelLayout: string,
    SamplesPerFrame: string,
    SamplingRate: string,
    SamplingCount: string,
    FrameRate: string,
    FrameCount: string,
    Compression_Mode: string,
    StreamSize: string,
    StreamSize_Proportion: string,
    Title: string,
    Language: string,
    Encoded_Date: string,
    Tagged_Date: string
}

type Track = (GeneralTrack | VideoTrack | AudioTrack)
