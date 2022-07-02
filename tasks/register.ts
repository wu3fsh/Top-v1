import { task } from "hardhat/config";

task("register", "Refister on acdm platform")
  .addParam('platform', "Platform contract address")
  .addParam('referral', "Referral address")
  .setAction(async (taskArgs, hre) => {
    const plarformContractAddress = taskArgs.plarform;
    const referral = taskArgs.referral;

    const acdmPlatformFactory = await hre.ethers.getContractFactory('ACDMPlatform');
    const acdmPlatform = acdmPlatformFactory.attach(plarformContractAddress);
    await acdmPlatform.register(referral);

    console.log("Done");
  });