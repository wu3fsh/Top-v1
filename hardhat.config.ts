import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import "dotenv/config";
import "./tasks/add-proposal";
import "./tasks/add";
import "./tasks/buy-acmd";
import "./tasks/claim";
import "./tasks/finish";
import "./tasks/redeem";
import "./tasks/register";
import "./tasks/remove";
import "./tasks/sell";
import "./tasks/stake";
import "./tasks/trade";
import "./tasks/unstake";
import "./tasks/vote";
import "./tasks/encode";

module.exports = {
  solidity: "0.8.4",
  networks: {
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${process.env.RINKEBY_PRIVATE_KEY}`, `${process.env.RINKEBY_PRIVATE_KEY_SECOND_ACC}`],
      gas: 5000_000,
    },
    hardhat: {
      forking: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${process.env.RINKEBY_PRIVATE_KEY}`, `${process.env.RINKEBY_PRIVATE_KEY_SECOND_ACC}`],
      blockNumber: 10947854
      }
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};
