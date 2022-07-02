import { task } from "hardhat/config";

task("add-proposal", "Add a proposal to dao contract")
  .addParam('dao', "The address of the dao contract")
  .addParam('signature', "Signature to call on contract")
  .addParam('recipient', "Callee contract address")
  .addParam('description', "Proposal description")
  .setAction(async (taskArgs, hre) => {
    const daoAddress = taskArgs.dao;
    const signature = taskArgs.signature;
    const recipient = taskArgs.recipient;
    const description = taskArgs.description;
    const daoFactory = await hre.ethers.getContractFactory('Dao');
    const dao = daoFactory.attach(daoAddress);
    await dao.addProposal(signature, recipient, description);

    console.log("Done");
  });