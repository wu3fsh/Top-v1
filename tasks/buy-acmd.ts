  import { task } from "hardhat/config";

task("buy-acmd", "Buy a acmd token")
  .addParam('platform', "Platform contract address")
  .addParam('wei', "Wei value")
  .setAction(async (taskArgs, hre) => {
    const plarformContractAddress = taskArgs.platform;
    const weiValue = taskArgs.wei;

    const acdmPlatformFactory = await hre.ethers.getContractFactory('ACDMPlatform');
    const acdmPlatform = acdmPlatformFactory.attach(plarformContractAddress);
    const accounts = await hre.ethers.getSigners();
    await acdmPlatform.connect(accounts[0]).buyACDM({value: weiValue});

    console.log("Done");
  });
  
  