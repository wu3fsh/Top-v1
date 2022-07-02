import { task } from "hardhat/config";

task("claim", "Claim rewards tokens")
  .addParam('staking', "Staking contract address")
  .setAction(async (taskArgs, hre) => {
    const stakingContractAddress = taskArgs.staking;

    const stakingContractFactory = await hre.ethers.getContractFactory('Staking');
    const stakingContract = stakingContractFactory.attach(stakingContractAddress);
    await stakingContract.claim();

    console.log("Done");
  });