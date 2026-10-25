// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RePayAccountFactory} from "../src/RePayAccountFactory.sol";
import {IBorrowerOperations} from "../src/interfaces/IMezo.sol";
import {MezoTestnet} from "./MezoTestnet.sol";

/// @notice Deploys RePayAccountFactory (and its RePayAccount implementation) to Mezo testnet.
/// forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (RePayAccountFactory factory) {
        require(block.chainid == MezoTestnet.CHAIN_ID, "Deploy: Mezo testnet only");
        require(
            IBorrowerOperations(MezoTestnet.BORROWER_OPERATIONS).musd() == MezoTestnet.MUSD,
            "Deploy: MUSD mismatch"
        );
        vm.startBroadcast();
        factory = new RePayAccountFactory(
            MezoTestnet.BORROWER_OPERATIONS, MezoTestnet.TROVE_MANAGER, MezoTestnet.COLL_SURPLUS_POOL
        );
        vm.stopBroadcast();
        console2.log("RePayAccountFactory", address(factory));
        console2.log("RePayAccount implementation", factory.implementation());
    }
}
