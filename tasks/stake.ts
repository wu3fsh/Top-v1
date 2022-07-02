import { task } from "hardhat/config";

task("stake", "Stake LP tokens")
  .addParam('staking', "Staking contract address")
  .addParam('amount', "Amount of LP tokens")
  .setAction(async (taskArgs, hre) => {
    const stakingContractAddress = taskArgs.staking;
    const tokensAmount = taskArgs.amount;

    const stakingContractFactory = await hre.ethers.getContractFactory('Staking');
    const stakingContract = stakingContractFactory.attach(stakingContractAddress);
    await stakingContract.stake(tokensAmount);

    console.log("Done");
  });