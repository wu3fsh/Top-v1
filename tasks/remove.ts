import { task } from "hardhat/config";

task("remove", "Remove the order")
  .addParam('platform', "Platform contract address")
  .addParam('id', "Order id")
  .addParam('volume', "Order volume")
  .setAction(async (taskArgs, hre) => {
    const plarformContractAddress = taskArgs.platform;
    const id = taskArgs.id;
    const volume = taskArgs.volume;

    const acdmPlatformFactory = await hre.ethers.getContractFactory('ACDMPlatform');
    const acdmPlatform = acdmPlatformFactory.attach(plarformContractAddress);
    const accounts = await hre.ethers.getSigners();
    await acdmPlatform.connect(accounts[0]).removeOrder(id, volume);

    console.log("Done");
  });