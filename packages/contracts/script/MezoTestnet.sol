// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Mezo testnet (chain 31611) MUSD system addresses.
/// Source: mezo-org/musd @ de1ec2af solidity/artifacts/deployments/matsnet, verified on-chain 2026-10-25.
library MezoTestnet {
    uint256 internal constant CHAIN_ID = 31611;
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BORROWER_OPERATIONS = 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5;
    address internal constant TROVE_MANAGER = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;
    address internal constant HINT_HELPERS = 0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6;
    address internal constant SORTED_TROVES = 0x722E4D24FD6Ff8b0AC679450F3D91294607268fA;
    address internal constant PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address internal constant COLL_SURPLUS_POOL = 0xB4C35747c26E4aB5F1a7CdC7E875B5946eFa6fa9;
}
