import { Identity } from "@semaphore-protocol/identity"
import { GroupDataProvider } from "./providers/dataProvider"
import { FileProvider } from "./providers/file"
import { generateProof, nullifierInput, RLNGFullProof, verifyProof } from "./rln"
import { getZKFiles } from "./utils/files"
import { retrieveSecret } from "./utils/recovery"

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

    public static async load(secret: string, filename: string): Promise<[Lambda, Delta]> {
        const provider = await FileProvider.load(filename)
        return [new Lambda(provider), new Delta(provider, secret)]
    }

    public async verify(proof: RLNGFullProof, claimedTime?: number) {
        const root = proof.snarkProof.publicSignals.merkleRoot
        const [start, end] = await this.provider.getRootTimeRange(BigInt(root))
        if (!start) return VerificationResult.MISSING_ROOT

        const result = await verifyProof(proof, this.settings)

        if (!result) return VerificationResult.INVALID
        if (!claimedTime) return VerificationResult.VALID
        if (!end
            && claimedTime >= start)
                return VerificationResult.VALID
        if (end
            && claimedTime >= start 
            && claimedTime <= (end + this.expiredTolerance)) 
                return VerificationResult.VALID

        return VerificationResult.OUT_OF_RANGE
    }

    public async submitProof(proof: RLNGFullProof, claimedTime?: number) {
        const res = await this.verify(proof, claimedTime)
        if (res == VerificationResult.INVALID || res == VerificationResult.MISSING_ROOT) {
            // There is no point in storing a proof that is either not correct, or from a different group
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
            if (slashes > 1) continue // Can't slash same user twice

            const secret = await retrieveSecret(known, i)
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
        this.identity = new Identity(secret)
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