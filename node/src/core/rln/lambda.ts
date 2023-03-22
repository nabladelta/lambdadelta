import { Identity } from "@semaphore-protocol/identity"
import { SECRET } from "../../constants"
import { GroupDataProvider } from "./providers/dataProvider"
import { FileProvider } from "./providers/file"
import { generateProof } from "./rln"
import { generateDualProof } from "./rln_same_dual"
import { getZKFiles } from "./utils/files"

/**
 * Verifies RLN proofs
 */
class Lambda {
    private provider: GroupDataProvider
    
    private constructor(provider: GroupDataProvider) {
        this.provider = provider
    }
    public static async load() {
        const provider = await FileProvider.load()
        return [new Lambda(provider), new Delta(provider)]
    }
    public async verifyProof() {
        
    }
}
/**
 * Creates RLN proofs
 */
class Delta {
    private provider: GroupDataProvider
    private identity: Identity
    private files: {wasmFilePath: string, zkeyFilePath: string}

    public constructor(provider: GroupDataProvider) {
        this.provider = provider
        this.identity = new Identity(SECRET)
        const {files} = getZKFiles('rln', 'groth16')
        this.files = files
    }
    public async createProof(signal: string, externalNullifier: string, rlnIdentifier: string, ) {
        const merkleProof = this.provider.createMerkleProof(this.identity.commitment)
        return await generateProof(this.identity, merkleProof, externalNullifier, signal, this.files, rlnIdentifier, 'groth16')
    }
}