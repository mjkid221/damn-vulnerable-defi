const fs = require("fs");

/**
 * Transaction Hashes fetched from etherscan based on the hardcoded Gnosis Safe and Proxy Factory deployment addresses.
 */
const GNOSIS_PROXY_FACTORY_DEPLOY_TXHASH =
  "0x75a42f240d229518979199f56cd7c82e4fc1f1a20ad9a4864c635354b4a34261";
const GNOSIS_SAFE_SINGLETON_DEPLOY_TXHASH =
  "0x06d2fa464546e99d2147e1fc997ddb624cec9c8c5e25a050cc381ee8a384eed3";

// This is a random tx that the gnosis deployer address performed. I have added this so that we can manipulate the nonce of the deployer address.
const RANDOM_GNOSIS_DEPLOYER_TX =
  "0x31ae8a26075d0f18b81d3abe2ad8aeca8816c97aff87728f2b10af0241e9b3d4";

/**
 * Address of the Gnosis Safe and Proxy Factory deployer.
 */
const GNOSIS_DEPLOYER_ADDRESS = "0x1aa7451DD11b8cb16AC089ED7fE05eFa00100A6A";

const TX_HASHES = {
  GNOSIS_PROXY_FACTORY_DEPLOY_TX: GNOSIS_PROXY_FACTORY_DEPLOY_TXHASH,
  GNOSIS_SAFE_SINGLETON_DEPLOY_TX: GNOSIS_SAFE_SINGLETON_DEPLOY_TXHASH,
  RANDOM_GNOSIS_DEPLOYER_TX: RANDOM_GNOSIS_DEPLOYER_TX,
};

/**
 * Fetches the transactions from etherscan and serializes them for use in the challenge.
 * Outputs the serialized transactions to `./test/wallet-mining/serializedTransactionPayload.json`.
 */
async function main() {
  let serializedTransactions = {};

  for (const [name, txHash] of Object.entries(TX_HASHES)) {
    const tx = await ethers.provider.getTransaction(txHash);
    const unsignedTx = {
      to: tx.to,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice,
      data: tx.data,
      value: tx.value,
      chainId: tx.chainId,
    };

    const signature = {
      v: tx.v,
      r: tx.r,
      s: tx.s,
    };
    const serialized = ethers.utils.serializeTransaction(unsignedTx, signature);
    serializedTransactions[name] = serialized;
  }

  serializedTransactions = {
    ...serializedTransactions,
    GNOSIS_DEPLOYER_ADDRESS,
  };

  fs.writeFileSync(
    "./test/wallet-mining/serializedTransactionPayload.json",
    JSON.stringify(serializedTransactions, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
