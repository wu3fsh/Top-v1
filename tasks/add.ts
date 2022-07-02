import { task } from "hardhat/config";

task("add", "Add a new order")
  .addParam('platform', "Platform contract address")
  .addParam('price', "Order price")
  .addParam('volume', "Order volume")
  .setAction(async (taskArgs, hre) => {
    const plarformContractAddress = taskArgs.platform;
    const price = taskArgs.price;
    const volume = taskArgs.volume;

    const acdmPlatformFactory = await hre.ethers.getContractFactory('ACDMPlatform');
    const acdmPlatform = acdmPlatformFactory.attach(plarformContractAddress);
    const accounts = await hre.ethers.getSigners();
    await acdmPlatform.connect(accounts[0]).addOrder(price, volume);

    console.log("Done");
  });