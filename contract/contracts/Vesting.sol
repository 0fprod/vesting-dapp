// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {console} from "hardhat/console.sol";

error Vesting__AlreadyRegistered();
error Vesting__InvalidAddress();
error Vesting__OnlyOneDAOAllowed();
error Vesting__NotRegistered();
error Vesting__NotVestingPeriod();
error Vesting__NotAllowedAfterVestingStarted();

contract Vesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable Token;

    struct Beneficiary {
        uint256 allocation;
        uint256 claimed;
        bool isRegistered;
        bool hasClaimedUnlockedTokens;
    }

    mapping(address => Beneficiary) public teamMembers;
    mapping(address => Beneficiary) public investors;
    mapping(address => Beneficiary) public dao;

    uint8 public constant maxDAOAddresses = 1;
    uint8 public daoCount = 0;
    uint public teamMembersCount = 0;
    uint public investorsCount = 0;

    uint public startDate;
    uint public dexLaunchDate;
    uint public teamMembersVestingDuration;
    uint public investorsVestingDuration;
    uint public daoVestingDuration;

    uint public teamAllocation = 0;
    uint public teamUnlockBonus = 0;
    uint public investorsAllocation = 0;
    uint public investorsUnlockBonus = 0;
    uint public daoAllocation = 0;

    constructor(address _token) {
        Token = IERC20(_token);
    }

    /**
     * @dev Verifies that the address is added only once
     */
    modifier unregisteredOnly(address _beneficiary) {
        if (
            teamMembers[_beneficiary].isRegistered ||
            investors[_beneficiary].isRegistered ||
            dao[_beneficiary].isRegistered
        ) {
            revert Vesting__AlreadyRegistered();
        }
        _;
    }

    /**
     * @dev Verifies that the address is registered
     */
    modifier RegisteredOnly(address _beneficiary) {
        if (
            teamMembers[_beneficiary].isRegistered == false &&
            investors[_beneficiary].isRegistered == false &&
            dao[_beneficiary].isRegistered == false
        ) {
            revert Vesting__NotRegistered();
        }
        _;
    }

    modifier isValidAddress(address _beneficiary) {
        if (_beneficiary == address(0)) {
            revert Vesting__InvalidAddress();
        }
        _;
    }

    function claim() public nonReentrant RegisteredOnly(msg.sender) {
        if (_isTeamMember(msg.sender)) {
            Beneficiary storage beneficiary = teamMembers[msg.sender];
            _claim(
                beneficiary,
                teamAllocation,
                teamUnlockBonus,
                teamMembersCount,
                startDate
            );
            return;
        }

        if (_isInvestor(msg.sender)) {
            Beneficiary storage beneficiary = investors[msg.sender];
            _claim(
                beneficiary,
                investorsAllocation,
                investorsUnlockBonus,
                investorsCount,
                dexLaunchDate
            );
            return;
        }

        if (_isDAO(msg.sender)) {
            Beneficiary storage beneficiary = dao[msg.sender];
            _claim(beneficiary, daoAllocation, 0, daoCount, dexLaunchDate);
            return;
        }
    }

    function _claim(
        Beneficiary storage _beneficiary,
        uint _allocation,
        uint _unlockBonus,
        uint _numberOfParticipants,
        uint _startDate
    ) internal {
        if (block.timestamp < _startDate) {
            revert Vesting__NotVestingPeriod();
        }
        uint unlockBonus = 0;

        if (!_beneficiary.hasClaimedUnlockedTokens) {
            unlockBonus = _unlockBonus / _numberOfParticipants;
            _beneficiary.hasClaimedUnlockedTokens = true;
            _beneficiary.allocation = _allocation / _numberOfParticipants;
        }

        uint amount = _available(_beneficiary) + unlockBonus;
        _beneficiary.claimed += amount;
        Token.safeTransfer(msg.sender, amount);
    }

    // function available() public RegisteredOnly(msg.sender) returns (uint) {
    //     return _available(msg.sender);
    // }

    /**
     * @dev Funds the contract with ERC20 tokens
     * @notice Only the owner can call this function
     * @param _amount Amount of tokens to fund the contract with
     */
    function fundContractWithErc20Token(uint256 _amount) public onlyOwner {
        Token.transferFrom(msg.sender, address(this), _amount);
    }

    // TODO: Call only once
    /**
     * @dev Initializes the amount of tokens for each distribution
     * @notice Only the owner can call this function
     * @notice The amount of tokens should be funded to the contract before calling this function
     * @notice TeamTokensAmount = 20% of the total contract balance
     * @notice TeamTokensAmountOnUnlock = 5% of the TeamTokensAmount
     * @notice InvestorsTokensAmount = 5% of the total contract balance
     * @notice InvestorsTokensAmountOnUnlock = 5% of the InvestorsTokensAmount
     * @notice DAOTokensAmount = 5% of the total contract balance
     */
    function initializeTokenDistribution() public onlyOwner {
        uint contractsBalance = Token.balanceOf(address(this));
        teamAllocation = _calculatePercentageOf(contractsBalance, 20);
        teamUnlockBonus = _calculatePercentageOf(teamAllocation, 5);
        teamAllocation = teamAllocation - teamUnlockBonus;

        investorsAllocation = _calculatePercentageOf(contractsBalance, 5);
        investorsUnlockBonus = _calculatePercentageOf(investorsAllocation, 5);
        investorsAllocation = investorsAllocation - investorsUnlockBonus;

        daoAllocation = _calculatePercentageOf(contractsBalance, 5);
    }

    // TODO: Call only once
    function setStartDate(uint _startDate) public onlyOwner {
        startDate = _startDate;
        // Initialize durations
        teamMembersVestingDuration = 730 days; // 2 years
    }

    // TODO: Call only once
    function setDexLaunchDate(uint _dexLaunchDate) public onlyOwner {
        dexLaunchDate = _dexLaunchDate;
        // Initialize durations
        investorsVestingDuration = 730 days; // 2 years
        daoVestingDuration = 1095 days; // 3 years
    }

    // /////////////////// //
    // Add addresses block //
    // /////////////////// //
    /**
     * @dev Adds a team member to the vesting contract
     * @param _member Address of the team member
     */
    function addTeamMember(
        address _member
    ) public onlyOwner unregisteredOnly(_member) isValidAddress(_member) {
        if (block.timestamp > startDate) {
            revert Vesting__NotAllowedAfterVestingStarted();
        }
        teamMembers[_member] = Beneficiary(0, 0, true, false);
        teamMembersCount++;
    }

    /**
     * @dev Adds several team members to the vesting contract
     * @param _members Array of addresses of the team members
     */
    function addTeamMembers(address[] memory _members) public onlyOwner {
        for (uint256 i = 0; i < _members.length; i++) {
            addTeamMember(_members[i]);
        }
    }

    /**
     * @dev Adds an investor to the vesting contract
     * @param _investor Address of the investor
     */
    function addInvestor(
        address _investor
    ) public onlyOwner unregisteredOnly(_investor) isValidAddress(_investor) {
        if (block.timestamp > dexLaunchDate) {
            revert Vesting__NotAllowedAfterVestingStarted();
        }
        investors[_investor] = Beneficiary(0, 0, true, false);
        investorsCount++;
    }

    /**
     * @dev Adds several investors to the vesting contract
     * @param _investors Array of addresses of the investors
     */
    function addInvestors(address[] memory _investors) public onlyOwner {
        for (uint256 i = 0; i < _investors.length; i++) {
            addInvestor(_investors[i]);
        }
    }

    /**
     * @dev Adds the DAO to the vesting contract
     * @param _DAO Address of the DAO
     */
    function addDAO(
        address _DAO
    ) public onlyOwner unregisteredOnly(_DAO) isValidAddress(_DAO) {
        if (daoCount == maxDAOAddresses) {
            revert Vesting__OnlyOneDAOAllowed();
        }
        if (block.timestamp > dexLaunchDate) {
            revert Vesting__NotAllowedAfterVestingStarted();
        }
        dao[_DAO] = Beneficiary(0, 0, true, false);
        daoCount = 1;
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

    function _isTeamMember(address _member) internal view returns (bool) {
        return teamMembers[_member].isRegistered;
    }

    function _isInvestor(address _investor) internal view returns (bool) {
        return investors[_investor].isRegistered;
    }

    function _isDAO(address _DAO) internal view returns (bool) {
        return dao[_DAO].isRegistered;
    }

    function _available(
        Beneficiary memory beneficiary
    ) internal view returns (uint) {
        if (_isTeamMember(msg.sender)) {
            return
                _getReleasedAmountFromBeneficiary(
                    beneficiary,
                    startDate,
                    teamMembersVestingDuration
                ) - beneficiary.claimed;
        }

        if (_isInvestor(msg.sender)) {
            return
                _getReleasedAmountFromBeneficiary(
                    beneficiary,
                    dexLaunchDate,
                    investorsVestingDuration
                ) - beneficiary.claimed;
        }

        if (_isDAO(msg.sender)) {
            return
                _getReleasedAmountFromBeneficiary(
                    beneficiary,
                    dexLaunchDate,
                    daoVestingDuration
                ) - beneficiary.claimed;
        }
    }

    function _released(address address_) internal view returns (uint) {
        if (_isTeamMember(msg.sender)) {
            return
                _getReleasedAmountFromBeneficiary(
                    teamMembers[address_],
                    startDate,
                    teamMembersVestingDuration
                );
        }

        if (_isInvestor(msg.sender)) {
            return
                _getReleasedAmountFromBeneficiary(
                    investors[address_],
                    dexLaunchDate,
                    investorsVestingDuration
                );
        }

        if (_isDAO(msg.sender)) {
            return
                _getReleasedAmountFromBeneficiary(
                    dao[address_],
                    dexLaunchDate,
                    daoVestingDuration
                );
        }
    }

    function _getReleasedAmountFromBeneficiary(
        Beneficiary memory beneficiary,
        uint _startDate,
        uint _duration
    ) internal view returns (uint) {
        uint _now = block.timestamp;
        uint allocation = beneficiary.allocation;
        uint _endPeriod = _startDate + _duration;

        if (_now > _endPeriod) {
            return allocation;
        } else {
            uint timePassed = _now - _startDate;
            uint amount = (allocation * timePassed) / _duration;
            return amount;
        }
    }
}
