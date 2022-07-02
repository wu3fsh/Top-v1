import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import { keccak256 } from "ethers/lib/utils";


async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with the account:', deployer.address);

  console.log('Account balance:', (await deployer.getBalance()).toString());

  // const acdmTokenFactory = await ethers.getContractFactory('ACDMToken');
  // const acdmToken = await acdmTokenFactory.deploy();

  // const topTokenFactory = await ethers.getContractFactory('TopToken');
  // const topToken = await topTokenFactory.deploy();


  // const addresses: string[] = [
  //   "0xc862eBB2Edabae0349DDF99970E825F2D2ce969F",
  //   "0xC918c566f86A4A09A7b237e3AeA5EE5F935b3aFB",
  // ];
  // const hashedLeafs: string[] = addresses.map(address => keccak256(address));
  // const merkleTree: MerkleTree = new MerkleTree(hashedLeafs, keccak256, {sortPairs: true});
  // const root: string = "0x" + merkleTree.getRoot().toString('hex');

  // const stakingFactory = await ethers.getContractFactory('Staking');
  // const staking = await stakingFactory.deploy(process.env.TOP_TOKEN, process.env.LP_TOKEN, root);
  // init dao for staking contract - done

  // const daoFactory = await ethers.getContractFactory('Dao');
  // const dao = await daoFactory.deploy(process.env.OWNER_ADDRESS, process.env.LP_TOKEN, process.env.STAKING_CONTRACT, process.env.MINIMUM_QUORUM, process.env.DEBATING_DURATION);

  const acdmPlatformFactory = await ethers.getContractFactory('ACDMPlatform');
  const acdmPlatform = await acdmPlatformFactory.deploy(process.env.ACDM_TOKEN, process.env.TOP_TOKEN, process.env.DAO_CONTRACT, process.env.ROUND_DURATION);

  // console.log('Staking address:', staking.address);
  // console.log('Dao address:', dao.address);
  // console.log('ACDM token address:', acdmToken.address);
  // console.log('Top token address:', topToken.address);
  console.log('ACDM platform address:', acdmPlatform.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
