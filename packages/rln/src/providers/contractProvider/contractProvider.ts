import { GroupDataProvider, GroupEvent } from "../dataProvider"
import { poseidon1 } from 'poseidon-lite'
import { ethers } from "ethers"
import { RLNContract } from "./contractWrapper"
import { WithdrawProver } from 'rlnjs'

export interface GroupFile {
    id: string,
    treeDepth: number,
    groupEvents: GroupEvent[]
}

export class ContractProvider extends GroupDataProvider {

    private contract: RLNContract
    private slashRewardsAddress: string
    private withdrawProver?: WithdrawProver

    private constructor(gid: string, treeDepth: number, contract: RLNContract, slashRewardsAddress: string, proverPaths?: {
        withdrawWasmFilePath: string | Uint8Array,
        withdrawFinalZkeyPath: string | Uint8Array
    }) {
        super(gid, treeDepth)
        this.contract = contract
        this.slashRewardsAddress = slashRewardsAddress
        if (proverPaths !== undefined) {
            this.withdrawProver = new WithdrawProver(proverPaths.withdrawWasmFilePath, proverPaths.withdrawFinalZkeyPath)
        }
    }

    protected async loadEvents(lastEventIndex: number): Promise<GroupEvent[]> {
        const groupEvents: GroupEvent[] = []
        const logs = await this.contract.getLogs()
        for (let event of logs) {
            const index = parseInt(event.index.toString())
            if (event.name == 'MemberRegistered') {
                groupEvents.push({
                    type: "ADD",
                    commitment: event.identityCommitment.toString(),
                    time: event.timestamp,
                    multiplier: parseInt(event.messageLimit.toString()),
                    entryIndex: index
                })
            }
            if (event.name == 'MemberSlashed' || event.name == 'MemberWithdrawn') {
                groupEvents.push({
                    type: "REMOVE",
                    time: event.timestamp,
                    entryIndex: index
                })
            }
        }
        return groupEvents.slice(lastEventIndex)
    }

    protected async retrieveRoot(_: string) {
        return [undefined, undefined]
    }

    public static async load(
            contractAddress: string,
            provider: ethers.Provider,
            signer?: ethers.Signer,
            contractAtBlock: number = 0,
            slashRewardsAddress: string = "0x000000000000000000000000000000000000dead",
            gid: string = "0",
            treeDepth: number = 20,
            provers?: {
                withdrawWasmFilePath: string | Uint8Array,
                withdrawFinalZkeyPath: string | Uint8Array
            }
        ) {
        const contract = new RLNContract({provider, signer, contractAddress, contractAtBlock})
        const dataProvider = new ContractProvider(gid, treeDepth, contract, slashRewardsAddress, provers)
        await dataProvider.update()
        return dataProvider
    }

    public async slash(identitySecret: bigint) {
        if (!this.withdrawProver) {
            console.error("Failed to slash: No prover provided")
            return // No prover to slash
        }
        const receiverBigInt = BigInt(this.slashRewardsAddress)
        const identityCommitment = poseidon1([identitySecret])
        try {
            const proof = await this.withdrawProver.generateProof({
                identitySecret,
                address: receiverBigInt,
            })
            const receipt = await this.contract.slash(identityCommitment, this.slashRewardsAddress, proof.proof)
            console.log("Slashed: " + receipt.blockHash)
        } catch (e) {
            console.error("Failed to slash: " + (e as Error).message)
        }
        await this.update()
    }

    async register(identityCommitment: bigint, multiplier: number): Promise<void> {
        if (this.indexOf(GroupDataProvider.getRateCommitment(identityCommitment, multiplier)) !== -1) {
          throw new Error('Identity commitment is already registered')
        }
        await this.contract.register(identityCommitment, BigInt(multiplier))
    }

    async withdraw(identitySecret: bigint): Promise<void> {
        if (this.withdrawProver === undefined) {
          throw new Error('Withdraw prover is not initialized')
        }
        const identityCommitment = poseidon1([identitySecret])
        const user = await this.contract.getUser(identityCommitment)
        if (user.userAddress === ethers.ZeroAddress) {
          throw new Error('Identity commitment is not registered')
        }
        const userAddressBigInt = BigInt(user.userAddress)
    
        const proof = await this.withdrawProver.generateProof({
          identitySecret,
          address: userAddressBigInt,
        })
        await this.contract.withdraw(identityCommitment, proof.proof)
    }
    
    async releaseWithdrawal(identityCommitment: bigint): Promise<void> {
        const withdrawal = await this.contract.getWithdrawal(identityCommitment)
        if (withdrawal.blockNumber == BigInt(0)) {
            throw new Error('Withdrawal is not initiated')
        }
        await this.contract.release(identityCommitment)
    }
}