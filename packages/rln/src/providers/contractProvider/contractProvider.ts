import { GroupDataProvider, GroupEvent } from "../dataProvider"
import { poseidon1 } from 'poseidon-lite'
import { ethers } from "ethers"
import { RLNContract } from "./contractWrapper"

export interface GroupFile {
    id: string,
    treeDepth: number,
    groupEvents: GroupEvent[]
}

export class ContractProvider extends GroupDataProvider {

    private contract: RLNContract
    private slashRewardsAddress: string

    private constructor(gid: string, treeDepth: number, contract: RLNContract, slashRewardsAddress: string) {
        super(gid, treeDepth)
        this.contract = contract
        this.slashRewardsAddress = slashRewardsAddress
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
            slashRewardsAddress: string = "0x000000000000000000000000000000000000dead",
            gid: string = "0",
            treeDepth: number = 20
        ) {
        const contract = new RLNContract({provider, signer, contractAddress, contractAtBlock: 0})
        const dataProvider = new ContractProvider(gid, treeDepth, contract, slashRewardsAddress)
        await dataProvider.update()
        return dataProvider
    }

    // TODO: implement
    public async slash(secretIdentity: bigint) {
        const identityCommitment = poseidon1([secretIdentity])
        try {
            // TODO: Generate proof
            const receipt = await this.contract.slash(identityCommitment, this.slashRewardsAddress, null)
            console.log("Slashed: " + receipt.blockHash)
        } catch (e) {
            console.error("Failed to slash: " + (e as Error).message)
        }
        await this.update()
    }
}