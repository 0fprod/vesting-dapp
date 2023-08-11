// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// import {console} from "hardhat/console.sol";
error Vesting__AlreadyRegistered();
error Vesting__InvalidAddress();
error Vesting__OnlyOneDAOAllowed();

contract Vesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    IERC20 public immutable Token;

    struct Beneficiary {
        uint256 amount;
        uint256 claimed;
        bool isRegistered;
    }

    mapping(address => Beneficiary) public teamMembers;
    mapping(address => Beneficiary) public investors;
    mapping(address => Beneficiary) public dao;
    uint8 public constant maxDAOAddresses = 1;
    uint8 public numberOfDAOAddresses = 0;

    constructor(address _token) {
        Token = IERC20(_token);
    }

    modifier isNotRegistered(address _beneficiary) {
        if (teamMembers[_beneficiary].isRegistered == true) {
            revert Vesting__AlreadyRegistered();
        }

        if (investors[_beneficiary].isRegistered == true) {
            revert Vesting__AlreadyRegistered();
        }

        if (dao[_beneficiary].isRegistered == true) {
            revert Vesting__AlreadyRegistered();
        }
        _;
    }

    modifier validAddress(address _beneficiary) {
        if (_beneficiary == address(0)) {
            revert Vesting__InvalidAddress();
        }
        _;
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
    function addTeamMember(
        address _member
    ) public onlyOwner isNotRegistered(_member) validAddress(_member) {
        teamMembers[_member] = Beneficiary(0, 0, true);
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
    ) public onlyOwner isNotRegistered(_investor) validAddress(_investor) {
        investors[_investor] = Beneficiary(0, 0, true);
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
    ) public onlyOwner isNotRegistered(_DAO) validAddress(_DAO) {
        if (numberOfDAOAddresses == maxDAOAddresses) {
            revert Vesting__OnlyOneDAOAllowed();
        }
        numberOfDAOAddresses = 1;
        dao[_DAO] = Beneficiary(0, 0, true);
    }
}
