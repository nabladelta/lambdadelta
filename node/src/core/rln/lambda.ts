import { BigNumberish } from "@semaphore-protocol/group"
import { Identity } from "@semaphore-protocol/identity"
import { SECRET } from "../../constants"
import { GroupDataProvider } from "./providers/dataProvider"
import { FileProvider } from "./providers/file"
import { generateProof, nullifierInput, RLNGFullProof, verifyProof } from "./rln"
import { getZKFiles } from "./utils/files"
import { shamirRecovery } from "./utils/recovery"

export enum VerificationResult {
    VALID,
    INVALID,
    MISSING_ROOT,
    OUT_OF_RANGE,
    DUPLICATE,
    BREACH
}

/**
 * Verifies RLN proofs
 */
export class Lambda {
    private provider: GroupDataProvider
    private settings: {vKey: any, scheme: "groth16" | "plonk"}
    public expiredTolerance: number
    private knownNullifiers: Map<bigint, RLNGFullProof[]> // nullifier => Proof

    private constructor(provider: GroupDataProvider) {
        this.settings = getZKFiles('rln-multiplier-generic', 'groth16')
        this.provider = provider
        this.knownNullifiers = new Map()
        this.expiredTolerance = 0
    }
    public static async load(secret?: string): Promise<[Lambda, Delta]> {
        const provider = await FileProvider.load()
        return [new Lambda(provider), new Delta(provider, secret)]
    }
    public async verify(proof: RLNGFullProof, claimedTime?: number) {
        const root = proof.snarkProof.publicSignals.merkleRoot
        const [start, end] = await this.provider.getRootTimeRange(BigInt(root))
        if (!start) return VerificationResult.MISSING_ROOT
        const result = await verifyProof(proof, this.settings)
        if (!result) return VerificationResult.INVALID
        if (!claimedTime) return VerificationResult.VALID
        if (!end && claimedTime >= start) return VerificationResult.VALID
        if (end && claimedTime >= start && claimedTime <= (end + this.expiredTolerance)) return VerificationResult.VALID
        return VerificationResult.OUT_OF_RANGE
    }
    public async retrieveSecret(proofs: RLNGFullProof[], nullifierIndex: number) {
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

    public async submitProof(proof: RLNGFullProof, claimedTime?: number) {
        const res = await this.verify(proof, claimedTime)
        if (res == VerificationResult.INVALID || res == VerificationResult.MISSING_ROOT) {
            return res
        }
        let slashes = 0
        for (let i = 0; i < proof.snarkProof.publicSignals.nullifiers.length; i++) {
            const nullifier = BigInt(proof.snarkProof.publicSignals.nullifiers[i])
            // Same nullifier
            const known = this.knownNullifiers.get(nullifier) || []
            // Find any that have same nullifier and signal
            const duplicates = known.filter(p => 
                p.snarkProof.publicSignals.signalHash 
                ===
                proof.snarkProof.publicSignals.signalHash)

            if (duplicates.length > 0) {
                return VerificationResult.DUPLICATE
            }
            // Not a duplicate proof, add it
            known.push(proof)
            this.knownNullifiers.set(nullifier, known)
            // Not a duplicate, first one with this nullifier
            if (known.length == 1) continue

            // We found a slashing target
            slashes++

            const secret = await this.retrieveSecret(known, i)
            await this.provider.slash(secret)
        }
        if (slashes > 0) return VerificationResult.BREACH

        return res
    }
}
/**
 * Creates RLN proofs
 */
class Delta {
    private provider: GroupDataProvider
    private identity: Identity
    private settings: {
        userMessageLimitMultiplier: number,
        scheme: 'groth16' | 'plonk'
        wasmFilePath: string
        zkeyFilePath: string
    }

    public constructor(provider: GroupDataProvider, secret?: string) {
        this.provider = provider
        this.identity = new Identity(secret || SECRET)
        const {files, scheme} = getZKFiles('rln-multiplier-generic', 'groth16')
        this.settings = {...files, userMessageLimitMultiplier: this.provider.getMultiplier(this.identity.commitment)!, scheme}
    }
    public async createProof(signal: string, externalNullifiers: nullifierInput[], rlnIdentifier: string) {
        const merkleProof = this.provider.createMerkleProof(this.identity.commitment, this.settings.userMessageLimitMultiplier)

        return await generateProof(
            this.identity,
            merkleProof,
            externalNullifiers,
            signal,
            {
                rlnIdentifier,
               ...this.settings
            })
    }
}