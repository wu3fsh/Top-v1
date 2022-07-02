import { task } from "hardhat/config";

task("vote", "Vote for the proposal")
  .addParam('dao', "The address of the dao contract")
  .addParam('proposalid', "Proposal id of dao contract")
  .addParam('isfor', "Vote for or against the proposal")
  .setAction(async (taskArgs, hre) => {
    const daoAddress = taskArgs.dao;
    const proposalId = taskArgs.proposalid;
    const isFor = taskArgs.isfor;
    const daoFactory = await hre.ethers.getContractFactory('Dao');
    const dao = daoFactory.attach(daoAddress);
    await dao.vote(proposalId, isFor);

    console.log("Done");
  });