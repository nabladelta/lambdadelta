import { Group } from "@semaphore-protocol/group"
import { Identity } from "@semaphore-protocol/identity"
import { FullProof, generateProof, verifyProof } from "@semaphore-protocol/proof"
import { expect } from "chai"
import download from "download"
import { existsSync } from "fs"
import { ethers, run } from "hardhat"
import crypto from 'crypto'
// @ts-ignore: typechain-types folder will be generated after contracts compilation
import { BernkastelGroup } from "../typechain-types"
import { BigNumber } from "ethers"

describe("BernkastelGroup", () => {
    let groupContract: BernkastelGroup

    const snarkArtifactsURL = "https://www.trusted-setup-pse.org/semaphore/20"
    const snarkArtifactsPath = "./artifacts/snark"

    const users: Identity[] = []
    const groupId = "42"
    const group = new Group(groupId)

    const testSignal = ethers.utils.formatBytes32String("Hello World")


    before(async () => {
        if (!existsSync(`${snarkArtifactsPath}/semaphore.wasm`)) {
            await download(`${snarkArtifactsURL}/semaphore.wasm`, `${snarkArtifactsPath}`)
            await download(`${snarkArtifactsURL}/semaphore.zkey`, `${snarkArtifactsPath}`)
        }

        groupContract = await run("deploy", { logs: false, group: groupId })

        users.push(new Identity())

        users.push(new Identity())

        group.addMember(users[0].commitment)
        group.addMember(users[1].commitment)
    })

    describe("# Onchain", () => {
        let proof: FullProof

        it("Should allow users to join the group", async () => {
            const [owner] = await ethers.getSigners()
            for (let i = 0; i < users.length; i += 1) {
                const transaction = groupContract.joinGroup(users[i].commitment)

                await expect(transaction).to.emit(groupContract, "NewUser").withArgs(group.members[i], owner.address)
            }
        })

        it("Should generate the proof", async () => {
            proof = await generateProof(users[1], group, groupId, testSignal, {
                wasmFilePath: `${snarkArtifactsPath}/semaphore.wasm`,
                zkeyFilePath: `${snarkArtifactsPath}/semaphore.zkey`
            })
        })

        it("Should allow users to signal", async () => {

            const transaction = groupContract.signal(
                testSignal,
                proof.merkleTreeRoot,
                proof.nullifierHash,
                groupId,
                proof.proof
            )

            await expect(transaction).to.emit(groupContract, "Signal").withArgs(testSignal, groupId)
        })

        it("Should allow same users to signal a second time with a different nullifier", async () => {
            const originalNullifierHash = crypto.createHash('sha256').update("Unique nullifier string test test").digest()
            let newProof = await generateProof(users[1], group, BigNumber.from(originalNullifierHash), testSignal, {
                wasmFilePath: `${snarkArtifactsPath}/semaphore.wasm`,
                zkeyFilePath: `${snarkArtifactsPath}/semaphore.zkey`
            })

            const transaction = groupContract.signal(
                testSignal,
                newProof.merkleTreeRoot,
                newProof.nullifierHash,
                originalNullifierHash,
                newProof.proof
            )

            await expect(transaction).to.emit(groupContract, "Signal").withArgs(testSignal, originalNullifierHash)
        })

        it("Should not allow same users to signal a second time with the same nullifier", async () => {
            const originalNullifierHash = crypto.createHash('sha256').update("Unique nullifier string test test").digest()
            let newProof = await generateProof(users[1], group, BigNumber.from(originalNullifierHash), testSignal, {
                wasmFilePath: `${snarkArtifactsPath}/semaphore.wasm`,
                zkeyFilePath: `${snarkArtifactsPath}/semaphore.zkey`
            })

            const transaction = groupContract.signal(
                testSignal,
                newProof.merkleTreeRoot,
                newProof.nullifierHash,
                originalNullifierHash,
                newProof.proof
            )

            await expect(transaction).to.be.reverted
        })
    })
    describe("# Offchain", () => {
        let proof: FullProof

        it("Generate Proof", async () => {
            const fullProof = await generateProof(users[1], group, groupId, testSignal, {
                wasmFilePath: `${snarkArtifactsPath}/semaphore.wasm`,
                zkeyFilePath: `${snarkArtifactsPath}/semaphore.zkey`
            })
            proof = fullProof
        })
        it("Verify", async () => {
            expect(await verifyProof(proof, group.depth)).to.be.true
        })
    })
})
