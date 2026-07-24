// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * Kickpact demo stablecoin — the kUSD that pools are staked in. 6 decimals to
 * match the Solana kUSD SPL mint. Open faucet, testnet only: anyone mints up to
 * 1,000 kUSD per call so the app works out of the box.
 *
 * It also implements **EIP-3009 `transferWithAuthorization`**, the gasless
 * transfer standard USDC uses and the one the x402 "exact" payment scheme is
 * built on. The payer signs an authorization off-chain (no gas, no prior
 * approval); anyone — here, the attestation server acting as its own
 * facilitator — submits it and pays the gas. That is what lets
 * `apps/injective/attestor` actually MOVE money when it sells an attestation,
 * rather than merely inspecting a signature.
 *
 * Native USDC on Injective supports the same standard, so the attestor's
 * payment path is identical against real USDC — only the asset address changes.
 */
contract KUSD is ERC20, EIP712 {
    /// Faucet cap per call: 1,000 kUSD.
    uint256 public constant FAUCET_CAP = 1_000 * 1e6;

    /// EIP-3009.
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    /// authorizer → nonce → used. A nonce can only ever be spent once.
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    error FaucetCap();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationAlreadyUsed();
    error InvalidSignature();

    constructor() ERC20("Kickpact USD", "kUSD") EIP712("Kickpact USD", "1") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// Testnet faucet — mint up to 1,000 kUSD to yourself, no auth.
    function faucet(uint256 amount) external {
        if (amount == 0 || amount > FAUCET_CAP) revert FaucetCap();
        _mint(msg.sender, amount);
    }

    /// The EIP-712 domain separator, exposed for off-chain signers.
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * EIP-3009: execute a transfer the payer authorized off-chain. The caller
     * pays the gas and can be anyone — the payer never needs INJ, and never
     * needs a prior `approve`. This is the primitive the x402 "exact" scheme
     * settles with.
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationAlreadyUsed();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
            )
        );
        if (ECDSA.recover(digest, signature) != from) revert InvalidSignature();

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    /// EIP-3009: burn an unused nonce so a signed authorization can't be spent.
    function cancelAuthorization(address authorizer, bytes32 nonce, bytes calldata signature) external {
        if (authorizationState[authorizer][nonce]) revert AuthorizationAlreadyUsed();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)));
        if (ECDSA.recover(digest, signature) != authorizer) revert InvalidSignature();
        authorizationState[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }
}
