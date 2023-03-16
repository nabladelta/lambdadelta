import { task, types } from "hardhat/config"

task("deploy", "Deploy a Group contract")
    .addOptionalParam("semaphore", "Semaphore contract address", undefined, types.string)
    .addOptionalParam("group", "Group id", "42", types.string)
    .addOptionalParam("logs", "Print the logs", true, types.boolean)
    .setAction(async ({ logs, semaphore: semaphoreAddress, group: groupId }, { ethers, run }) => {
        if (!semaphoreAddress) {
            const { semaphore } = await run("deploy:semaphore", {
                logs
            })

            semaphoreAddress = semaphore.address
        }

        const BernkastelGroup = await ethers.getContractFactory("BernkastelGroup")

        const group = await BernkastelGroup.deploy(semaphoreAddress, groupId)

        await group.deployed()

        if (logs) {
            console.info(`BernkatelGroup contract has been deployed to: ${group.address}`)
        }

        return group
    })
