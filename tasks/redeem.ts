import { task } from "hardhat/config";

task("redeem", "Redeem the order")
  .addParam('platform', "Platform contract address")
  .addParam('id', "Order id")
  .addParam('wei', "Wei value")
  .setAction(async (taskArgs, hre) => {
    const plarformContractAddress = taskArgs.platform;
    const id = taskArgs.id;
    const weiValue = taskArgs.wei;

    const acdmPlatformFactory = await hre.ethers.getContractFactory('ACDMPlatform');
    const acdmPlatform = acdmPlatformFactory.attach(plarformContractAddress);
    const accounts = await hre.ethers.getSigners();
    await acdmPlatform.connect(accounts[0]).redeemOrder(id, {value: weiValue});

    console.log("Done");
  });