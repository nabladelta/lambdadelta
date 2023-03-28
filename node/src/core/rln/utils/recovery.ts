import { ZqField } from 'ffjavascript'
import { RLNGFullProof } from '../rln'

/*
  This is the "Baby Jubjub" curve described here:
  https://iden3-docs.readthedocs.io/en/latest/_downloads/33717d75ab84e11313cc0d8a090b636f/Baby-Jubjub.pdf
*/
export const SNARK_FIELD_SIZE = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')

// Creates the finite field
export const Fq = new ZqField(SNARK_FIELD_SIZE)

export function shamirRecovery(x1: bigint, x2: bigint, y1: bigint, y2: bigint): bigint {
    const slope = Fq.div(Fq.sub(y2, y1), Fq.sub(x2, x1))
    const privateKey = Fq.sub(y1, Fq.mul(slope, x1))

    return Fq.normalize(privateKey)
}

export async function retrieveSecret(proofs: RLNGFullProof[], nullifierIndex: number) {
  if (proofs[0].snarkProof.publicSignals.nullifiers[nullifierIndex] 
      !==
      proofs[1].snarkProof.publicSignals.nullifiers[nullifierIndex]) {
      throw new Error('External Nullifiers do not match! Cannot recover secret.')
  }
  const y1 = proofs[0].snarkProof.publicSignals.y[nullifierIndex]
  const y2 = proofs[1].snarkProof.publicSignals.y[nullifierIndex]
  const x1 = proofs[0].snarkProof.publicSignals.signalHash
  const x2 = proofs[1].snarkProof.publicSignals.signalHash
  if (x1 === x2) {
      throw new Error('Signal is the same. Cannot recover secret.')
  }
  return shamirRecovery(BigInt(x1), BigInt(x2), BigInt(y1), BigInt(y2))
}