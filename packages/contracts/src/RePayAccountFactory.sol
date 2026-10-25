// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {RePayAccount} from "./RePayAccount.sol";

/// @title RePayAccountFactory
/// @notice Creates owner-controlled RePay accounts as minimal clones. The factory holds no funds
///         and has no administrator or authority over created accounts.
contract RePayAccountFactory {
    address public immutable implementation;
    address public immutable borrowerOperations;
    address public immutable troveManager;
    address public immutable collSurplusPool;

    address[] internal _accounts;
    mapping(address => address[]) internal _accountsOf;
    mapping(address => bool) public isAccount;

    event AccountCreated(address indexed owner, address indexed account, uint256 index);

    constructor(address _borrowerOperations, address _troveManager, address _collSurplusPool) {
        borrowerOperations = _borrowerOperations;
        troveManager = _troveManager;
        collSurplusPool = _collSurplusPool;
        implementation = address(new RePayAccount(address(this), _borrowerOperations, _troveManager, _collSurplusPool));
    }

    /// @notice Create an account owned by the caller. Clone creation and initialization happen in the
    ///         same call, and only this factory may initialize, so there is no initialization race.
    function createAccount(RePayAccount.Policy calldata policy) external returns (address account) {
        account = Clones.clone(implementation);
        RePayAccount(payable(account)).initialize(msg.sender, policy);
        uint256 index = _accounts.length;
        _accounts.push(account);
        _accountsOf[msg.sender].push(account);
        isAccount[account] = true;
        emit AccountCreated(msg.sender, account, index);
    }

    function accountsOf(address owner) external view returns (address[] memory) {
        return _accountsOf[owner];
    }

    function accountCount() external view returns (uint256) {
        return _accounts.length;
    }

    /// @notice Paginated discovery for keepers.
    function accountsSlice(uint256 start, uint256 count) external view returns (address[] memory page) {
        uint256 len = _accounts.length;
        if (start >= len) return new address[](0);
        uint256 end = start + count > len ? len : start + count;
        page = new address[](end - start);
        for (uint256 i = start; i < end; i++) {
            page[i - start] = _accounts[i];
        }
    }
}
