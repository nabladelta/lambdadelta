import { BigNumberish } from "@semaphore-protocol/group"
import { Identity } from "@semaphore-protocol/identity"
import { SECRET } from "../../constants"
import { GroupDataProvider } from "./providers/dataProvider"
import { FileProvider } from "./providers/file"
import { generateProof, nullifierInput, RLNGFullProof, verifyProof } from "./rln"
import { getZKFiles } from "./utils/files"

export enum VerificationResult {
    VALID,
    INVALID,
    MISSING_ROOT,
    OUT_OF_RANGE
}

/**
 * Verifies RLN proofs
 */
class Lambda {
    private provider: GroupDataProvider
    private settings: {vKey: any, scheme: "groth16" | "plonk"}
    public expiredTolerance: number

    private constructor(provider: GroupDataProvider) {
        this.settings = getZKFiles('rln-multiplier-generic', 'groth16')
        this.provider = provider
        this.expiredTolerance = 0
    }
    public static async load() {
        const provider = await FileProvider.load()
        return [new Lambda(provider), new Delta(provider)]
    }
    public async verifyProof(proof: RLNGFullProof, claimedTime?: number) {
        const root = proof.snarkProof.publicSignals.merkleRoot
        const [start, end] = await this.provider.getRootTimeRange(root.toString())
        if (!start) return VerificationResult.MISSING_ROOT
        const result = await verifyProof(proof, this.settings)
        if (!result) return VerificationResult.INVALID
        if (!claimedTime) return VerificationResult.VALID
        if (!end && claimedTime >= start) return VerificationResult.VALID
        if (end && claimedTime >= start && claimedTime <= (end + this.expiredTolerance)) return VerificationResult.VALID
        return VerificationResult.OUT_OF_RANGE
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

    public constructor(provider: GroupDataProvider) {
        this.provider = provider
        this.identity = new Identity(SECRET)
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