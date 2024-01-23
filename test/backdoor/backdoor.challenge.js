const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("[Challenge] Backdoor", function () {
  let deployer, users, player;
  let masterCopy, walletFactory, token, walletRegistry;

  const AMOUNT_TOKENS_DISTRIBUTED = 40n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, alice, bob, charlie, david, player] = await ethers.getSigners();
    users = [alice.address, bob.address, charlie.address, david.address];

    // Deploy Gnosis Safe master copy and factory contracts
    masterCopy = await (
      await ethers.getContractFactory("GnosisSafe", deployer)
    ).deploy();
    walletFactory = await (
      await ethers.getContractFactory("GnosisSafeProxyFactory", deployer)
    ).deploy();
    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();

    // Deploy the registry
    walletRegistry = await (
      await ethers.getContractFactory("WalletRegistry", deployer)
    ).deploy(masterCopy.address, walletFactory.address, token.address, users);
    expect(await walletRegistry.owner()).to.eq(deployer.address);

    for (let i = 0; i < users.length; i++) {
      // Users are registered as beneficiaries
      expect(await walletRegistry.beneficiaries(users[i])).to.be.true;

      // User cannot add beneficiaries
      await expect(
        walletRegistry
          .connect(await ethers.getSigner(users[i]))
          .addBeneficiary(users[i])
      ).to.be.revertedWithCustomError(walletRegistry, "Unauthorized");
    }

    // Transfer tokens to be distributed to the registry
    await token.transfer(walletRegistry.address, AMOUNT_TOKENS_DISTRIBUTED);
  });

  // This challenge involves identifying an open vector in the WalletRegistry contract
  // that allows an attacker to register a wallet for the beneficiaries and drain the funds
  // as the registry does not enforce the attacker themselves are the beneficiary. This allows
  // the attacker to pass in a malicious payload during the setup stage. More details in the
  // WalletRegistryAttacker contract.
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const walletRegistryAttackerFactory = await ethers.getContractFactory(
      "WalletRegistryAttacker",
      player
    );

    await walletRegistryAttackerFactory.deploy({
      masterCopy: masterCopy.address,
      token: token.address,
      proxyFactory: walletFactory.address,
      walletRegistry: walletRegistry.address,
      beneficiaries: users,
    });
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

    // Player must have used a single transaction
    expect(await ethers.provider.getTransactionCount(player.address)).to.eq(1);

    for (let i = 0; i < users.length; i++) {
      let wallet = await walletRegistry.wallets(users[i]);

      // User must have registered a wallet
      expect(wallet).to.not.eq(
        ethers.constants.AddressZero,
        "User did not register a wallet"
      );

      // User is no longer registered as a beneficiary
      expect(await walletRegistry.beneficiaries(users[i])).to.be.false;
    }

    // Player must own all tokens
    expect(await token.balanceOf(player.address)).to.eq(
      AMOUNT_TOKENS_DISTRIBUTED
    );
  });
});
