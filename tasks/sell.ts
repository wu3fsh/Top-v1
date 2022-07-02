import { task } from "hardhat/config";

task("sell", "Start a sell round")
  .addParam('platform', "Platform contract address")
  .setAction(async (taskArgs, hre) => {
    const plarformContractAddress = taskArgs.platform;

    const acdmPlatformFactory = await hre.ethers.getContractFactory('ACDMPlatform');
    const acdmPlatform = acdmPlatformFactory.attach(plarformContractAddress);
    await acdmPlatform.startSellRound();

    console.log("Done");
  });