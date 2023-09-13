import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { getAllocations, getTeamMembers, tokensAmount } from "./helper";


/*
  Team 20% -> 200,000,000 tokens
  Phase 1 has 80,000,000 tokens for all team members based on their task points
  5% unlocked on first claim. Linear vesting over 24 months
  Start vesting on september 1st
*/

describe("Vesting Core Team members contract", function () {
  const eightyMillion = 80000000
  const eightyMillionTokens = tokensAmount(eightyMillion);
  const numberOfDaysInTwoYears = 735;

  async function deployErc20Fixture() {
    const tokenFactory = await ethers.getContractFactory("Token");
    const tokenContract = await tokenFactory.deploy(eightyMillionTokens);
    await tokenContract.deployed();

    return { tokenContract };
  }

  async function deployFixture() {
    const [deployer, aSigner, aDifferentSigner, anotherSigner] = await ethers.getSigners();
    const allocations = [tokensAmount(100), tokensAmount(200), tokensAmount(300), tokensAmount(0)]
    const beneficiaries = [deployer.address, aSigner.address, aDifferentSigner.address, anotherSigner.address]
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const vestingFactory = await ethers.getContractFactory("VestingCoreTeamMembers")
    const startDate = await time.latest() + time.duration.seconds(30);
    const vestingDuration = time.duration.days(numberOfDaysInTwoYears);
    const vestingContract = await vestingFactory.deploy(tokenAddress, startDate, vestingDuration, beneficiaries, allocations);
    await tokenContract.transfer(vestingContract.address, eightyMillionTokens);

    return {
      vestingContract,
      tokenContract,
      deployerAddress,
      startDate,
      vestingDuration,
      aSigner,
      anotherSigner,
      aDifferentSigner,
      allocations,
      beneficiaries
    };
  }

  async function deployFixtureWithAllMembers() {
    const [deployer, aSigner, aDifferentSigner, anotherSigner] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const vestingFactory = await ethers.getContractFactory("VestingCoreTeamMembers")
    const startDate = await time.latest() + time.duration.seconds(30);
    const vestingDuration = time.duration.days(numberOfDaysInTwoYears);
    const members = getTeamMembers();
    const allocations = getAllocations();
    const vestingContract = await vestingFactory.deploy(tokenAddress, startDate, vestingDuration, members, allocations);

    return {
      vestingContract,
      tokenContract,
      deployerAddress,
      startDate,
      vestingDuration,
      aSigner,
      anotherSigner,
      aDifferentSigner
    };
  }

  describe('Deployment (Only owner)', () => {
    it('Should deploy with the correct token address, date and duration', async () => {
      const { vestingContract, tokenContract, startDate, vestingDuration } = await loadFixture(deployFixture);

      expect(await vestingContract.Token()).to.equal(tokenContract.address);
      expect(await vestingContract.startDate()).to.equal(startDate);
      expect(await vestingContract.vestingDuration()).to.equal(vestingDuration);
    });

    it('funds the contract with the correct amount of tokens', async () => {
      const { vestingContract, tokenContract } = await loadFixture(deployFixture);
      expect(await tokenContract.balanceOf(vestingContract.address)).to.equal(eightyMillionTokens);
    });

    it('should deploy the contract with the given beneficiaries and allocations', async () => {
      const { vestingContract, beneficiaries, allocations } = await loadFixture(deployFixture);

      beneficiaries.forEach(async (b, i) => {
        const beneficiary = await vestingContract.beneficiaries(b);
        const bonus = allocations[i].mul(5).div(100);

        expect(beneficiary.allocation).to.equal(allocations[i].sub(bonus));
        expect(beneficiary.isRegistered).to.equal(true);
        expect(beneficiary.unlockBonus).to.equal(bonus);
        expect(beneficiary.claimed).to.equal(0);
        expect(beneficiary.hasClaimedUnlockedTokens).to.equal(false);
      });
    });
  })

  describe('Available & Released', () => {
    it('gets the available and released tokens for a member', async () => {
      const { vestingContract, startDate, vestingDuration, beneficiaries, allocations } = await loadFixture(deployFixture);

      const [allocationForDeployer] = allocations
      const [deployerAddress] = beneficiaries
      const unlockBonus = allocationForDeployer.mul(5).div(100);

      await time.increaseTo(startDate);
      const releasedTokens = await vestingContract.released(deployerAddress);
      const availableTokens = await vestingContract.available(deployerAddress);

      expect(releasedTokens).to.equal(0);
      expect(availableTokens).to.equal(0);

      await time.increase(vestingDuration / 2 - 1);
      const availableTokensAfterHalfVesting = await vestingContract.available(deployerAddress);
      const releasedTokensAfterHalfVesting = await vestingContract.released(deployerAddress);

      expect(releasedTokensAfterHalfVesting).to.be.closeTo(allocationForDeployer.sub(unlockBonus).div(2), tokensAmount(1));
      expect(availableTokensAfterHalfVesting).to.be.closeTo(allocationForDeployer.sub(unlockBonus).div(2), tokensAmount(1));

      await vestingContract.claim();

      const availableTokensAfterClaim = await vestingContract.available(deployerAddress);
      const releasedTokensAfterClaim = await vestingContract.released(deployerAddress);

      expect(availableTokensAfterClaim).to.be.closeTo(0, tokensAmount(1));
      expect(releasedTokensAfterClaim).to.be.closeTo(allocationForDeployer.sub(unlockBonus).div(2), tokensAmount(1));
    });
  })

  // beneficiaries 
  describe('Claiming', () => {

    it('reverts if a non-registered address tries to claim', async () => {
      const { vestingContract, startDate } = await loadFixture(deployFixture);
      const unregisteredSigner = (await ethers.getSigners())[5]
      await time.increaseTo(startDate);
      await expect(vestingContract.connect(unregisteredSigner).claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotRegistered")
    });

    it('reverts if tries to claim before the vesting period', async () => {
      const { vestingContract } = await loadFixture(deployFixture);

      await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
    });

    it('allows to claim with 0 allocation', async () => {
      const { vestingContract, deployerAddress, startDate, anotherSigner } = await loadFixture(deployFixture);

      await time.increaseTo(startDate);
      await vestingContract.connect(anotherSigner).claim();

      const beneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      expect(beneficiary.claimed).to.equal(0);
    });

    it('allows to claim the 5% unlock reward', async () => {
      // Arrange
      const { vestingContract, tokenContract, allocations, beneficiaries, startDate } = await loadFixture(deployFixture);
      const delta = tokensAmount(1);
      const deployerAllocation = allocations[0];
      const deployerAddress = beneficiaries[0];
      const fivePercentUnlockBonus = deployerAllocation.mul(5).div(100);

      await time.increaseTo(startDate);
      // Act
      await vestingContract.claim();
      // Assert
      const beneficiary = await vestingContract.beneficiaries(deployerAddress);
      expect(beneficiary.claimed).to.be.closeTo(fivePercentUnlockBonus, delta)
      expect(beneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(beneficiary.allocation).to.equal(deployerAllocation.sub(fivePercentUnlockBonus))
      expect(await tokenContract.balanceOf(deployerAddress)).to.be.closeTo(fivePercentUnlockBonus, delta);
    })

    it('allows to claim the correct amount at 50% of the vesting period', async () => {
      // Arrange
      const { vestingContract, tokenContract, allocations, beneficiaries, startDate, vestingDuration } = await loadFixture(deployFixture);
      const delta = tokensAmount(1);
      const deployerAllocation = allocations[0];
      const deployerAddress = beneficiaries[0];
      const fivePercentUnlockBonus = deployerAllocation.mul(5).div(100);

      // Act
      // Move time to the start of the vesting period
      await time.increaseTo(startDate);
      // Move time to 50% of the vesting period
      await time.increase((vestingDuration / 2) - 1);
      await vestingContract.claim();

      // Assert
      const realAllocation = deployerAllocation.sub(fivePercentUnlockBonus);
      const expectedBalanceForBeneficiares = realAllocation.div(2).add(fivePercentUnlockBonus);
      const anotherBeneficiary = await vestingContract.beneficiaries(deployerAddress);
      expect(anotherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(realAllocation)
      expect(await tokenContract.balanceOf(deployerAddress)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
    });

    it('allows to claim the correct amount at 100% of the vesting period', async () => {
      // Arrange 
      const { vestingContract, tokenContract, allocations, beneficiaries, startDate, vestingDuration } = await loadFixture(deployFixture);
      const delta = tokensAmount(1);
      const deployerAllocation = allocations[0];
      const deployerAddress = beneficiaries[0];
      const fivePercentUnlockBonus = deployerAllocation.mul(5).div(100);

      await time.increaseTo(startDate);
      await time.increase(time.duration.days(numberOfDaysInTwoYears));
      // Act
      await vestingContract.claim();
      // Assert   
      const anotherBeneficiary = await vestingContract.beneficiaries(deployerAddress);
      expect(anotherBeneficiary.claimed).to.be.closeTo(deployerAllocation, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(deployerAllocation.sub(fivePercentUnlockBonus))
      expect(await tokenContract.balanceOf(deployerAddress)).to.be.closeTo(deployerAllocation, delta);
    });
  });
});

