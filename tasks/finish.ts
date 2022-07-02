import { task } from "hardhat/config";

task("finish", "Finish the proposal poll")
  .addParam('dao', "The address of the dao contract")
  .addParam('proposalid', "Proposal id of dao contract")
  .setAction(async (taskArgs, hre) => {
    const daoAddress = taskArgs.dao;
    const proposalId = taskArgs.proposalid;
    const daoFactory = await hre.ethers.getContractFactory('Dao');
    const dao = daoFactory.attach(daoAddress);
    await dao.finishProposal(proposalId);

    console.log("Done");
  });