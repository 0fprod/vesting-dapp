import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, getAllocations, getTeamMembers, tokensAmount } from "./helper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

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
    const vestingFactory = await ethers.getContractFactory("VestingCoreTeamMembers")
    const startDate = await time.latest() + time.duration.seconds(30);
    const vestingDuration = time.duration.days(numberOfDaysInTwoYears);
    const [first, second] = getTeamMembers();
    const [firstAlloc, secondAlloc] = getAllocations();
    const vestingContract = await vestingFactory.deploy(tokenAddress, startDate, vestingDuration, [first, second], [firstAlloc, secondAlloc]);

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
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      expect(await tokenContract.balanceOf(vestingContract.address)).to.equal(eightyMillionTokens);
    });

    it('should deploy the contract with the given beneficiaries and allocations', async () => {
      const [first, second, ...rest] = getTeamMembers();
      const [firstAlloc, secondAlloc, ...restAlloc] = getAllocations();
      const { vestingContract } = await loadFixture(deployFixture);
      const firstUnlockBonus = firstAlloc.mul(5).div(100);
      const secondUnlockBonus = secondAlloc.mul(5).div(100);

      const firstBeneficiary = await vestingContract.beneficiaries(first);
      const secondBeneficiary = await vestingContract.beneficiaries(second);

      expect(firstBeneficiary.allocation).to.equal(firstAlloc.sub(firstUnlockBonus));
      expect(firstBeneficiary.isRegistered).to.equal(true);
      expect(firstBeneficiary.unlockBonus).to.equal(firstUnlockBonus);

      expect(secondBeneficiary.allocation).to.equal(secondAlloc.sub(secondUnlockBonus));
      expect(secondBeneficiary.isRegistered).to.equal(true);
      expect(secondBeneficiary.unlockBonus).to.equal(secondUnlockBonus);
    });
  })

  describe('Manage beneficiaries (Only owner)', () => {
    it('adds team members', async () => {
      const { vestingContract, deployerAddress, aSigner, anotherSigner, aDifferentSigner } = await loadFixture(deployFixture);
      const allocationForSigner = tokensAmount(50000);
      const unlockBonusForSigner = allocationForSigner.mul(5).div(100);
      const allocationForAnotherSigner = tokensAmount(100000);
      const unlockBonusForAnotherSigner = allocationForAnotherSigner.mul(5).div(100);
      const allocationForADifferentSigner = tokensAmount(0);
      const unlockBonusForADifferentSigner = allocationForADifferentSigner.mul(5).div(100);
      const allocationForDeployer = tokensAmount(50000);
      const unlockBonusForDeployer = allocationForDeployer.mul(5).div(100);
      await vestingContract.addBeneficiary(deployerAddress, allocationForDeployer);
      await vestingContract.addBeneficiary(aDifferentSigner.address, allocationForADifferentSigner);
      await vestingContract.addBeneficiaries([aSigner.address, anotherSigner.address], [allocationForSigner, allocationForAnotherSigner]);

      const deployerBeneficiary = await vestingContract.beneficiaries(deployerAddress);
      const aSignerBeneficiary = await vestingContract.beneficiaries(aSigner.address);
      const anotherSignerBeneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      const aDifferentSignerBeneficiary = await vestingContract.beneficiaries(aDifferentSigner.address);

      expect(deployerBeneficiary.allocation).to.equal(allocationForDeployer.sub(unlockBonusForDeployer));
      expect(deployerBeneficiary.isRegistered).to.equal(true);
      expect(deployerBeneficiary.unlockBonus).to.equal(unlockBonusForDeployer);

      expect(aSignerBeneficiary.allocation).to.equal(allocationForSigner.sub(unlockBonusForSigner));
      expect(aSignerBeneficiary.isRegistered).to.equal(true);
      expect(aSignerBeneficiary.unlockBonus).to.equal(unlockBonusForSigner);

      expect(anotherSignerBeneficiary.allocation).to.equal(allocationForAnotherSigner.sub(unlockBonusForAnotherSigner));
      expect(anotherSignerBeneficiary.isRegistered).to.equal(true);
      expect(anotherSignerBeneficiary.unlockBonus).to.equal(unlockBonusForAnotherSigner);

      expect(aDifferentSignerBeneficiary.allocation).to.equal(allocationForADifferentSigner.sub(unlockBonusForADifferentSigner));
      expect(aDifferentSignerBeneficiary.isRegistered).to.equal(true);
      expect(aDifferentSignerBeneficiary.unlockBonus).to.equal(unlockBonusForADifferentSigner);
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

  xdescribe('Available', () => {
    it('gets the available and released tokens for a member', async () => {
      const { vestingContract, tokenContract, deployerAddress, startDate, vestingDuration } = await loadFixture(deployFixture);
      approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      const allocation = tokensAmount(100);
      const unlockBonus = allocation.mul(5).div(100);
      await vestingContract.addBeneficiary(deployerAddress, allocation);

      await time.increaseTo(startDate);
      const releasedTokens = await vestingContract.released();
      const availableTokens = await vestingContract.available();


      expect(releasedTokens).to.equal(0);
      expect(availableTokens).to.equal(0);

      await time.increase(vestingDuration / 2 - 1);
      const availableTokensAfterHalfVesting = await vestingContract.available();
      const releasedTokensAfterHalfVesting = await vestingContract.released();

      expect(releasedTokensAfterHalfVesting).to.be.closeTo(allocation.sub(unlockBonus).div(2), tokensAmount(1));
      expect(availableTokensAfterHalfVesting).to.be.closeTo(allocation.sub(unlockBonus).div(2), tokensAmount(1));

      await vestingContract.claim();

      const availableTokensAfterClaim = await vestingContract.available();
      const releasedTokensAfterClaim = await vestingContract.released();

      expect(releasedTokensAfterClaim).to.be.closeTo(allocation.sub(unlockBonus).div(2), tokensAmount(1));
      expect(availableTokensAfterClaim).to.be.closeTo(0, tokensAmount(1));
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

    it('allows to claim with 0 allocation', async () => {
      const { vestingContract, deployerAddress, startDate } = await loadFixture(deployFixture);
      await vestingContract.addBeneficiary(deployerAddress, 0);
      await time.increaseTo(startDate);
      await vestingContract.claim();

      const deployerBeneficiary = await vestingContract.beneficiaries(deployerAddress);
      expect(deployerBeneficiary.claimed).to.equal(0);
    });

    it('allows to claim the 5% unlock reward', async () => {
      // Arrange
      const allocation = tokensAmount(100);
      const fivePercentUnlockBonus = allocation.mul(5).div(100);
      const delta = tokensAmount(1);
      const { vestingContract, tokenContract, anotherSigner, startDate } = await loadFixture(deployFixture);
      await vestingContract.addBeneficiary(anotherSigner.address, allocation);
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      await time.increaseTo(startDate);
      // Act
      await vestingContract.connect(anotherSigner).claim();
      // Assert
      const anotherBeneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      expect(anotherBeneficiary.claimed).to.be.closeTo(fivePercentUnlockBonus, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(allocation.sub(fivePercentUnlockBonus))
      expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(fivePercentUnlockBonus, delta);
    })

    it('allows to claim the correct amount at 50% of the vesting period', async () => {
      // Arrange
      const allocation = tokensAmount(100);
      const unlockBonus = allocation.mul(5).div(100);
      const delta = tokensAmount(1);
      const { vestingContract, tokenContract, anotherSigner, startDate, vestingDuration } = await loadFixture(deployFixture);
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      await vestingContract.addBeneficiary(anotherSigner.address, allocation);

      // Act
      // Move time to the start of the vesting period
      await time.increaseTo(startDate);
      // Move time to 50% of the vesting period
      await time.increase((vestingDuration / 2) - 1);
      await vestingContract.connect(anotherSigner).claim();

      // Assert
      const realAllocation = allocation.sub(unlockBonus);
      const expectedBalanceForBeneficiares = realAllocation.div(2).add(unlockBonus);
      const anotherBeneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      expect(anotherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(realAllocation)
      expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
    });

    it('allows to claim the correct amount at 100% of the vesting period', async () => {
      // Arrange 
      const allocation = tokensAmount(100);
      const unlockBonus = allocation.mul(5).div(100);
      const realAllocation = allocation.sub(unlockBonus);
      const delta = tokensAmount(0);
      const { vestingContract, tokenContract, anotherSigner, startDate } = await loadFixture(deployFixture);
      await approveAndFundContract(vestingContract, tokenContract, eightyMillion);
      await vestingContract.addBeneficiary(anotherSigner.address, allocation);
      await time.increaseTo(startDate);
      await time.increase(time.duration.days(numberOfDaysInTwoYears));
      // Act
      await vestingContract.connect(anotherSigner).claim();
      // Assert   
      const anotherBeneficiary = await vestingContract.beneficiaries(anotherSigner.address);
      expect(anotherBeneficiary.claimed).to.be.closeTo(allocation, delta)
      expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
      expect(anotherBeneficiary.allocation).to.equal(realAllocation)
      expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(allocation, delta);
    });


  });

  // describe('"Real" scenario', () => {
  //   it('sum of beneficiaries allocation its 80M', async () => {
  //     const allocations = getAllocations();

  //     const { vestingContract, tokenContract } = await loadFixture(deployFixture);
  //     await approveAndFundContract(vestingContract, tokenContract, eightyMillion);

  //     const sumAllAllocation = allocations.reduce((a, b) => b.add(a), BigNumber.from(0));

  //     expect(sumAllAllocation).to.equal(eightyMillionTokens);
  //     expect(await tokenContract.balanceOf(vestingContract.address)).to.equal(eightyMillionTokens);
  //   });

  //   it('allows to claim the correct amount at 50% of the vesting period', async () => {
  //     const signers = await ethers.getSigners();
  //     const allocations = getAllocations();
  //     const beneficiaries = buildBeneficiares(signers, allocations);

  //     const { vestingContract, tokenContract, startDate, vestingDuration } = await loadFixture(deployFixture);
  //     await approveAndFundContract(vestingContract, tokenContract, eightyMillion);

  //     beneficiaries.forEach(async (b) => {
  //       await vestingContract.addBeneficiary(b.address, tokensAmount(b.allocation));
  //     });

  //     await time.increaseTo(startDate);
  //     await time.increase(vestingDuration / 2 - 1);

  //     beneficiaries.forEach(async ({ address, allocation }, i) => {
  //       const tokenAllocation = tokensAmount(allocation);
  //       const unlockBonus = tokenAllocation.mul(5).div(100);
  //       const realAllocation = tokenAllocation.sub(unlockBonus);
  //       const expectedBalanceForBeneficiares = realAllocation.div(2).add(unlockBonus);
  //       await vestingContract.connect(signers[i]).claim();

  //       const beneficiary = await vestingContract.beneficiaries(address);

  //       expect(beneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, tokensAmount(1));
  //       const balance = await tokenContract.balanceOf(address);
  //       const expectedBalance = tokensAmount(allocation).div(2).sub(unlockBonus);
  //       expect(balance).to.be.closeTo(expectedBalance, tokensAmount(1));
  //     }
  //     );
  //   });


  //   function buildBeneficiares(signers: SignerWithAddress[], allocations: number[]) {
  //     return signers.map((s, i) => {
  //       return {
  //         address: s.address,
  //         allocation: allocations[i]
  //       }
  //     })
  //   }
  // });
});

