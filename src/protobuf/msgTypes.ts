// @generated by protobuf-ts 2.9.1
// @generated from protobuf file "msgTypes.proto" (syntax proto3)
// tslint:disable
import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import { WireType } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import { UnknownFieldHandler } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import { reflectionMergePartial } from "@protobuf-ts/runtime";
import { MESSAGE_TYPE } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * @generated from protobuf message PiB
 */
export interface PiB {
    /**
     * @generated from protobuf field: repeated string pi_b = 1;
     */
    piB: string[];
}
/**
 * @generated from protobuf message Proof
 */
export interface Proof {
    /**
     * @generated from protobuf field: repeated string pi_a = 1;
     */
    piA: string[];
    /**
     * @generated from protobuf field: repeated PiB pi_b = 2;
     */
    piB: PiB[];
    /**
     * @generated from protobuf field: repeated string pi_c = 3;
     */
    piC: string[];
    /**
     * @generated from protobuf field: string protocol = 4;
     */
    protocol: string;
    /**
     * @generated from protobuf field: string curve = 5;
     */
    curve: string;
}
/**
 * @generated from protobuf message nullifierOutput
 */
export interface nullifierOutput {
    /**
     * @generated from protobuf field: string nullifier = 1;
     */
    nullifier: string;
    /**
     * @generated from protobuf field: double messageLimit = 2;
     */
    messageLimit: number;
}
/**
 * @generated from protobuf message RLNGPublicSignals
 */
export interface RLNGPublicSignals {
    /**
     * @generated from protobuf field: repeated string y = 1;
     */
    y: string[];
    /**
     * @generated from protobuf field: string merkleRoot = 2;
     */
    merkleRoot: string;
    /**
     * @generated from protobuf field: repeated string nullifiers = 3;
     */
    nullifiers: string[];
    /**
     * @generated from protobuf field: string signalHash = 4;
     */
    signalHash: string;
    /**
     * @generated from protobuf field: repeated string externalNullifiers = 5;
     */
    externalNullifiers: string[];
    /**
     * @generated from protobuf field: repeated string messageLimits = 6;
     */
    messageLimits: string[];
}
/**
 * @generated from protobuf message RLNGSNARKProof
 */
export interface RLNGSNARKProof {
    /**
     * @generated from protobuf field: Proof proof = 1;
     */
    proof?: Proof;
    /**
     * @generated from protobuf field: RLNGPublicSignals publicSignals = 2;
     */
    publicSignals?: RLNGPublicSignals;
}
/**
 * @generated from protobuf message RLNGFullProof
 */
export interface RLNGFullProof {
    /**
     * @generated from protobuf field: string signal = 1;
     */
    signal: string;
    /**
     * @generated from protobuf field: string rlnIdentifier = 2;
     */
    rlnIdentifier: string;
    /**
     * @generated from protobuf field: repeated nullifierOutput externalNullifiers = 3;
     */
    externalNullifiers: nullifierOutput[];
    /**
     * @generated from protobuf field: RLNGSNARKProof snarkProof = 4;
     */
    snarkProof?: RLNGSNARKProof;
}
/**
 * *
 * @typedef FeedEventHeader Our main Event type
 * @property {string} eventType Event type
 * @property {number} claimed Time the event author claims
 * @property {RLNGFullProof} proof RLN proof for this event
 * @property {string} payloadHash Hash of payload
 *
 * @generated from protobuf message FeedEventHeader
 */
export interface FeedEventHeader {
    /**
     * @generated from protobuf field: string eventType = 1;
     */
    eventType: string;
    /**
     * @generated from protobuf field: double claimed = 2;
     */
    claimed: number;
    /**
     * @generated from protobuf field: RLNGFullProof proof = 3;
     */
    proof?: RLNGFullProof;
    /**
     * @generated from protobuf field: string payloadHash = 4;
     */
    payloadHash: string;
}
/**
 * *
 * @typedef LogEntry An entry in our event log hypercore
 * @property {number} oldestIndex Index of the oldest still valid block
 * @property {number} received Timestamp in seconds
 * @property {string} header The event's Header
 *
 * @generated from protobuf message LogEntry
 */
