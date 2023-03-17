import { RLNSNARKProof, RLNWitnessT } from "rlnjs/dist/types/types"

interface RLNFullProof {
    snarkProof: RLNSNARKProof
    signal: string
    eNullifier: string,
    rlnIdentifier: BigNumberish
}