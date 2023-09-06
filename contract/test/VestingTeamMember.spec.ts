import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, tokensAmount } from "./helper";

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
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const vestingFactory = await ethers.getContractFactory("VestingTeamMember")
    const startDate = await time.latest() + time.duration.seconds(30);
    const vestingDuration = time.duration.days(numberOfDaysInTwoYears);
    const vestingContract = await vestingFactory.deploy(tokenAddress, startDate, vestingDuration);
    const tomorrowTimestamp = startDate + time.duration.days(1);
    const yesterdayTimestamp = startDate - time.duration.days(1);

    return {
      vestingContract,
      tokenContract,
      deployerAddress,
      startDate,
      vestingDuration,
      aSigner,
      anotherSigner,
      aDifferentSigner,
      tomorrowTimestamp,
      yesterdayTimestamp
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
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      expect(await tokenContract.balanceOf(vestingContract.address)).to.equal(eightyMillionTokens);
    });
  })

  describe('Manage beneficiaries (Only owner)', () => {
    it('adds team members', async () => {
      const { vestingContract, deployerAddress, aSigner, anotherSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      const allocationForSigner = tokensAmount(50000);
      const allocationForAnotherSigner = tokensAmount(100000);
      const allocationForDeployer = tokensAmount(50000);
      await vestingContract.addBeneficiary(deployerAddress, allocationForDeployer);
      await vestingContract.addBeneficiaries([aSigner.address, anotherSigner.address], [allocationForSigner, allocationForAnotherSigner]);

      expect((await vestingContract.beneficiaries(deployerAddress)).allocation).to.equal(allocationForDeployer);
      expect((await vestingContract.beneficiaries(deployerAddress)).isRegistered).to.equal(true);
      expect((await vestingContract.beneficiaries(aSigner.address)).allocation).to.equal(allocationForSigner);
      expect((await vestingContract.beneficiaries(aSigner.address)).isRegistered).to.equal(true);
      expect((await vestingContract.beneficiaries(anotherSigner.address)).allocation).to.equal(allocationForAnotherSigner);
      expect((await vestingContract.beneficiaries(anotherSigner.address)).isRegistered).to.equal(true);
    });

    it('reverts when adding addresses twice', async () => {
      const { vestingContract, aSigner } = await loadFixture(deployFixture);
      await vestingContract.addBeneficiary(aSigner.address, 0);

      await expect(vestingContract.addBeneficiary(aSigner.address, 0)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding addresses after the vesting period started', async () => {
      const { vestingContract, deployerAddress, startDate } = await loadFixture(deployFixture);
      await time.increaseTo(startDate);
      await time.increase(time.duration.days(1));

      await expect(vestingContract.addBeneficiary(deployerAddress, 0)).to.be.revertedWithCustomError(vestingContract, "Vesting__NotAllowedAfterVestingStarted")
    });

    it('reverts when adding a different amount of addresses than the amount of allocations', async () => {
      const { vestingContract, aSigner } = await loadFixture(deployFixture);
      await expect(vestingContract.addBeneficiaries([aSigner.address], [0, 0])).to.be.revertedWithCustomError(vestingContract, "Vesting__InvalidInput")
    });
  })

  // beneficiaries 
  describe('Claiming', () => {
    it('reverts if a non-registered address tries to claim', async () => {
      const { vestingContract } = await loadFixture(deployFixture);
      await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotRegistered")
    });

    it('reverts if tries to claim before the vesting period', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      // isDeployed for lastest timestamp plus 30 seconds
      await vestingContract.addBeneficiary(deployerAddress, 0);
      await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
    });

    it('allows to claim the 5% unlock reward', async () => {
      // Arrange
      const allocation = tokensAmount(100);
      const fivePercentUnlockBonus = allocation.mul(5).div(100);
      const delta = tokensAmount(1);
      const { vestingContract, tokenContract, anotherSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      await vestingContract.addBeneficiary(anotherSigner.address, allocation);
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      await time.increase(time.duration.seconds(60));
      // Act
      await vestingContract.connect(anotherSigner).claim();
      // Assert
      const anotherBeneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      expect(anotherBeneficiary.claimed).to.be.closeTo(fivePercentUnlockBonus, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(allocation)
      expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(fivePercentUnlockBonus, delta);
    })

    it('allows to claim the correct amount at 50% of the vesting period', async () => {
      // Arrange
      const allocation = tokensAmount(100);
      const delta = tokensAmount(4);
      const expectedBalanceForBeneficiares = allocation.div(2);
      const { vestingContract, tokenContract, anotherSigner } = await loadFixture(deployFixture);
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      await vestingContract.addBeneficiary(anotherSigner.address, allocation);
      await time.increase(time.duration.days((numberOfDaysInTwoYears / 2) - 1));
      // Act
      await vestingContract.connect(anotherSigner).claim();
      // Assert
      const anotherBeneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      expect(anotherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(allocation)
      expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
    });

    it('allows to claim the correct amount at 100% of the vesting period', async () => {
      // Arrange 
      const allocation = tokensAmount(10);
      const delta = tokensAmount(0);
      const { vestingContract, tokenContract, anotherSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      await vestingContract.addBeneficiary(anotherSigner.address, allocation);
      await time.increaseTo(tomorrowTimestamp);
      await time.increase(time.duration.days(numberOfDaysInTwoYears));
      // Act
      await vestingContract.connect(anotherSigner).claim();
      // Assert
      const anotherBeneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      expect(anotherBeneficiary.claimed).to.be.closeTo(allocation, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(allocation)
      expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(allocation, delta);
    });
  });
});

