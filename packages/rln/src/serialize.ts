import { RLNGFullProof } from "./rln";

export function serializeProof(proof: RLNGFullProof) {
    return Buffer.from(JSON.stringify(proof))
}

export function deserializeProof(proofBuf: Buffer): RLNGFullProof {
    return JSON.parse(proofBuf.toString('utf-8'))
}