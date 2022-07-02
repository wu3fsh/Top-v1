import { task } from "hardhat/config";

task("unstake", "Unstake LP tokens")
  .addParam('staking', "Staking contract address")
  .setAction(async (taskArgs, hre) => {
    const stakingContractAddress = taskArgs.staking;

    const stakingContractFactory = await hre.ethers.getContractFactory('Staking');
    const stakingContract = stakingContractFactory.attach(stakingContractAddress);
    await stakingContract.unstake();

    console.log("Done");
  });