export interface LogEntry {
    /**
     * @generated from protobuf field: double oldestIndex = 1;
     */
    oldestIndex: number;
    /**
     * @generated from protobuf field: double received = 2;
     */
    received: number;
    /**
     * @generated from protobuf field: FeedEventHeader header = 3;
     */
    header?: FeedEventHeader;
}
/**
 * @generated from protobuf message RelayedEvent
 */
export interface RelayedEvent {
    /**
     * @generated from protobuf field: string topic = 1;
     */
    topic: string;
    /**
     * @generated from protobuf field: string eventID = 2;
     */
    eventID: string;
    /**
     * @generated from protobuf field: FeedEventHeader header = 3;
     */
    header?: FeedEventHeader;
    /**
     * @generated from protobuf field: bytes payload = 4;
     */
    payload: Uint8Array;
}
// @generated message type with reflection information, may provide speed optimized methods
class PiB$Type extends MessageType<PiB> {
    constructor() {
        super("PiB", [
            { no: 1, name: "pi_b", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<PiB>): PiB {
        const message = { piB: [] };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<PiB>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: PiB): PiB {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* repeated string pi_b */ 1:
                    message.piB.push(reader.string());
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: PiB, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* repeated string pi_b = 1; */
        for (let i = 0; i < message.piB.length; i++)
            writer.tag(1, WireType.LengthDelimited).string(message.piB[i]);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message PiB
 */
export const PiB = new PiB$Type();
// @generated message type with reflection information, may provide speed optimized methods
class Proof$Type extends MessageType<Proof> {
    constructor() {
        super("Proof", [
            { no: 1, name: "pi_a", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "pi_b", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => PiB },
            { no: 3, name: "pi_c", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "protocol", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "curve", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<Proof>): Proof {
        const message = { piA: [], piB: [], piC: [], protocol: "", curve: "" };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<Proof>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: Proof): Proof {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* repeated string pi_a */ 1:
                    message.piA.push(reader.string());
                    break;
                case /* repeated PiB pi_b */ 2:
                    message.piB.push(PiB.internalBinaryRead(reader, reader.uint32(), options));
                    break;
                case /* repeated string pi_c */ 3:
                    message.piC.push(reader.string());
                    break;
                case /* string protocol */ 4:
                    message.protocol = reader.string();
                    break;
                case /* string curve */ 5:
                    message.curve = reader.string();
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: Proof, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* repeated string pi_a = 1; */
        for (let i = 0; i < message.piA.length; i++)
            writer.tag(1, WireType.LengthDelimited).string(message.piA[i]);
        /* repeated PiB pi_b = 2; */
        for (let i = 0; i < message.piB.length; i++)
            PiB.internalBinaryWrite(message.piB[i], writer.tag(2, WireType.LengthDelimited).fork(), options).join();
        /* repeated string pi_c = 3; */
        for (let i = 0; i < message.piC.length; i++)
            writer.tag(3, WireType.LengthDelimited).string(message.piC[i]);
        /* string protocol = 4; */
        if (message.protocol !== "")
            writer.tag(4, WireType.LengthDelimited).string(message.protocol);
        /* string curve = 5; */
        if (message.curve !== "")
            writer.tag(5, WireType.LengthDelimited).string(message.curve);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message Proof
 */
export const Proof = new Proof$Type();
// @generated message type with reflection information, may provide speed optimized methods
class nullifierOutput$Type extends MessageType<nullifierOutput> {
    constructor() {
        super("nullifierOutput", [
            { no: 1, name: "nullifier", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "messageLimit", kind: "scalar", T: 1 /*ScalarType.DOUBLE*/ }
        ]);
    }
    create(value?: PartialMessage<nullifierOutput>): nullifierOutput {
        const message = { nullifier: "", messageLimit: 0 };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<nullifierOutput>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: nullifierOutput): nullifierOutput {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* string nullifier */ 1:
                    message.nullifier = reader.string();
                    break;
                case /* double messageLimit */ 2:
                    message.messageLimit = reader.double();
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: nullifierOutput, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* string nullifier = 1; */
        if (message.nullifier !== "")
            writer.tag(1, WireType.LengthDelimited).string(message.nullifier);
        /* double messageLimit = 2; */
        if (message.messageLimit !== 0)
            writer.tag(2, WireType.Bit64).double(message.messageLimit);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message nullifierOutput
 */
export const nullifierOutput = new nullifierOutput$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RLNGPublicSignals$Type extends MessageType<RLNGPublicSignals> {
    constructor() {
        super("RLNGPublicSignals", [
            { no: 1, name: "y", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "merkleRoot", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "nullifiers", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
            { no: 4, name: "signalHash", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 5, name: "externalNullifiers", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
            { no: 6, name: "messageLimits", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<RLNGPublicSignals>): RLNGPublicSignals {
        const message = { y: [], merkleRoot: "", nullifiers: [], signalHash: "", externalNullifiers: [], messageLimits: [] };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<RLNGPublicSignals>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: RLNGPublicSignals): RLNGPublicSignals {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* repeated string y */ 1:
                    message.y.push(reader.string());
                    break;
                case /* string merkleRoot */ 2:
                    message.merkleRoot = reader.string();
                    break;
                case /* repeated string nullifiers */ 3:
                    message.nullifiers.push(reader.string());
                    break;
                case /* string signalHash */ 4:
                    message.signalHash = reader.string();
                    break;
                case /* repeated string externalNullifiers */ 5:
                    message.externalNullifiers.push(reader.string());
                    break;
                case /* repeated string messageLimits */ 6:
                    message.messageLimits.push(reader.string());
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: RLNGPublicSignals, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* repeated string y = 1; */
        for (let i = 0; i < message.y.length; i++)
            writer.tag(1, WireType.LengthDelimited).string(message.y[i]);
        /* string merkleRoot = 2; */
        if (message.merkleRoot !== "")
            writer.tag(2, WireType.LengthDelimited).string(message.merkleRoot);
        /* repeated string nullifiers = 3; */
        for (let i = 0; i < message.nullifiers.length; i++)
            writer.tag(3, WireType.LengthDelimited).string(message.nullifiers[i]);
        /* string signalHash = 4; */
        if (message.signalHash !== "")
            writer.tag(4, WireType.LengthDelimited).string(message.signalHash);
        /* repeated string externalNullifiers = 5; */
        for (let i = 0; i < message.externalNullifiers.length; i++)
            writer.tag(5, WireType.LengthDelimited).string(message.externalNullifiers[i]);
        /* repeated string messageLimits = 6; */
        for (let i = 0; i < message.messageLimits.length; i++)
            writer.tag(6, WireType.LengthDelimited).string(message.messageLimits[i]);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message RLNGPublicSignals
 */
export const RLNGPublicSignals = new RLNGPublicSignals$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RLNGSNARKProof$Type extends MessageType<RLNGSNARKProof> {
    constructor() {
        super("RLNGSNARKProof", [
            { no: 1, name: "proof", kind: "message", T: () => Proof },
            { no: 2, name: "publicSignals", kind: "message", T: () => RLNGPublicSignals }
        ]);
    }
    create(value?: PartialMessage<RLNGSNARKProof>): RLNGSNARKProof {
        const message = {};
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<RLNGSNARKProof>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: RLNGSNARKProof): RLNGSNARKProof {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* Proof proof */ 1:
                    message.proof = Proof.internalBinaryRead(reader, reader.uint32(), options, message.proof);
                    break;
                case /* RLNGPublicSignals publicSignals */ 2:
                    message.publicSignals = RLNGPublicSignals.internalBinaryRead(reader, reader.uint32(), options, message.publicSignals);
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: RLNGSNARKProof, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* Proof proof = 1; */
        if (message.proof)
            Proof.internalBinaryWrite(message.proof, writer.tag(1, WireType.LengthDelimited).fork(), options).join();
        /* RLNGPublicSignals publicSignals = 2; */
        if (message.publicSignals)
            RLNGPublicSignals.internalBinaryWrite(message.publicSignals, writer.tag(2, WireType.LengthDelimited).fork(), options).join();
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message RLNGSNARKProof
 */
export const RLNGSNARKProof = new RLNGSNARKProof$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RLNGFullProof$Type extends MessageType<RLNGFullProof> {
    constructor() {
        super("RLNGFullProof", [
            { no: 1, name: "signal", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "rlnIdentifier", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "externalNullifiers", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => nullifierOutput },
            { no: 4, name: "snarkProof", kind: "message", T: () => RLNGSNARKProof }
        ]);
    }
    create(value?: PartialMessage<RLNGFullProof>): RLNGFullProof {
        const message = { signal: "", rlnIdentifier: "", externalNullifiers: [] };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<RLNGFullProof>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: RLNGFullProof): RLNGFullProof {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* string signal */ 1:
                    message.signal = reader.string();
                    break;
                case /* string rlnIdentifier */ 2:
                    message.rlnIdentifier = reader.string();
                    break;
                case /* repeated nullifierOutput externalNullifiers */ 3:
                    message.externalNullifiers.push(nullifierOutput.internalBinaryRead(reader, reader.uint32(), options));
                    break;
                case /* RLNGSNARKProof snarkProof */ 4:
                    message.snarkProof = RLNGSNARKProof.internalBinaryRead(reader, reader.uint32(), options, message.snarkProof);
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: RLNGFullProof, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* string signal = 1; */
        if (message.signal !== "")
            writer.tag(1, WireType.LengthDelimited).string(message.signal);
        /* string rlnIdentifier = 2; */
        if (message.rlnIdentifier !== "")
            writer.tag(2, WireType.LengthDelimited).string(message.rlnIdentifier);
        /* repeated nullifierOutput externalNullifiers = 3; */
        for (let i = 0; i < message.externalNullifiers.length; i++)
            nullifierOutput.internalBinaryWrite(message.externalNullifiers[i], writer.tag(3, WireType.LengthDelimited).fork(), options).join();
        /* RLNGSNARKProof snarkProof = 4; */
        if (message.snarkProof)
            RLNGSNARKProof.internalBinaryWrite(message.snarkProof, writer.tag(4, WireType.LengthDelimited).fork(), options).join();
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message RLNGFullProof
 */
export const RLNGFullProof = new RLNGFullProof$Type();
// @generated message type with reflection information, may provide speed optimized methods
class FeedEventHeader$Type extends MessageType<FeedEventHeader> {
    constructor() {
        super("FeedEventHeader", [
            { no: 1, name: "eventType", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "claimed", kind: "scalar", T: 1 /*ScalarType.DOUBLE*/ },
            { no: 3, name: "proof", kind: "message", T: () => RLNGFullProof },
            { no: 4, name: "payloadHash", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
        ]);
    }
    create(value?: PartialMessage<FeedEventHeader>): FeedEventHeader {
        const message = { eventType: "", claimed: 0, payloadHash: "" };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<FeedEventHeader>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: FeedEventHeader): FeedEventHeader {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* string eventType */ 1:
                    message.eventType = reader.string();
                    break;
                case /* double claimed */ 2:
                    message.claimed = reader.double();
                    break;
                case /* RLNGFullProof proof */ 3:
                    message.proof = RLNGFullProof.internalBinaryRead(reader, reader.uint32(), options, message.proof);
                    break;
                case /* string payloadHash */ 4:
                    message.payloadHash = reader.string();
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: FeedEventHeader, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* string eventType = 1; */
        if (message.eventType !== "")
            writer.tag(1, WireType.LengthDelimited).string(message.eventType);
        /* double claimed = 2; */
        if (message.claimed !== 0)
            writer.tag(2, WireType.Bit64).double(message.claimed);
        /* RLNGFullProof proof = 3; */
        if (message.proof)
            RLNGFullProof.internalBinaryWrite(message.proof, writer.tag(3, WireType.LengthDelimited).fork(), options).join();
        /* string payloadHash = 4; */
        if (message.payloadHash !== "")
            writer.tag(4, WireType.LengthDelimited).string(message.payloadHash);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message FeedEventHeader
 */
export const FeedEventHeader = new FeedEventHeader$Type();
// @generated message type with reflection information, may provide speed optimized methods
class LogEntry$Type extends MessageType<LogEntry> {
    constructor() {
        super("LogEntry", [
            { no: 1, name: "oldestIndex", kind: "scalar", T: 1 /*ScalarType.DOUBLE*/ },
            { no: 2, name: "received", kind: "scalar", T: 1 /*ScalarType.DOUBLE*/ },
            { no: 3, name: "header", kind: "message", T: () => FeedEventHeader }
        ]);
    }
    create(value?: PartialMessage<LogEntry>): LogEntry {
        const message = { oldestIndex: 0, received: 0 };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<LogEntry>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: LogEntry): LogEntry {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* double oldestIndex */ 1:
                    message.oldestIndex = reader.double();
                    break;
                case /* double received */ 2:
                    message.received = reader.double();
                    break;
                case /* FeedEventHeader header */ 3:
                    message.header = FeedEventHeader.internalBinaryRead(reader, reader.uint32(), options, message.header);
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: LogEntry, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* double oldestIndex = 1; */
        if (message.oldestIndex !== 0)
            writer.tag(1, WireType.Bit64).double(message.oldestIndex);
        /* double received = 2; */
        if (message.received !== 0)
            writer.tag(2, WireType.Bit64).double(message.received);
        /* FeedEventHeader header = 3; */
        if (message.header)
            FeedEventHeader.internalBinaryWrite(message.header, writer.tag(3, WireType.LengthDelimited).fork(), options).join();
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message LogEntry
 */
export const LogEntry = new LogEntry$Type();
// @generated message type with reflection information, may provide speed optimized methods
class RelayedEvent$Type extends MessageType<RelayedEvent> {
    constructor() {
        super("RelayedEvent", [
            { no: 1, name: "topic", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 2, name: "eventID", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
            { no: 3, name: "header", kind: "message", T: () => FeedEventHeader },
            { no: 4, name: "payload", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
        ]);
    }
    create(value?: PartialMessage<RelayedEvent>): RelayedEvent {
        const message = { topic: "", eventID: "", payload: new Uint8Array(0) };
        globalThis.Object.defineProperty(message, MESSAGE_TYPE, { enumerable: false, value: this });
        if (value !== undefined)
            reflectionMergePartial<RelayedEvent>(this, message, value);
        return message;
    }
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: RelayedEvent): RelayedEvent {
        let message = target ?? this.create(), end = reader.pos + length;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case /* string topic */ 1:
                    message.topic = reader.string();
                    break;
                case /* string eventID */ 2:
                    message.eventID = reader.string();
                    break;
                case /* FeedEventHeader header */ 3:
                    message.header = FeedEventHeader.internalBinaryRead(reader, reader.uint32(), options, message.header);
                    break;
                case /* bytes payload */ 4:
                    message.payload = reader.bytes();
                    break;
                default:
                    let u = options.readUnknownField;
                    if (u === "throw")
                        throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
            }
        }
        return message;
    }
    internalBinaryWrite(message: RelayedEvent, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter {
        /* string topic = 1; */
        if (message.topic !== "")
            writer.tag(1, WireType.LengthDelimited).string(message.topic);
        /* string eventID = 2; */
        if (message.eventID !== "")
            writer.tag(2, WireType.LengthDelimited).string(message.eventID);
        /* FeedEventHeader header = 3; */
        if (message.header)
            FeedEventHeader.internalBinaryWrite(message.header, writer.tag(3, WireType.LengthDelimited).fork(), options).join();
        /* bytes payload = 4; */
        if (message.payload.length)
            writer.tag(4, WireType.LengthDelimited).bytes(message.payload);
        let u = options.writeUnknownFields;
        if (u !== false)
            (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
        return writer;
    }
}
/**
 * @generated MessageType for protobuf message RelayedEvent
 */
export const RelayedEvent = new RelayedEvent$Type();