// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * Kickpact demo stablecoin — the kUSD that pools are staked in. 6 decimals to
 * match the Solana kUSD SPL mint. Open faucet, testnet only: anyone mints up to
 * 1,000 kUSD per call so the app works out of the box.
 */
contract KUSD is ERC20 {
    /// Faucet cap per call: 1,000 kUSD.
    uint256 public constant FAUCET_CAP = 1_000 * 1e6;

    error FaucetCap();

    constructor() ERC20("Kickpact USD", "kUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// Testnet faucet — mint up to 1,000 kUSD to yourself, no auth.
    function faucet(uint256 amount) external {
        if (amount == 0 || amount > FAUCET_CAP) revert FaucetCap();
        _mint(msg.sender, amount);
    }
}
