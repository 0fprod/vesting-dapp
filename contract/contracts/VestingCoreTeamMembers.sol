// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// import {console} from "hardhat/console.sol";

error Vesting__AlreadyRegistered();
error Vesting__InvalidAddress();
error Vesting__InvalidInput();
error Vesting__NotRegistered();
error Vesting__NotVestingPeriod();
error Vesting__NotAllowedAfterVestingStarted();

contract VestingTeamMember is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable Token;

    struct Beneficiary {
        uint allocation;
        uint unlockBonus;
        uint claimed;
        bool isRegistered;
        bool hasClaimedUnlockedTokens;
    }

    mapping(address => Beneficiary) public beneficiaries;

    uint public startDate;
    uint public vestingDuration;

    constructor(address _token, uint _startDate, uint _vestingDuration) {
        Token = IERC20(_token);
        startDate = _startDate;
        vestingDuration = _vestingDuration;
    }

    /**
     * @dev Verifies that the address is added only once
     */
    modifier unregisteredOnly(address _beneficiary) {
        if (beneficiaries[_beneficiary].isRegistered) {
            revert Vesting__AlreadyRegistered();
        }
        _;
    }

    /**
     * @dev Verifies that the address is registered
     */
    modifier RegisteredOnly(address _beneficiary) {
        if (beneficiaries[_beneficiary].isRegistered == false) {
            revert Vesting__NotRegistered();
        }
        _;
    }

    /**
     * @dev Verifies that the address is valid (not 0)
     */
    modifier isValidAddress(address _beneficiary) {
        if (_beneficiary == address(0)) {
            revert Vesting__InvalidAddress();
        }
        _;
    }

    /**
     * @dev Allows a beneficiary to claim his unlocked tokens
     */
    function claim() public nonReentrant RegisteredOnly(msg.sender) {
        Beneficiary storage _beneficiary = beneficiaries[msg.sender];
        _claim(_beneficiary);
    }

    /**
     * @dev Allows a beneficiary to claim his unlocked tokens
     * @param _beneficiary Address of the beneficiary
     */
    function _claim(Beneficiary storage _beneficiary) internal {
        if (block.timestamp < startDate) {
            revert Vesting__NotVestingPeriod();
        }
        uint amount = 0;

        if (!_beneficiary.hasClaimedUnlockedTokens) {
            _beneficiary.hasClaimedUnlockedTokens = true;
            amount += _beneficiary.unlockBonus;
        }

        amount += _available(_beneficiary);
        _beneficiary.claimed += amount;
        Token.safeTransfer(msg.sender, amount);
    }

    /**
     * @dev Funds the contract with ERC20 tokens
     * @notice Only the owner can call this function
     * @param _amount Amount of tokens to fund the contract with
     */
    function fundContractWithErc20Token(uint256 _amount) public onlyOwner {
        Token.transferFrom(msg.sender, address(this), _amount);
    }

    /**
     * @dev Adds a team member to the vesting contract
     * @param _member Address of the team member
     */
    function addBeneficiary(
        address _member,
        uint _allocation
    ) public onlyOwner unregisteredOnly(_member) isValidAddress(_member) {
        if (block.timestamp > startDate) {
            revert Vesting__NotAllowedAfterVestingStarted();
        }
        uint fivePercent = _calculatePercentageOf(_allocation, 5);
        _allocation = _allocation - fivePercent;
        beneficiaries[_member] = Beneficiary(
            _allocation,
            fivePercent, // unlockBonus
            0, // claimed
            true,
            false
        );
    }

    /**
     * @dev Adds several team members to the vesting contract
     * @param _members Array of addresses of the team members
     */
    function addBeneficiaries(
        address[] memory _members,
        uint[] memory _allocations
    ) public onlyOwner {
        if (_members.length != _allocations.length) {
            revert Vesting__InvalidInput();
        }

        for (uint256 i = 0; i < _members.length; i++) {
            addBeneficiary(_members[i], _allocations[i]);
        }
    }

    /**
     * @dev Returns the amount of tokens available for a beneficiary to claim
     * @param _beneficiary Address of the beneficiary
     */
    function _available(
        Beneficiary memory _beneficiary
    ) internal view returns (uint availableTokens) {
        uint released = _released(_beneficiary, startDate, vestingDuration);
        return released - _beneficiary.claimed;
    }

    /**
     * @dev Calculates the amount of tokens released for a beneficiary
     * @param _beneficiary Address of the beneficiary
     * @param _startDate Start date of the vesting period
     * @param _duration Duration of the vesting period
     */
    function _released(
        Beneficiary memory _beneficiary,
        uint _startDate,
        uint _duration
    ) internal view returns (uint) {
        uint _now = block.timestamp;
        uint allocation = _beneficiary.allocation;
        uint _endPeriod = _startDate + _duration;

        if (_now > _endPeriod) {
            return allocation;
        } else {
            uint timePassed = _now - _startDate;
            uint amount = (allocation * timePassed) / _duration;

            return amount;
        }
    }

    /**
     * @dev Calculates the percentage of a number
     * @param amount The number to calculate the percentage of
     * @param percentage The percentage to calculate
     */
    function _calculatePercentageOf(
        uint amount,
        uint percentage
    ) internal pure returns (uint) {
        return (amount * percentage) / 100;
    }
}
