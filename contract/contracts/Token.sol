// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    constructor(uint256 _supply) ERC20("Token", "ERC") {
        _mint(msg.sender, _supply);
    }

    function faucet(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}
