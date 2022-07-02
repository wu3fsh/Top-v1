import { ethers, network } from "hardhat";
import { BigNumber, Contract, ContractFactory, providers, Signer } from "ethers";
import { expect } from "chai";
import { Interface } from "ethers/lib/utils";
import { MerkleTree } from "merkletreejs";
import { keccak256 } from "ethers/lib/utils";

const hashedLeafs: string[] = [
  keccak256("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
  keccak256("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
  keccak256("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"),
  keccak256("0x90F79bf6EB2c4f870365E785982E1f101E93b906"),
  keccak256("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"),
];

describe("ACDMPlatform", function () {
    let owner: Signer;
    let addresses: Signer[];
    let acdmTokenFactory: ContractFactory;
    let topTokenFactory: ContractFactory;
    let acdmPlatformFactory: ContractFactory;
    let stakingFactory: ContractFactory;
    let daoFactory: ContractFactory;
    let topToken: Contract;
    let acdmPlatform: Contract;
    let acdmToken: Contract;
    let stakingContract: Contract;
    let dao: Contract;
    let rewardsToken: Contract;
    let lpToken: Contract;
    const emptyAddress = "0x0000000000000000000000000000000000000000";
    const roundDuration: number = 10;
    let lastTokenPrice: number = 0.00001 * 10 ** 18; 
    let tradeRoundVolume: number = 1 * 10 **18;
    const minimumQuorum: number = 1;
    const debatingDuration: number = 5;
    const provider: providers.JsonRpcProvider  = ethers.provider;
    let merkleTree: MerkleTree = new MerkleTree(hashedLeafs, keccak256, {sortPairs: true});
    let merkleRoot: string = "0x" + merkleTree.getRoot().toString('hex');

    beforeEach(async function () {
      [owner, ...addresses] = await ethers.getSigners();
      acdmTokenFactory = await ethers.getContractFactory('ACDMToken');
      acdmToken = await acdmTokenFactory.deploy();

      topTokenFactory = await ethers.getContractFactory('TopToken');
      topToken = await topTokenFactory.deploy();

      rewardsToken = await topTokenFactory.connect(addresses[1]).deploy();
      lpToken = await topTokenFactory.deploy();
      stakingFactory = await ethers.getContractFactory('Staking');
      stakingContract = await stakingFactory.deploy(rewardsToken.address, lpToken.address, merkleRoot);

      daoFactory = await ethers.getContractFactory('Dao');
      dao = await daoFactory.deploy(await owner.getAddress(), lpToken.address, stakingContract.address, minimumQuorum, debatingDuration);

      acdmPlatformFactory = await ethers.getContractFactory('ACDMPlatform');
      acdmPlatform = await acdmPlatformFactory.deploy(acdmToken.address, topToken.address, dao.address, roundDuration);

      await acdmToken.setPlatform(acdmPlatform.address);

      // await network.provider.request({
      //   method: "hardhat_reset",
      //   params: [
      //     {
      //       forking: {
      //         jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      //         blockNumber: 10947413,
      //       },
      //     },
      //   ],
      // });
    });

    it("should return acdm token decimals", async function () {
      expect(await acdmToken.decimals()).to.equal(6);
    });

    it("should throw exception on setting acdm token if it isn't owner", async function () {
      try {
        expect(await acdmToken.connect(addresses[2]).setPlatform(acdmPlatform.address)).to.throw();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Only the owner of contract can perform this operation");
      }
    });

    it("should throw exception on setting acdm token if it isn't platform", async function () {
      try {
        expect(await acdmToken.connect(addresses[2]).burn(acdmPlatform.address, 10)).to.throw();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Only the acdm platform can perform this operation");
      }
    });
    
    it("should be set to top token", async function () {
      await topToken.setPlatrformContract(acdmPlatform.address);
    });

    it("should throw exception on setting top token if it isn't owner", async function () {
      try {
        expect(await topToken.connect(addresses[2]).setPlatrformContract(acdmPlatform.address)).to.throw();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Only the owner of contract can perform this operation");
      }
    });

    it("should burning top token", async function () {
      await topToken.setPlatrformContract(acdmPlatform.address);
      await acdmPlatform.connect(addresses[3]).register(emptyAddress);
      await acdmPlatform.connect(addresses[2]).register(emptyAddress);
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(emptyAddress);

      // first round
      // sell round
      const acdmDecimals: number = 10 ** 6;
      await acdmPlatform.startSellRound();
      const firstVolume: BigNumber = BigNumber.from("1000000000000000000");
      const firstRoundPrice: number = lastTokenPrice;
      const firstSellRoundAmount: BigNumber = firstVolume.div(firstRoundPrice).mul(acdmDecimals);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(firstSellRoundAmount);

      await acdmPlatform.buyACDM({value: firstSellRoundAmount.div(2).div(acdmDecimals).mul(lastTokenPrice)  });
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(firstSellRoundAmount.div(2));
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(firstSellRoundAmount.div(2));

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      
      // trade round
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(firstSellRoundAmount.div(2));

      const firstTradeRoundPrice: number = firstRoundPrice;
      const firstTradeRoundVolume: number = firstSellRoundAmount.div(2).toNumber();
      await acdmToken.connect(owner).approve(acdmPlatform.address, firstTradeRoundVolume);
      await acdmPlatform.addOrder(firstTradeRoundPrice, firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(0);

      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(0);
      let ethValue: BigNumber = BigNumber.from(firstTradeRoundVolume).div(acdmDecimals).mul(firstTradeRoundPrice);
      await acdmPlatform.connect(addresses[1]).redeemOrder(0, {value: ethValue });
      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [`${acdmPlatform.address}`],
      });

      const platform: Signer = await ethers.getSigner(`${acdmPlatform.address}`);
      await topToken.connect(owner).transfer(await platform.getAddress(), 10000000);
      await topToken.connect(platform).burn(await platform.getAddress(), 100);
    });

    it("should throw exception on burning top token if it isn't platform", async function () {
      try {
        expect(await topToken.connect(addresses[2]).burn(acdmPlatform.address, 100)).to.throw();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Only the acdm platfrom can perform this operation");
      }
    });

    it("should register a new user", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.connect(addresses[1]).register(owner.getAddress());
    });

    it("should throw exception on register if referral isn't registed", async function () {
      try {
        expect(await acdmPlatform.connect(addresses[1]).register(owner.getAddress())).to.throw();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Referral should be registed");
      }
    });

    it("should start sell round", async function () {
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      await acdmPlatform.startSellRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(10**6 * tradeRoundVolume / lastTokenPrice);
    });

    it("should throw exception on start round if sell round has been already started", async function () {
      await acdmPlatform.startSellRound();
      try {
        await acdmPlatform.startSellRound();
       } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Cannot start sell round");
      }
    });

    it("should throw exception on start round if trade round isn't over", async function () {
      await acdmPlatform.startSellRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      try {
        await acdmPlatform.startSellRound();
       } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Trade round isn't over");
      }
    });
    
    it("should let start trade round if previous trade volume is zero", async function () {
      await acdmPlatform.startSellRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      // trade volume should be zero after that
      await acdmPlatform.startTradeRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startSellRound();
      await acdmPlatform.startTradeRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startSellRound();
      await acdmPlatform.startTradeRound();
    });

    it("should buy ACDM tokens on sell round without referrals", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      const platformBalance: BigNumber = await provider.getBalance(acdmPlatform.address);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(0);
      await acdmPlatform.buyACDM({value: lastTokenPrice});
      expect(await provider.getBalance(acdmPlatform.address)).to.equal(platformBalance.add(lastTokenPrice));
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(1 * 10 ** 6);
    });

    it("should buy ACDM tokens on sell round with referrals", async function () {
      await acdmPlatform.connect(addresses[2]).register(emptyAddress);
      await acdmPlatform.connect(addresses[1]).register(addresses[2].getAddress());
      await acdmPlatform.connect(owner).register(addresses[1].getAddress());
      await acdmPlatform.startSellRound();
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(0);
      const firstReferralBalance: BigNumber = await addresses[1].getBalance();
      const secondReferralBalance: BigNumber = await addresses[2].getBalance();
      const platformBalance: BigNumber = await provider.getBalance(acdmPlatform.address);

      await acdmPlatform.connect(owner).buyACDM({value: lastTokenPrice});

      expect(await addresses[1].getBalance()).to.equal(firstReferralBalance.add(lastTokenPrice * 0.05));
      expect(await addresses[2].getBalance()).to.equal(secondReferralBalance.add(lastTokenPrice * 0.03));
      expect(await provider.getBalance(acdmPlatform.address)).to.equal(platformBalance.add(lastTokenPrice * 0.92));

      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(1 * 10 ** 6);
    });

    it("should buy ACDM tokens on sell round with one referral", async function () {
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(addresses[1].getAddress());
      await acdmPlatform.startSellRound();
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(0);
      const firstReferralBalance: BigNumber = await addresses[1].getBalance();
      const platformBalance: BigNumber = await provider.getBalance(acdmPlatform.address);

      await acdmPlatform.connect(owner).buyACDM({value: lastTokenPrice});

      expect(await addresses[1].getBalance()).to.equal(firstReferralBalance.add(lastTokenPrice * 0.05));
      expect(await provider.getBalance(acdmPlatform.address)).to.equal(platformBalance.add(lastTokenPrice * 0.95));

      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(1 * 10 ** 6);
    });

    it("should buy all ACDM tokens on sell round and returns eth remains ", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      const balance: BigNumber = await owner.getBalance();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(100000 * 10 ** 6);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(0);
      await acdmPlatform.buyACDM({value: "10000000000000000000" });
      
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(100000 * 10 ** 6);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      const newBalance: BigNumber = await owner.getBalance();
      expect(BigNumber.from("1000100000000000000").sub(balance.sub(newBalance)).toNumber()).greaterThan(0);
    });

    it("should throw exception on buying ACDM if sell round hasn't start yet", async function () {
      await acdmPlatform.register(emptyAddress);
      try {
        await acdmPlatform.buyACDM({value: "10000000000000000000" });
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Sell round hasn't start yet");
      }
    });

    it("should throw exception on buying ACDM if sell round is over", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      try {
        await acdmPlatform.buyACDM({value: "10000000000000000000" });
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Sell round is over");
      }
    });

    it("should throw exception on buying ACDM if there are not enough funds", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      try {
        await acdmPlatform.buyACDM({value: "10" });
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Not enough funds");
      }
    });

    it("should throw exception on buying ACDM if all tokens are sold", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      await acdmPlatform.buyACDM({value: "10000000000000000000" });
      
      try {
        await acdmPlatform.buyACDM({value: "10000000000000000000" });
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("All tokens are sold");
      }
    });

    it("should throw exception on buying ACDM if is isn't a registed user", async function () {
      try {
        await acdmPlatform.buyACDM({value: "10000000000000000000" });
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Only for registed users");
      }
    });

    it("should start trade round", async function () {
      await acdmPlatform.startSellRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(10**6 * tradeRoundVolume / lastTokenPrice);
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
    });

    it("should throw exception on starting trade round if it cannot start", async function () {
      try {
        await acdmPlatform.startTradeRound();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Cannot start trade round");
      }
    });

    it("should throw exception on starting trade round if sell round isn't over", async function () {
      await acdmPlatform.startSellRound();
      try {
        await acdmPlatform.startTradeRound();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Sell round isn't over");
      }
    });
    
    it("should add a new order", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      await acdmPlatform.buyACDM({value: "100000000000000000" });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(intialVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(volume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(volume);
    });

    it("should throw exception on adding a new order if seller doesn't have enough tokens", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();

      try {
        await acdmPlatform.addOrder(lastTokenPrice, 10);
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Not enough acdm tokens");
      }
    });

    it("should throw exception on adding a new order if trade round is over", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();

      try {
        await acdmPlatform.addOrder(lastTokenPrice, 10);
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Trade round is over");
      }
    });

    it("should throw exception on adding a new order if trade round is over(case 1)", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      
      try {
        await acdmPlatform.addOrder(lastTokenPrice, 10);
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Trade round is over");
      }
    });

    it("should throw exception on adding a new order if trade round is over(case 2)", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      try {
        await acdmPlatform.addOrder(lastTokenPrice, 10);
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Trade round is over");
      }
    });

    it("should partly remove an order", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      await acdmPlatform.buyACDM({value: "100000000000000000" });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      await acdmPlatform.removeOrder(0, volume/2);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(volume + volume/2);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(volume - volume/2);
    });

    it("should remove an order", async function () {
      await acdmPlatform.register(emptyAddress);
      await acdmPlatform.startSellRound();
      await acdmPlatform.buyACDM({value: "100000000000000000" });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      await acdmPlatform.removeOrder(0, 0);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(intialVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
    });

    it("should throw exception on removing an order if seller doesn't have a permission", async function () {
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(emptyAddress);
      await acdmPlatform.startSellRound();
      await acdmPlatform.buyACDM({value: "100000000000000000" });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      try {
        await acdmPlatform.connect(addresses[1]).removeOrder(0, 0);
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Doesn't have a permission");
      }
    });

    it("should throw exception on removing an order if remove an invalid volume", async function () {
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(emptyAddress);
      await acdmPlatform.startSellRound();
      await acdmPlatform.buyACDM({value: "100000000000000000" });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      try {
        await acdmPlatform.removeOrder(0, intialVolume);
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Invalid volume");
      }
    });

    it("should redeem an order without referrals", async function () {
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(emptyAddress);
      await acdmPlatform.startSellRound();
      const ethValue: BigNumber = BigNumber.from("100000000000000000");
      await acdmPlatform.buyACDM({value: ethValue });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(volume);
      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(0);
      const sellerBalance: BigNumber = await owner.getBalance();
      await acdmPlatform.connect(addresses[1]).redeemOrder(0, {value: ethValue.div(2) });
      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(volume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
      expect(await owner.getBalance()).to.equal(sellerBalance.add(ethValue.div(2).mul(95).div(100)));
    });

    it("should redeem an order with referrals", async function () {
      await acdmPlatform.connect(addresses[3]).register(emptyAddress);
      await acdmPlatform.connect(addresses[2]).register(addresses[3].getAddress());
      await acdmPlatform.connect(addresses[1]).register(addresses[2].getAddress());
      await acdmPlatform.connect(owner).register(emptyAddress);
      await acdmPlatform.startSellRound();
      const ethValue: BigNumber = BigNumber.from("100000000000000000");
      await acdmPlatform.buyACDM({value: ethValue });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(volume);
      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(0);
      const sellerBalance: BigNumber = await owner.getBalance();
      const firstReferralBalance: BigNumber = await addresses[2].getBalance();
      const secondReferralBalance: BigNumber = await addresses[3].getBalance();
      await acdmPlatform.connect(addresses[1]).redeemOrder(0, {value: ethValue.div(2) });
      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(volume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
      expect(await owner.getBalance()).to.equal(sellerBalance.add(ethValue.div(2).mul(95).div(100)));
      expect(await addresses[2].getBalance()).to.equal(firstReferralBalance.add(ethValue.div(2).mul(25).div(1000)));
      expect(await addresses[3].getBalance()).to.equal(secondReferralBalance.add(ethValue.div(2).mul(25).div(1000)));
    });

    it("should throw exception on redeeming an order if the order has been already removed", async function () {
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(emptyAddress);
      await acdmPlatform.startSellRound();
      const ethValue: BigNumber = BigNumber.from("100000000000000000");
      await acdmPlatform.buyACDM({value: ethValue });
      const intialVolume: number = 10000 * 10 ** 6;
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      await acdmPlatform.startTradeRound();
      const newPrice: number = lastTokenPrice;
      const volume: number = intialVolume/2;
      await acdmToken.connect(owner).approve(acdmPlatform.address, volume);
      await acdmPlatform.addOrder(newPrice, volume);
      await acdmPlatform.removeOrder(0, 0);
      try {
        await acdmPlatform.connect(addresses[1]).redeemOrder(0, {value: ethValue.div(2) });
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Order cannot be sold");
      }
    });

    // case with chain of sell and trade rounds and check changing a price on each round
    it("should follow workflow of the acdm platform and send commission", async function () {
      await acdmPlatform.connect(addresses[3]).register(emptyAddress);
      await acdmPlatform.connect(addresses[2]).register(emptyAddress);
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(emptyAddress);

      // first round
      // sell round
      const acdmDecimals: number = 10 ** 6;
      await acdmPlatform.startSellRound();
      const firstVolume: BigNumber = BigNumber.from("1000000000000000000");
      const firstRoundPrice: number = lastTokenPrice;
      const firstSellRoundAmount: BigNumber = firstVolume.div(firstRoundPrice).mul(acdmDecimals);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(firstSellRoundAmount);

      await acdmPlatform.buyACDM({value: firstSellRoundAmount.div(2).div(acdmDecimals).mul(lastTokenPrice)  });
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(firstSellRoundAmount.div(2));
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(firstSellRoundAmount.div(2));

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      
      // trade round
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(firstSellRoundAmount.div(2));

      const firstTradeRoundPrice: number = firstRoundPrice;
      const firstTradeRoundVolume: number = firstSellRoundAmount.div(2).toNumber();
      await acdmToken.connect(owner).approve(acdmPlatform.address, firstTradeRoundVolume);
      await acdmPlatform.addOrder(firstTradeRoundPrice, firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(0);

      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(0);
      let ethValue: BigNumber = BigNumber.from(firstTradeRoundVolume).div(acdmDecimals).mul(firstTradeRoundPrice);
      await acdmPlatform.connect(addresses[1]).redeemOrder(0, {value: ethValue });
      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);

      // second round
      // sell round
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      await acdmPlatform.startSellRound();
      const secondVolume: BigNumber = ethValue;
      const secondRoundPrice: number = firstRoundPrice * 103/100 + 0.000004 * 10**18;
      const secondSellRoundAmount: BigNumber = secondVolume.mul(acdmDecimals).div(secondRoundPrice);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(secondSellRoundAmount);

      await acdmPlatform.buyACDM({value: secondSellRoundAmount.mul(secondRoundPrice).div(acdmDecimals)  });
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(secondSellRoundAmount);

      // trade round
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(secondSellRoundAmount);

      const secondTradeRoundPriceFirstOrder: BigNumber = BigNumber.from(secondRoundPrice);
      const secondTradeRoundVolumeFirstOrder: BigNumber = secondSellRoundAmount.div(2);
      const secondTradeRoundPriceSecondOrder: BigNumber = BigNumber.from(secondRoundPrice).mul(11).div(10);
      const secondTradeRoundVolumeSecondOrder: BigNumber = secondSellRoundAmount.div(2);
      await acdmToken.connect(owner).approve(acdmPlatform.address, secondSellRoundAmount);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
      await acdmPlatform.addOrder(secondTradeRoundPriceFirstOrder, secondTradeRoundVolumeFirstOrder);
      await acdmPlatform.addOrder(secondTradeRoundPriceSecondOrder, secondTradeRoundVolumeSecondOrder);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(secondTradeRoundVolumeFirstOrder.add(secondTradeRoundVolumeSecondOrder));
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(secondSellRoundAmount.sub(secondTradeRoundVolumeFirstOrder.add(secondTradeRoundVolumeSecondOrder)));

      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(0);
      ethValue = BigNumber.from(secondTradeRoundVolumeSecondOrder).mul(secondTradeRoundPriceSecondOrder).div(acdmDecimals);
      await acdmPlatform.connect(addresses[2]).redeemOrder(2, {value: ethValue });
      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(secondTradeRoundVolumeSecondOrder);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(secondTradeRoundVolumeFirstOrder);

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);

      // third round
      // sell round
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      await acdmPlatform.startSellRound();
      const thirdVolume: BigNumber = ethValue;
      const thirdRoundPrice: number = secondRoundPrice * 103/100 + 0.000004 * 10**18;
      const thirdSellRoundAmount: BigNumber = thirdVolume.mul(acdmDecimals).div(thirdRoundPrice);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(thirdSellRoundAmount);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(secondTradeRoundVolumeFirstOrder);
      
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      
      // trade round
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(1);
      
      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(secondTradeRoundVolumeSecondOrder);
      ethValue = BigNumber.from(secondTradeRoundVolumeFirstOrder).mul(secondTradeRoundPriceFirstOrder).div(acdmDecimals);
      await acdmPlatform.connect(addresses[2]).redeemOrder(1, {value: ethValue });
      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(secondTradeRoundVolumeSecondOrder.add(secondTradeRoundVolumeFirstOrder));
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
      
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);

      // fourth round
      // sell round
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      await acdmPlatform.startSellRound();
      const fourthVolume: BigNumber = ethValue;
      const fourthRoundPrice: number = thirdRoundPrice * 103/100 + 0.000004 * 10**18;
      const fourthSellRoundAmount: BigNumber = fourthVolume.mul(acdmDecimals).div(fourthRoundPrice);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(fourthSellRoundAmount);

      // dao part
      const amount = 100;
      await lpToken.approve(dao.address, amount);
      await lpToken.approve(stakingContract.address, amount);
      await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));
  
      await dao.addProposal(getCallDataSendCommission(await addresses[4].getAddress()), acdmPlatform.address, "new proposal");
      const proposalId: number = 1;
      await dao.vote(proposalId, true);
      await network.provider.send("evm_increaseTime", [10]);
      let porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
      expect(porposalInfo.isDone).to.equal(false);
      expect(await stakingContract.unstakeTimeout()).to.equal(1200);
      const balance: BigNumber = await addresses[4].getBalance();
      await dao.finishProposal(proposalId);

      const newBalance: BigNumber = await addresses[4].getBalance();
      expect(parseFloat(ethers.utils.formatEther(newBalance.sub(balance)))).to.be.greaterThan(0);
  
      porposalInfo = await dao.getProposalInfo(proposalId);
      expect(porposalInfo.isDone).to.equal(true);
    });

    it("should follow workflow of the acdm platform and burn tokens", async function () {
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0xc862eBB2Edabae0349DDF99970E825F2D2ce969F"],
      });

      const newtopToken = await ethers.getContractAt("TopToken", "0xf4c9F477e6349E0f3A5De182D3338a8A9bcD9BEF");

      acdmPlatform = await acdmPlatformFactory.deploy(acdmToken.address, newtopToken.address, dao.address, roundDuration);
      await acdmToken.setPlatform(acdmPlatform.address);
      const ownerOfContract: Signer = await ethers.getSigner("0xc862eBB2Edabae0349DDF99970E825F2D2ce969F");
      await newtopToken.connect(ownerOfContract).setPlatrformContract(acdmPlatform.address);

      await acdmPlatform.connect(addresses[3]).register(emptyAddress);
      await acdmPlatform.connect(addresses[2]).register(emptyAddress);
      await acdmPlatform.connect(addresses[1]).register(emptyAddress);
      await acdmPlatform.connect(owner).register(emptyAddress);

      // first round
      // sell round
      const acdmDecimals: number = 10 ** 6;
      await acdmPlatform.startSellRound();
      const firstVolume: BigNumber = BigNumber.from("1000000000000000000");
      const firstRoundPrice: number = lastTokenPrice;
      const firstSellRoundAmount: BigNumber = firstVolume.div(firstRoundPrice).mul(acdmDecimals);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(firstSellRoundAmount);

      await acdmPlatform.buyACDM({value: firstSellRoundAmount.div(2).div(acdmDecimals).mul(lastTokenPrice)  });
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(firstSellRoundAmount.div(2));
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(firstSellRoundAmount.div(2));

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      
      // trade round
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(firstSellRoundAmount.div(2));

      const firstTradeRoundPrice: number = firstRoundPrice;
      const firstTradeRoundVolume: number = firstSellRoundAmount.div(2).toNumber();
      await acdmToken.connect(owner).approve(acdmPlatform.address, firstTradeRoundVolume);
      await acdmPlatform.addOrder(firstTradeRoundPrice, firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(0);

      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(0);
      let ethValue: BigNumber = BigNumber.from(firstTradeRoundVolume).div(acdmDecimals).mul(firstTradeRoundPrice);
      await acdmPlatform.connect(addresses[1]).redeemOrder(0, {value: ethValue });
      expect(await acdmToken.balanceOf(addresses[1].getAddress())).to.equal(firstTradeRoundVolume);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);

      // second round
      // sell round
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      await acdmPlatform.startSellRound();
      const secondVolume: BigNumber = ethValue;
      const secondRoundPrice: number = firstRoundPrice * 103/100 + 0.000004 * 10**18;
      const secondSellRoundAmount: BigNumber = secondVolume.mul(acdmDecimals).div(secondRoundPrice);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(secondSellRoundAmount);

      await acdmPlatform.buyACDM({value: secondSellRoundAmount.mul(secondRoundPrice).div(acdmDecimals)  });
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(secondSellRoundAmount);

      // trade round
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(secondSellRoundAmount);

      const secondTradeRoundPriceFirstOrder: BigNumber = BigNumber.from(secondRoundPrice);
      const secondTradeRoundVolumeFirstOrder: BigNumber = secondSellRoundAmount.div(2);
      const secondTradeRoundPriceSecondOrder: BigNumber = BigNumber.from(secondRoundPrice).mul(11).div(10);
      const secondTradeRoundVolumeSecondOrder: BigNumber = secondSellRoundAmount.div(2);
      await acdmToken.connect(owner).approve(acdmPlatform.address, secondSellRoundAmount);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
      await acdmPlatform.addOrder(secondTradeRoundPriceFirstOrder, secondTradeRoundVolumeFirstOrder);
      await acdmPlatform.addOrder(secondTradeRoundPriceSecondOrder, secondTradeRoundVolumeSecondOrder);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(secondTradeRoundVolumeFirstOrder.add(secondTradeRoundVolumeSecondOrder));
      expect(await acdmToken.balanceOf(owner.getAddress())).to.equal(secondSellRoundAmount.sub(secondTradeRoundVolumeFirstOrder.add(secondTradeRoundVolumeSecondOrder)));

      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(0);
      ethValue = BigNumber.from(secondTradeRoundVolumeSecondOrder).mul(secondTradeRoundPriceSecondOrder).div(acdmDecimals);
      await acdmPlatform.connect(addresses[2]).redeemOrder(2, {value: ethValue });
      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(secondTradeRoundVolumeSecondOrder);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(secondTradeRoundVolumeFirstOrder);

      await network.provider.send("evm_increaseTime", [roundDuration + 1]);

      // third round
      // sell round
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      await acdmPlatform.startSellRound();
      const thirdVolume: BigNumber = ethValue;
      const thirdRoundPrice: number = secondRoundPrice * 103/100 + 0.000004 * 10**18;
      const thirdSellRoundAmount: BigNumber = thirdVolume.mul(acdmDecimals).div(thirdRoundPrice);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(thirdSellRoundAmount);
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(secondTradeRoundVolumeFirstOrder);
      
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);
      
      // trade round
      await acdmPlatform.startTradeRound();
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      expect(await acdmToken.balanceOf(await owner.getAddress())).to.equal(1);
      
      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(secondTradeRoundVolumeSecondOrder);
      ethValue = BigNumber.from(secondTradeRoundVolumeFirstOrder).mul(secondTradeRoundPriceFirstOrder).div(acdmDecimals);
      await acdmPlatform.connect(addresses[2]).redeemOrder(1, {value: ethValue });
      expect(await acdmToken.balanceOf(addresses[2].getAddress())).to.equal(secondTradeRoundVolumeSecondOrder.add(secondTradeRoundVolumeFirstOrder));
      expect(await acdmToken.balanceOf(acdmPlatform.address)).to.equal(0);
      
      await network.provider.send("evm_increaseTime", [roundDuration + 1]);

      // fourth round
      // sell round
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(0);
      await acdmPlatform.startSellRound();
      const fourthVolume: BigNumber = ethValue;
      const fourthRoundPrice: number = thirdRoundPrice * 103/100 + 0.000004 * 10**18;
      const fourthSellRoundAmount: BigNumber = fourthVolume.mul(acdmDecimals).div(fourthRoundPrice);
      expect(await acdmToken.balanceOf(acdmToken.address)).to.equal(fourthSellRoundAmount);

      // dao part
      const amount = 100;
      await lpToken.approve(dao.address, amount);
      await lpToken.approve(stakingContract.address, amount);
      await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));
  
      await dao.addProposal(getCallDataBurnTokens("0x9a7C19985a5CF3B874118b39A587618Ee6805102"), acdmPlatform.address, "new proposal");
      const proposalId: number = 1;
      await dao.vote(proposalId, true);
      await network.provider.send("evm_increaseTime", [10]);
      let porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
      expect(porposalInfo.isDone).to.equal(false);
      await dao.finishProposal(proposalId);
      porposalInfo = await dao.getProposalInfo(proposalId);
      expect(porposalInfo.isDone).to.equal(true);
    });

    it("should throw exception on sending commission if it isn't dao", async function () {
      try {
        expect(await acdmPlatform.sendCommission(addresses[1].getAddress())).to.throw();
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : "").to.have.string("Only the dao platform can perform this operation");
      }
    });
});

