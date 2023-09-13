// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error Vesting__NotRegistered();
error Vesting__NotVestingPeriod();
error Vesting__InsufficientContractFunds();

contract VestingCoreTeamMembers is Ownable, ReentrancyGuard {
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

    constructor(
        address _token,
        uint _startDate,
        uint _vestingDuration,
        address[] memory _members,
        uint[] memory _allocations
    ) {
        Token = IERC20(_token);
        startDate = _startDate;
        vestingDuration = _vestingDuration;

        for (uint i = 0; i < _members.length; i++) {
            address _member = _members[i];
            uint _allocation = _allocations[i];
            uint fivePercent = _calculatePercentageOf(_allocation, 5);
            uint allocationWithouUnlockBonus = _allocation - fivePercent;
            beneficiaries[_member] = Beneficiary(
                allocationWithouUnlockBonus,
                fivePercent, // unlockBonus
                0, // claimed
                true, // isRegistered
                false // hasClaimedUnlockedTokens
            );
        }
    }

    /**
     * @dev Allows a beneficiary to claim his unlocked tokens
     */
    function claim() public nonReentrant {
        if (beneficiaries[msg.sender].isRegistered == false) {
            revert Vesting__NotRegistered();
        }

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

        if (contractBalance() < _available(_beneficiary)) {
            revert Vesting__InsufficientContractFunds();
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
     * @dev Returns the amount of tokens available for a beneficiary to claim
     * @param _beneficiary Address of the beneficiary
     */
    function _available(
        Beneficiary memory _beneficiary
    ) internal view returns (uint availableTokens) {
        uint __released = _released(_beneficiary, startDate, vestingDuration);

        if (_beneficiary.claimed >= __released) {
            return 0;
        }

        return __released - _beneficiary.claimed;
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

    function contractBalance() public view returns (uint) {
        return Token.balanceOf(address(this));
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

    /**
     * @param _address Address of the beneficiary
     * @return The amount of tokens available for a beneficiary to claim
     */
    function available(address _address) public view returns (uint) {
        Beneficiary memory beneficiary = beneficiaries[_address];

        if (beneficiary.isRegistered == false) {
            return 0;
        }

        return _available(beneficiary);
    }

    /**
     *
     * @param _address Address of the beneficiary
     * @return The amount of tokens released for a beneficiary
     */
    function released(address _address) public view returns (uint) {
        Beneficiary memory beneficiary = beneficiaries[_address];

        if (beneficiary.isRegistered == false) {
            return 0;
        }

        return _released(beneficiary, startDate, vestingDuration);
    }
}
