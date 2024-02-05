require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-dependency-compiler");

module.exports = {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    mainnet: {
      chainId: 1,
      // Change RPC if rate limited. This is purely used for testing.
      url: `https://rpc.ankr.com/eth`,
    },
  },
  solidity: {
    compilers: [
      { version: "0.8.16" },
      { version: "0.7.6" },
      { version: "0.6.6" },
    ],
  },
  dependencyCompiler: {
    paths: [
      "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol",
      "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol",
      "solmate/src/tokens/WETH.sol",
    ],
  },
};
