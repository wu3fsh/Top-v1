import { task } from "hardhat/config";

task("trade", "Start a trade round")
  .addParam('platform', "Platform contract address")
  .setAction(async (taskArgs, hre) => {
    const plarformContractAddress = taskArgs.platform;

    const acdmPlatformFactory = await hre.ethers.getContractFactory('ACDMPlatform');
    const acdmPlatform = acdmPlatformFactory.attach(plarformContractAddress);
    await acdmPlatform.startTradeRound();

    console.log("Done");
  });
  