// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
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
    using SafeMath for uint256;
    IERC20 public immutable Token;

    struct Beneficiary {
        uint256 amount;
        uint256 claimed;
        bool isRegistered;
        bool hasClaimedUnlockedTokens;
    }

    mapping(address => Beneficiary) public teamMembers;
    mapping(address => Beneficiary) public investors;
    mapping(address => Beneficiary) public dao;

    uint8 public constant maxDAOAddresses = 1;
    uint8 public daoCount = 0;
    uint8 public teamMembersCount = 0;
    uint8 public investorsCount = 0;

    uint public startDate;
    uint public dexLaunchDate;

    uint public teamTokensAmount = 0;
    uint public teamTokensAmountOnUnlock = 0;
    uint public investorsTokensAmount = 0;
    uint public investorsTokensAmountOnUnlock = 0;
    uint public daoTokensAmount = 0;

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
            _claimTeamTokens();
            return;
        }

        if (_isInvestor(msg.sender)) {
            _claimInvestorsTokens();
            return;
        }

        if (_isDAO(msg.sender)) {
            _claimDAOTokens();
            return;
        }
    }

    function _claimTeamTokens() internal {
        if (block.timestamp < startDate) {
            revert Vesting__NotVestingPeriod();
        }

        if (!teamMembers[msg.sender].hasClaimedUnlockedTokens) {
            teamMembers[msg.sender].hasClaimedUnlockedTokens = true;
            uint amount = teamTokensAmountOnUnlock.div(teamMembersCount);
            Token.safeTransfer(msg.sender, amount);
        }
    }

    function _claimInvestorsTokens() internal {
        if (block.timestamp < dexLaunchDate) {
            revert Vesting__NotVestingPeriod();
        }

        if (!investors[msg.sender].hasClaimedUnlockedTokens) {
            investors[msg.sender].hasClaimedUnlockedTokens = true;
            uint amount = investorsTokensAmountOnUnlock.div(investorsCount);
            Token.safeTransfer(msg.sender, amount);
        }
    }

    function _claimDAOTokens() internal {
        if (block.timestamp < dexLaunchDate) {
            revert Vesting__NotVestingPeriod();
        }
    }

    /**
     * @dev Funds the contract with ERC20 tokens
     * @notice Only the owner can call this function
     * @param _amount Amount of tokens to fund the contract with
     */
    function fundContractWithErc20Token(uint256 _amount) public onlyOwner {
        Token.transferFrom(msg.sender, address(this), _amount);
    }

    // TODO: Call only once
    function initializeTokenDistributionsAmount() public onlyOwner {
        uint contractsBalance = Token.balanceOf(address(this));
        teamTokensAmount = calculatePercentageOf(contractsBalance, 20);
        teamTokensAmountOnUnlock = calculatePercentageOf(teamTokensAmount, 5);
        investorsTokensAmount = calculatePercentageOf(contractsBalance, 5);
        investorsTokensAmountOnUnlock = calculatePercentageOf(
            investorsTokensAmount,
            5
        );
        daoTokensAmount = calculatePercentageOf(contractsBalance, 5);
    }

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

    // TODO: Call only once
    function setStartDate(uint _startDate) public onlyOwner {
        startDate = _startDate;
    }

    // TODO: Call only once
    function setDexLaunchDate(uint _dexLaunchDate) public onlyOwner {
        dexLaunchDate = _dexLaunchDate;
    }

    /**
     * @dev Calculates the percentage of a number
     * @param amount The number to calculate the percentage of
     * @param percentage The percentage to calculate
     */
    function calculatePercentageOf(
        uint amount,
        uint percentage
    ) internal pure returns (uint) {
        return amount.mul(percentage).div(100);
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
}
