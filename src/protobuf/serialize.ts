
import { FeedEventHeader, RLNGFullProof, Proof, PeerMessage, StoredEvent } from './msgTypes.js'
import { Proof as IProof, RLNGFullProof as IRLNGFullProof } from '@nabladelta/rln'
import { FeedEventHeader as IFeedEventHeader } from '../verifyEventHeader.js'
import { PeerMessage as IPeerMessage } from '../sync.js'
import { StoredEvent as IStoredEvent } from '../utils.js'
import { PeerMembershipRenewal as IPeerMembershipRenewal, PeerEvent } from '../sync.js'

export function convertIProofToProof(proof: IProof): Proof {
    return Proof.create({
        protocol: proof.protocol,
        curve: proof.curve,
        piA: proof.pi_a,
        piB: proof.pi_b.map((el) => ({piB: el})),
        piC: proof.pi_c,
    })
}

export function convertProofToIProof(proof: Proof): IProof {
    return {
        protocol: proof.protocol,
        curve: proof.curve,
        pi_a: proof.piA,
        pi_b: proof.piB.map((el) => el.piB),
        pi_c: proof.piC,
    }
}

export function convertFullProofToIFullProof(fullProof: RLNGFullProof): IRLNGFullProof | false {
    // Discard unknown fields
    fullProof = RLNGFullProof.clone(fullProof)
    if (!fullProof.snarkProof) return false
    if (!fullProof.snarkProof.proof) return false
    if (!fullProof.snarkProof.publicSignals) return false
    const proof = convertProofToIProof(fullProof.snarkProof.proof)
    return {
        ...fullProof,
        snarkProof: {
            publicSignals: fullProof.snarkProof.publicSignals,
            proof,
        }
    }
}

export function convertIFullProofToFullProof(fullProof: IRLNGFullProof): RLNGFullProof {
    return RLNGFullProof.create({
        ...fullProof,
        snarkProof: {
            ...fullProof.snarkProof,
            proof: convertIProofToProof(fullProof.snarkProof.proof)
        }
    })
}

export function convertIPeerMessageToPeerMessage(message: IPeerMessage): PeerMessage {
    if (message.type === 'membership') {
        return PeerMessage.create({
            type: message.type,
            membershipProof: convertIFullProofToFullProof(message.membershipProof)
        })
    }
    return PeerMessage.create({
        ...message,
        membershipProof: convertIFullProofToFullProof(message.membershipProof),
        eventProof: convertIFullProofToFullProof(message.eventProof)
    })
}

export function convertPeerMessageToIPeerMessage(message: PeerMessage): IPeerMessage | false {
    if (!message.membershipProof) return false
    const membershipProof = convertFullProofToIFullProof(message.membershipProof)
    if (!membershipProof) return false
    if (message.type === 'membership') {
        return {
            type: message.type,
            membershipProof
        }
    }
    const msgType = message.type
    if (msgType !== 'event') {
        return false
    }
    if (!message.eventProof) return false
    const eventProof = convertFullProofToIFullProof(message.eventProof)
    if (!eventProof) return false
    if (!message.header) return false
    return {
        type: 'event',
        membershipProof,
        eventProof,
        header: message.header,
        received: message.received,
        topic: message.topic,
    }
}

export function convertStoredEventToIStoredEvent(event: StoredEvent): IStoredEvent | false {
    if (!event.header) return false
    if (!event.proof) return false
    const proof = convertFullProofToIFullProof(event.proof)
    if (!proof) return false
    return {
        header: event.header,
        proof
    }
}

export function convertIStoredEventToStoredEvent(event: IStoredEvent): StoredEvent {
    const proof = convertIFullProofToFullProof(event.proof)
    return StoredEvent.create({
        header: event.header,
        proof
    })
}

export function serializeStoredEvent(event: IStoredEvent): Uint8Array {
    return StoredEvent.toBinary(convertIStoredEventToStoredEvent(event))
}

export function deserializeStoredEvent(eventBuf: Uint8Array): IStoredEvent | false {
    return convertStoredEventToIStoredEvent(StoredEvent.fromBinary(eventBuf))
}

export function serializePeerMessage(message: IPeerMessage): Uint8Array {
    return PeerMessage.toBinary(convertIPeerMessageToPeerMessage(message))
}

export function deserializePeerMessage(messageBuf: Uint8Array): IPeerMessage | false {
    return convertPeerMessageToIPeerMessage(PeerMessage.fromBinary(messageBuf))
}

export function serializeFullProof(proof: IRLNGFullProof): Uint8Array {
    return RLNGFullProof.toBinary(convertIFullProofToFullProof(proof))
}
export function deserializeFullProof(proofBuf: Uint8Array): IRLNGFullProof | false {
    const proof = RLNGFullProof.fromBinary(proofBuf)
    return convertFullProofToIFullProof(proof)
}

export function numberToUint8Array(num: number): Uint8Array {
    const buffer = new ArrayBuffer(8); // 64-bit number
    const view = new DataView(buffer);
    view.setFloat64(0, num, true); // true for little-endian
    return new Uint8Array(buffer);
}

export function uint8ArrayToNumber(uint8Arr: Uint8Array): number | false {
    if (uint8Arr.length !== 8) {
        return false
    }
    const buffer = uint8Arr.buffer;
    const view = new DataView(buffer);
    return view.getFloat64(0, true); // true for little-endian
}