describe("Staking", function () {
  let owner: Signer;
  let addresses: Signer[];
  let tokensFactory: ContractFactory;
  let stakingFactory: ContractFactory;
  let daoFactory: ContractFactory;
  let rewardsToken: Contract;
  let lpToken: Contract;
  let stakingContract: Contract;
  let dao: Contract;
  const minimumQuorum: number = 1;
  const newMinimumQuorum: number = 10;
  const debatingDuration: number = 5;
  let merkleTree: MerkleTree;
  let merkleRoot: string;
  
  beforeEach(async function () {
    [owner, ...addresses] = await ethers.getSigners();
    tokensFactory = await ethers.getContractFactory('TopToken');
    rewardsToken = await tokensFactory.connect(addresses[1]).deploy();
    lpToken = await tokensFactory.deploy();
    merkleTree = new MerkleTree(hashedLeafs, keccak256, {sortPairs: true});
    merkleRoot = "0x" + merkleTree.getRoot().toString('hex');
    stakingFactory = await ethers.getContractFactory('Staking');
    stakingContract = await stakingFactory.deploy(rewardsToken.address, lpToken.address, merkleRoot);

    daoFactory = await ethers.getContractFactory('Dao');
    dao = await daoFactory.deploy(await owner.getAddress(), lpToken.address, stakingContract.address, minimumQuorum, debatingDuration);
    stakingContract.initDao(dao.address);
  });

  it("should get default settings", async function () {
    expect(await stakingContract.unstakeTimeout()).to.equal(1200);
  });

  it("Should throw an exception if a non-dao platform address tries to change staking settings", async function () {
    try {
      expect(await stakingContract.connect(addresses[1]).changeSettings(1)
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Only the dao platform can perform this operation");
    }
  });

  it("should stake lp tokens", async function () {
    const tokensAmount = 10;
    await lpToken.approve(stakingContract.address, tokensAmount + 1);
    expect(await lpToken.allowance(owner.getAddress(), stakingContract.address)).to.equal(tokensAmount + 1);

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);
    const from = owner.getAddress();
    const to = stakingContract.address;
    const balance: BigNumber = await lpToken.balanceOf(from);

    await stakingContract.stake(tokensAmount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(tokensAmount);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).not.to.equal(0);

    await stakingContract.stake(1, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(1 + tokensAmount);

    expect(await lpToken.balanceOf(from)).to.equal(balance.sub(tokensAmount + 1));
    expect(await lpToken.balanceOf(to)).to.equal(tokensAmount + 1);
  });

  it("Should throw an exception if the address isn't on the whitelist", async function () {
    const tokensAmount = 10;
    await lpToken.approve(stakingContract.address, tokensAmount + 1);
    expect(await lpToken.allowance(owner.getAddress(), stakingContract.address)).to.equal(tokensAmount + 1);

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);

    try {
      expect(await stakingContract.connect(addresses[7]).stake(tokensAmount, merkleTree.getHexProof(keccak256(await owner.getAddress())))
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Not on the whitelist");
    }
  });

  it("should set a new merkle root", async function () {
    const tokensAmount = 10;
    await lpToken.approve(stakingContract.address, tokensAmount + 1);
    expect(await lpToken.allowance(owner.getAddress(), stakingContract.address)).to.equal(tokensAmount + 1);
    
    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);

    // dao part
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount/2, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await lpToken.connect(owner).transfer(addresses[7].getAddress(), amount);
    await lpToken.connect(addresses[7]).approve(dao.address, amount);
    await lpToken.connect(addresses[7]).approve(stakingContract.address, amount);

    const newHashedLeafs: string[] = [
      keccak256(`${await addresses[7].getAddress()}`),
    ];
    
    merkleTree = new MerkleTree(newHashedLeafs, keccak256, {sortPairs: true});
    merkleRoot = "0x" + merkleTree.getRoot().toString('hex');

    await dao.addProposal(getCallDataChangeRoot(merkleRoot), stakingContract.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, true);
    await network.provider.send("evm_increaseTime", [10]);
    let porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(false);
    expect(await stakingContract.unstakeTimeout()).to.equal(1200);

    await dao.finishProposal(proposalId);

    await stakingContract.connect(addresses[7]).stake(1, merkleTree.getHexProof(keccak256(await addresses[7].getAddress())));

    porposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(true);
  });

  it("should throw an exception on changing a merkle root if it isn't dao address", async function () {
    try {
      expect(await stakingContract.connect(owner).changeRoot(merkleRoot)
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Only the dao platform can perform this operation");
    }
  });

  it("should unstake lp tokens", async function () {
    const tokensAmount = 10;
    await lpToken.approve(stakingContract.address, tokensAmount);
    expect(await lpToken.allowance(owner.getAddress(), stakingContract.address)).to.equal(tokensAmount);
    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);

    const from = owner.getAddress();
    const to = stakingContract.address;
    const balance: BigNumber = await lpToken.balanceOf(from);

    await stakingContract.stake(tokensAmount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(tokensAmount);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).not.to.equal(0);
    expect(await lpToken.balanceOf(from)).to.equal(balance.sub(tokensAmount));
    expect(await lpToken.balanceOf(to)).to.equal(tokensAmount);

    await network.provider.send("evm_increaseTime", [1200]);

    await stakingContract.unstake();

    expect(await lpToken.balanceOf(from)).to.equal(balance);
    expect(await lpToken.balanceOf(to)).to.equal(0);
    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);
  });

  it("Should throw an exception on unstaking if nothing to unstake", async function () {
    try {
      expect(await stakingContract.unstake()
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Nothing to unstake");
    }
  });

  it("Should throw an exception on unstaking if unstake timeout has not expired yet", async function () {
      const tokensAmount = 10;
      await lpToken.approve(stakingContract.address, tokensAmount + 1);
      expect(await lpToken.allowance(owner.getAddress(), stakingContract.address)).to.equal(tokensAmount + 1);

      expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
      expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);

      await stakingContract.stake(1, merkleTree.getHexProof(keccak256(await owner.getAddress())));
    try {
      expect(await stakingContract.unstake()
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Unstake timeout has not expired yet");
    }
  });

  it("Should throw an exception on unstaking if user is still in ongoing dao polls", async function () {
    const tokensAmount = 10;
    await lpToken.approve(stakingContract.address, tokensAmount);
    await stakingContract.connect(owner).stake(tokensAmount, merkleTree.getHexProof(keccak256(await owner.getAddress())));
    
    // dao proposal
    const amount = 100;
    await lpToken.approve(dao.address, amount);

    dao = await daoFactory.deploy(await owner.getAddress(), lpToken.address, stakingContract.address, minimumQuorum, 2200);
    stakingContract.initDao(dao.address);

    await dao.connect(owner).addProposal(getCallData(newMinimumQuorum), dao.address, "new proposal");
    const proposalId: number = 1;
    await dao.connect(owner).vote(proposalId, true);
    await network.provider.send("evm_increaseTime", [1200]);

    try {
      expect(await stakingContract.connect(owner).unstake()
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("User is still in ongoing dao polls");
    }
  });

  it("should claim rewards tokens", async function () {
    const from = stakingContract.address;
    const to = owner.getAddress();
    await rewardsToken.transfer(from, 1000000000);
    const rewardTokenBalance = await rewardsToken.balanceOf(from);
    const lpTokensAmount = 100;

    await lpToken.approve(stakingContract.address, lpTokensAmount);
    expect(await lpToken.allowance(owner.getAddress(), stakingContract.address)).to.equal(lpTokensAmount);

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);

    await stakingContract.stake(lpTokensAmount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(lpTokensAmount);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).not.to.equal(0);

    expect(await rewardsToken.balanceOf(from)).to.equal(rewardTokenBalance);
    expect(await rewardsToken.balanceOf(to)).to.equal(0);

    await network.provider.send("evm_increaseTime", [60*60*24*7]);

    await stakingContract.claim();

    let reward = 1 * lpTokensAmount * 3 / 100;

    expect(await rewardsToken.balanceOf(from)).to.equal(rewardTokenBalance - reward);
    expect(await rewardsToken.balanceOf(to)).to.equal(reward);

    await network.provider.send("evm_increaseTime", [60*60*24*7]);

    reward = 2 * lpTokensAmount * 3 / 100;
    await stakingContract.claim();

    expect(await rewardsToken.balanceOf(from)).to.equal(rewardTokenBalance - reward);
    expect(await rewardsToken.balanceOf(to)).to.equal(reward);
  });

  it("Should throw an exception if nothing to claim", async function () {
    try {
      expect(await stakingContract.claim()
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Nothing to claim");
    }
  });

  it("Should throw an exception if there is an insufficient reward", async function () {
    const from = stakingContract.address;
    const to = owner.getAddress();
    await rewardsToken.transfer(from, 1000000000);
    const rewardTokenBalance = await rewardsToken.balanceOf(from);
    const lpTokensAmount = 100;

    await lpToken.approve(stakingContract.address, lpTokensAmount);
    expect(await lpToken.allowance(owner.getAddress(), stakingContract.address)).to.equal(lpTokensAmount);

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(0);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).to.equal(0);

    await stakingContract.stake(lpTokensAmount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    expect(await stakingContract.getStakingAmount(owner.getAddress())).to.equal(lpTokensAmount);
    expect(await stakingContract.getStakingTimestamp(owner.getAddress())).not.to.equal(0);

    expect(await rewardsToken.balanceOf(from)).to.equal(rewardTokenBalance);
    expect(await rewardsToken.balanceOf(to)).to.equal(0);

    try {
      expect(await stakingContract.claim()).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Insufficient reward");
    }
  });

  it("Should init dao address to staking contract", async function () {
    await stakingContract.initDao(dao.address);
  });

  it("Should throw an exception on setting dao contract address if it's non-owner", async function () {
    try {
      expect(await stakingContract.connect(addresses[2]).initDao(owner.getAddress())
      ).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Only the owner of the contract can perform this operation");
    }
  });
});

interface ProposalInfo {
  signature: string,
  recipient: string,
  description: string,
  votesFor: number,
  votesAgainst: number,
  startDateTimestamp: number,
  isDone: boolean
}

describe("Dao", function () {
  const name: string = "Test Coin";
  const symbol: string = "Test Coin";
  const decimals: number = 2;
  const totalSupply: number = 100;
  const minimumQuorum: number = 1;
  const newMinimumQuorum: number = 10;
  const debatingDuration: number = 5;
  let owner: Signer;
  let addresses: Signer[];
  let erc20Factory: ContractFactory;
  let daoFactory: ContractFactory;
  let stakingFactory: ContractFactory;
  let dao: Contract;
  let lpToken: Contract;
  let rewardsToken: Contract;
  let stakingContract: Contract;
  let merkleTree: MerkleTree = new MerkleTree(hashedLeafs, keccak256, {sortPairs: true});
  let merkleRoot: string = "0x" + merkleTree.getRoot().toString('hex');

  beforeEach(async function () {
    [owner, ...addresses] = await ethers.getSigners();
    erc20Factory = await ethers.getContractFactory('TopToken');
    lpToken = await erc20Factory.connect(owner).deploy();
    rewardsToken = await erc20Factory.connect(owner).deploy();

    stakingFactory = await ethers.getContractFactory('Staking');
    stakingContract = await stakingFactory.deploy(rewardsToken.address, lpToken.address, merkleRoot);

    daoFactory = await ethers.getContractFactory('Dao');
    dao = await daoFactory.deploy(await owner.getAddress(), lpToken.address, stakingContract.address, minimumQuorum, debatingDuration);

    await stakingContract.initDao(dao.address);
  });

  it("should get expected info", async function () {
    expect(await dao.getChairman()).to.equal(await owner.getAddress());
    expect(await dao.getVoteToken()).to.equal(lpToken.address);
    expect(await dao.getStakingContract()).to.equal(stakingContract.address);
    expect(await dao.getMinimumQuorum()).to.equal(minimumQuorum);
    expect(await dao.getDebatingPeriodDurationSec()).to.equal(debatingDuration);
    expect(await dao.getProposalCount()).to.equal(1);
  });

  it("should add a new proposal", async function () {
    expect(await dao.getProposalCount()).to.equal(1);
    const signature: string = getCallData(newMinimumQuorum);
    const recipientAddress: string = dao.address;
    const description: string = "new proposal";
    await dao.addProposal(signature, recipientAddress, description);
    expect(await dao.getProposalCount()).to.equal(2);
    const porposalInfo: ProposalInfo  =  await dao.getProposalInfo(1);
    expect(porposalInfo.signature).to.equal(signature);
    expect(porposalInfo.recipient).to.equal(recipientAddress);
    expect(porposalInfo.description).to.equal(description);
  });

  it("should throw an exception if it isn't owner", async function () {
    expect(await dao.getProposalCount()).to.equal(1);
    const signature: string = getCallData(newMinimumQuorum);
    const recipientAddress: string = dao.address;
    const description: string = "new proposal";

    try {
      expect(await dao.connect(addresses[1]).addProposal(signature, recipientAddress, description)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Only the chairman of the dao contract can perform this operation");
    }
  });

  it("should vote for a proposal", async function () {
    const amount = 100;
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await lpToken.approve(dao.address, amount);
    await dao.addProposal(getCallData(newMinimumQuorum), dao.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, true);
    const porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.votesFor).to.equal(amount);
    expect(porposalInfo.votesAgainst).to.equal(0);
  });

  it("should vote for multiple proposals", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallData(newMinimumQuorum), dao.address, "proposal");
    const proposalId: number = 1;
    const anotherProposalId: number = 2;
    await dao.addProposal(getCallData(newMinimumQuorum), dao.address, "new proposal");

    await dao.vote(anotherProposalId, true);
    await dao.vote(proposalId, true);

    const porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.votesFor).to.equal(amount);
    expect(porposalInfo.votesAgainst).to.equal(0);

    const anotherPorposalInfo: ProposalInfo = await dao.getProposalInfo(anotherProposalId);
    expect(anotherPorposalInfo.votesFor).to.equal(amount);
    expect(anotherPorposalInfo.votesAgainst).to.equal(0);
  });

  it("should vote against a proposal", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallData(newMinimumQuorum), dao.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, false);
    const porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.votesFor).to.equal(0);
    expect(porposalInfo.votesAgainst).to.equal(amount);
  });

  it("should return last proposal end time", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallData(newMinimumQuorum), dao.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, false);
    const timestamp = await dao.getLastProposalEndTimeTimestamp(owner.getAddress());
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;
    expect(timestamp - timestampBefore).lessThan(10);
  });

  it("should throw an exception if the user doesn't have tokens to vote", async function () {
    await dao.addProposal(getCallData(newMinimumQuorum), dao.address, "new proposal");
    const proposalId: number = 1;
      
    try {
      expect(await dao.vote(proposalId, true)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("The user doesn't have tokens to vote");
    }
  });

  it("should throw an exception if the voter has already voted", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallData(newMinimumQuorum), dao.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, true);
      
    try {
      expect(await dao.vote(proposalId, true)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("The voter has already voted");
    }
  });
  
  it("should throw an exception if the proposal has been already done", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallDataUnstakeTimeout(10), stakingContract.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, true);
    await network.provider.send("evm_increaseTime", [10]);

    await dao.finishProposal(proposalId);

    await lpToken.connect(owner).transfer(addresses[1].getAddress(), amount);
    await lpToken.connect(addresses[1]).approve(dao.address, amount);

    await lpToken.connect(addresses[1]).approve(stakingContract.address, amount);
    await stakingContract.connect(addresses[1]).stake(amount, merkleTree.getHexProof(keccak256(await addresses[1].getAddress())));
      
    try {
      expect(await dao.connect(addresses[1]).vote(proposalId, true)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("The proposal has been already done");
    }
  });

  it("should successfuly finish a proposal poll", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallDataUnstakeTimeout(10), stakingContract.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, true);
    await network.provider.send("evm_increaseTime", [10]);
    let porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(false);
    expect(await stakingContract.unstakeTimeout()).to.equal(1200);
    await dao.finishProposal(proposalId);

    expect(await stakingContract.unstakeTimeout()).to.equal(10*60*60*24);

    porposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(true);
  });

  it("should unsuccessfuly finish a proposal poll", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallDataUnstakeTimeout(10), stakingContract.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, false);
    await network.provider.send("evm_increaseTime", [10]);
    let porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(false);

    await dao.finishProposal(proposalId);

    porposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(true);
  });
  
  it("should throw an exception on finishing if the proposal has been already done", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallDataUnstakeTimeout(10), stakingContract.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, false);
    await network.provider.send("evm_increaseTime", [10]);
    let porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(false);
    await dao.finishProposal(proposalId);
      
    try {
      expect(await dao.finishProposal(proposalId)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("The proposal has been already done");
    }
  });

  it("should throw an exception on finishing if there is unsuccessful function call", async function () {
    const amount = 100;
    await lpToken.approve(dao.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await dao.addProposal(getCallData(10), dao.address, "new proposal");
    const proposalId: number = 1;
    await dao.vote(proposalId, true);
    await network.provider.send("evm_increaseTime", [10]);
    let porposalInfo: ProposalInfo = await dao.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(false);
    expect(await stakingContract.unstakeTimeout()).to.equal(1200);
      
    try {
      expect(await dao.finishProposal(proposalId)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Unsuccessful function call");
    }
  });

  it("should throw an exception on finishing if there isn't enough votes", async function () {
    const amount = 1;
    const anotherMinimumQuorum = 10;
    const anotherDaoPoll: Contract = await daoFactory.deploy(await owner.getAddress(), lpToken.address, stakingContract.address, anotherMinimumQuorum, debatingDuration);
    await lpToken.approve(anotherDaoPoll.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await anotherDaoPoll.addProposal(getCallDataUnstakeTimeout(10), stakingContract.address, "new proposal");
    const proposalId: number = 1;
    await anotherDaoPoll.vote(proposalId, false);
    await network.provider.send("evm_increaseTime", [10]);
    let porposalInfo: ProposalInfo = await anotherDaoPoll.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(false);

    try {
      expect(await anotherDaoPoll.finishProposal(proposalId)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("Not enough votes");
    }
  });

  it("should throw an exception on finishing if the poll hasn't finished yet", async function () {
    const amount = 100;
    const anotherDebatingDuration = 10;
    const anotherDaoPoll: Contract = await daoFactory.deploy(await owner.getAddress(), lpToken.address, stakingContract.address, minimumQuorum, anotherDebatingDuration);
    await lpToken.approve(anotherDaoPoll.address, amount);
    await lpToken.approve(stakingContract.address, amount);
    await stakingContract.connect(owner).stake(amount, merkleTree.getHexProof(keccak256(await owner.getAddress())));

    await anotherDaoPoll.addProposal(getCallDataUnstakeTimeout(10), stakingContract.address, "new proposal");
    const proposalId: number = 1;
    await anotherDaoPoll.vote(proposalId, false);
    let porposalInfo: ProposalInfo = await anotherDaoPoll.getProposalInfo(proposalId);
    expect(porposalInfo.isDone).to.equal(false);

    try {
      expect(await anotherDaoPoll.finishProposal(proposalId)).to.throw();
    } catch (error: unknown) {
      expect(error instanceof Error ? error.message : "").to.have.string("The poll hasn't finished yet");
    }
  });
})

function getCallData(newQuorum: number): string {
  const iface: Interface = new ethers.utils.Interface([{"inputs": [
    {
      "internalType": "uint256",
      "name": "amount",
      "type": "uint256"
    }
  ],
  "name": "setMinimumQuorum",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"}]);
  return iface.encodeFunctionData('setMinimumQuorum', [newQuorum]);
}

function getCallDataUnstakeTimeout(unstakeTimeoutDays: number): string {
  const iface: Interface = new ethers.utils.Interface([{"inputs": [
    {
      "internalType": "uint256",
      "name": "unstakeTimeoutDays",
      "type": "uint256"
    }
  ],
  "name": "changeSettings",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"}]);
  return iface.encodeFunctionData('changeSettings', [unstakeTimeoutDays]);
}

function getCallDataSendCommission(addressTo: string): string {
  const iface: Interface = new ethers.utils.Interface([{ "inputs": [
    {
      "internalType": "address",
      "name": "to",
      "type": "address"
    }
  ],
  "name": "sendCommission",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"}]);
  return iface.encodeFunctionData('sendCommission', [addressTo]);
}

function getCallDataBurnTokens(pair: string): string {
  const iface: Interface = new ethers.utils.Interface([{ "inputs": [
    {
      "internalType": "address",
      "name": "pair",
      "type": "address"
    }
  ],
  "name": "burnTokens",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"}]);
  return iface.encodeFunctionData('burnTokens', [pair]);
}

function getCallDataChangeRoot(newRoot: string): string {
  const iface: Interface = new ethers.utils.Interface([{ "inputs": [
    {
      "internalType": "bytes32",
      "name": "merkleRoot",
      "type": "bytes32"
    }
  ],
  "name": "changeRoot",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"}]);
  return iface.encodeFunctionData('changeRoot', [newRoot]);
}