// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal subset of Mezo MUSD protocol interfaces used by RePay.
/// Signatures verified against mezo-org/musd @ de1ec2af and the Mezo testnet deployment.

interface IBorrowerOperations {
    function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) external payable;

    function addColl(address _upperHint, address _lowerHint) external payable;

    function withdrawColl(uint256 _amount, address _upperHint, address _lowerHint) external;

    function withdrawMUSD(uint256 _amount, address _upperHint, address _lowerHint) external;

    function repayMUSD(uint256 _amount, address _upperHint, address _lowerHint) external;

    function closeTrove() external;

    function claimCollateral() external;

    function minNetDebt() external view returns (uint256);

    function getBorrowingFee(uint256 _debt) external view returns (uint256);

    function musd() external view returns (address);
}

interface ITroveManager {
    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

    function getEntireDebtAndColl(address _borrower)
        external
        view
        returns (
            uint256 coll,
            uint256 principal,
            uint256 interest,
            uint256 pendingCollateral,
            uint256 pendingPrincipal,
            uint256 pendingInterest
        );

    function getTroveStatus(address _borrower) external view returns (Status);

    function MUSD_GAS_COMPENSATION() external view returns (uint256);
}

interface ICollSurplusPool {
    function getCollateral(address _account) external view returns (uint256);
}
