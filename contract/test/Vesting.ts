import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, approveAndStake, formatUnits, mintTokensFor, moveTimeForwardInWeeks, tokensAmount } from "./helper";

describe("Vesting contract", function () {
  const thousandTokens = tokensAmount(1000);

  async function deployErc20Fixture() {
    const tokenFactory = await ethers.getContractFactory("Token");
    const tokenContract = await tokenFactory.deploy(thousandTokens);
    await tokenContract.deployed();

    return { tokenContract };
  }

  async function deployFixture() {
    const [deployer, otherSigner] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const vestingFactory = await ethers.getContractFactory("Vesting")
    const vestingContract = await vestingFactory.deploy(tokenAddress);

    return { vestingContract, tokenContract, deployerAddress, otherSigner };
  }

  describe('Deployment', () => {

  })


});



