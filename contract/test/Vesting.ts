import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, tokensAmount } from "./helper";

describe("Vesting contract", function () {
  const oneBillionNumber = 1000000000
  const oneBillionTokens = tokensAmount(oneBillionNumber);
  const numberOfDaysInTwoYears = 735;
  const numberOfDaysInThreeYears = 1095;

  async function deployErc20Fixture() {
    const tokenFactory = await ethers.getContractFactory("Token");
    const tokenContract = await tokenFactory.deploy(oneBillionTokens);
    await tokenContract.deployed();

    return { tokenContract };
  }

  async function deployFixture() {
    const [deployer, aSigner, aDifferentSigner, anotherSigner] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const vestingFactory = await ethers.getContractFactory("Vesting")
    const vestingContract = await vestingFactory.deploy(tokenAddress);
    const tomorrowTimestamp = await time.latest() + time.duration.days(1);
    const yesterdayTimestamp = await time.latest() - time.duration.days(1);

    return {
      vestingContract,
      tokenContract,
      deployerAddress,
      aSigner,
      anotherSigner,
      aDifferentSigner,
      tomorrowTimestamp,
      yesterdayTimestamp
    };
  }

  describe('Deployment', () => {
    it('Should deploy with the correct token address', async () => {
      const { vestingContract, tokenContract } = await loadFixture(deployFixture);
      expect(await vestingContract.Token()).to.equal(tokenContract.address);
    });

    it('funds the contract with the correct amount of tokens', async () => {
      const { vestingContract, tokenContract } = await loadFixture(deployFixture);
      await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
      expect(await tokenContract.balanceOf(vestingContract.address)).to.equal(oneBillionTokens);
    });

    it('defines dates', async () => {
      // DEX Launch is not fixed date.
      const { vestingContract, tomorrowTimestamp } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowTimestamp);
      await vestingContract.setDexLaunchDate(tomorrowTimestamp);

      expect(await vestingContract.startDate()).to.equal(tomorrowTimestamp);
      expect(await vestingContract.dexLaunchDate()).to.equal(tomorrowTimestamp);
    });

    it('initializes the correct tokens distributions', async () => {
      // Total supply -> 1,000,000,000 tokens
      //     Team 20% -> 200,000,000 tokens (5% unlocked after TGE -> 10,000,000 tokens)
      // Investors 5% -> 50,000,000 tokens (5% unlocked after DEX Launch -> 2,500,000 tokens)
      //       DAO 5% -> 50,000,000 tokens
      // Arrange
      const { vestingContract, tokenContract, deployerAddress, aSigner, anotherSigner, aDifferentSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      const [someOtherSigner] = (await ethers.getSigners()).splice(-1);
      const teamMembersAddreses = [deployerAddress, aSigner.address]
      const investorsAddresses = [anotherSigner.address, aDifferentSigner.address]
      const daoAddress = someOtherSigner;
      const teamMembersAllocation = tokensAmount(200000000);
      const teamMembersUnlockBonus = tokensAmount(10000000);
      const investorsAndDaoAllocation = tokensAmount(50000000);
      const investorsUnlockBonus = tokensAmount(2500000);
      await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
      await vestingContract.setDexLaunchDate(tomorrowTimestamp);
      await vestingContract.setStartDate(tomorrowTimestamp);
      // Act
      await vestingContract.addTeamMembers(teamMembersAddreses);
      await vestingContract.addInvestors(investorsAddresses);
      await vestingContract.addDAO(daoAddress.address);
      await vestingContract.initializeTokenDistribution();
      // Assert
      expect(await vestingContract.teamTokensAmount()).to.equal(teamMembersAllocation.sub(teamMembersUnlockBonus));
      expect(await vestingContract.teamTokensAmountOnUnlock()).to.equal(teamMembersUnlockBonus);
      expect(await vestingContract.investorsTokensAmount()).to.equal(investorsAndDaoAllocation.sub(investorsUnlockBonus));
      expect(await vestingContract.investorsTokensAmountOnUnlock()).to.equal(investorsUnlockBonus);
      expect(await vestingContract.daoTokensAmount()).to.equal(investorsAndDaoAllocation);
      expect(await vestingContract.investorsCount()).to.equal(investorsAddresses.length);
      expect(await vestingContract.teamMembersCount()).to.equal(teamMembersAddreses.length);
      expect(await vestingContract.daoCount()).to.equal(1);
    });
  })

  describe('Manage beneficiaries', () => {
    it('adds team members', async () => {
      const { vestingContract, deployerAddress, aSigner, anotherSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowTimestamp);

      await vestingContract.addTeamMember(deployerAddress);
      await vestingContract.addTeamMembers([aSigner.address, anotherSigner.address]);

      expect((await vestingContract.teamMembers(deployerAddress)).isRegistered).to.equal(true);
      expect((await vestingContract.teamMembers(aSigner.address)).isRegistered).to.equal(true);
      expect((await vestingContract.teamMembers(anotherSigner.address)).isRegistered).to.equal(true);
      expect(await vestingContract.teamMembersCount()).to.equal(3);
    });

    it('adds an investor', async () => {
      const { vestingContract, deployerAddress, aSigner, anotherSigner, tomorrowTimestamp } = await loadFixture(deployFixture);

      await vestingContract.setDexLaunchDate(tomorrowTimestamp);

      await vestingContract.addInvestor(deployerAddress);
      await vestingContract.addInvestors([aSigner.address, anotherSigner.address]);

      expect((await vestingContract.investors(deployerAddress)).isRegistered).to.equal(true);
      expect((await vestingContract.investors(aSigner.address)).isRegistered).to.equal(true);
      expect((await vestingContract.investors(anotherSigner.address)).isRegistered).to.equal(true);
      expect(await vestingContract.investorsCount()).to.equal(3);
    });

    it('adds a DAO', async () => {
      const { vestingContract, deployerAddress, tomorrowTimestamp } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowTimestamp);

      await vestingContract.addDAO(deployerAddress);

      expect((await vestingContract.dao(deployerAddress)).isRegistered).to.equal(true);
      expect(await vestingContract.daoCount()).to.equal(1);
    });

    it('reverts when adding addresses twice', async () => {
      const { vestingContract, deployerAddress, aSigner, anotherSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowTimestamp);
      await vestingContract.setDexLaunchDate(tomorrowTimestamp);
      await vestingContract.addTeamMember(aSigner.address);
      await vestingContract.addInvestor(anotherSigner.address);
      await vestingContract.addDAO(deployerAddress);

      await expect(vestingContract.addTeamMember(aSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addInvestor(anotherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding a different DAO address', async () => {
      const { vestingContract, deployerAddress, aDifferentSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowTimestamp);

      await vestingContract.addDAO(deployerAddress);

      await expect(vestingContract.addDAO(aDifferentSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__OnlyOneDAOAllowed")
    });

    it('reverts if a registered address is added to a different group', async () => {
      const { vestingContract, deployerAddress, aSigner, anotherSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowTimestamp);
      await vestingContract.setDexLaunchDate(tomorrowTimestamp);

      await vestingContract.addTeamMember(deployerAddress);
      await expect(vestingContract.addInvestor(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")

      await vestingContract.addInvestor(aSigner.address);
      await expect(vestingContract.addTeamMember(aSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addDAO(aSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")

      await vestingContract.addDAO(anotherSigner.address);
      await expect(vestingContract.addInvestor(anotherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addTeamMember(anotherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding addresses after the vesting period started', async () => {
      const { vestingContract, deployerAddress, yesterdayTimestamp } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(yesterdayTimestamp);
      await vestingContract.setDexLaunchDate(yesterdayTimestamp);

      await expect(vestingContract.addTeamMember(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__NotAllowedAfterVestingStarted")
      await expect(vestingContract.addInvestor(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__NotAllowedAfterVestingStarted")
      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__NotAllowedAfterVestingStarted")
    });
  })

  // Distribution among all members
  // TeamMembers --> 5% unlocked since June 2023. Linear vesting over 24 months
  // Investors --> 5 % unlocked at DEX Launch. Linear vesting over 24 months.
  // DAO --> Linear vesting over 36 months after DEX launch. Its one wallet.
  describe('Claiming', () => {
    // Scenarios for each group (Team, Investors, DAO):
    // Before the StartDate or the DEX Launch (0%)
    // During the vesting period (50%)
    // After the vesting period  (100%)
    it('reverts if a non-registered address tries to claim', async () => {
      const { vestingContract } = await loadFixture(deployFixture);
      await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotRegistered")
    });

    describe('as a Team Member', () => {
      it('reverts if tries to claim before the vesting period', async () => {
        const { vestingContract, deployerAddress, tomorrowTimestamp } = await loadFixture(deployFixture);
        await vestingContract.setStartDate(tomorrowTimestamp);
        await vestingContract.addTeamMember(deployerAddress);
        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });

      it('allows to claim the 5% unlock reward', async () => {
        // Asuming we have 2 team members.
        // 5% of 200,000,000 tokens = 10,000,000 tokens
        // Each team member gets 5,000,000 tokens (on first claim)
        // The 95% remaining tokens = 190.000.000 is split into the team members allocation
        // Arrange
        const fivePercentUnlockBonus = tokensAmount(5000000);
        const allocationPerInvestor = tokensAmount(190000000).div(2);
        const delta = tokensAmount(5);
        const { vestingContract, tokenContract, anotherSigner, aDifferentSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
        await vestingContract.setStartDate(tomorrowTimestamp);
        await vestingContract.addTeamMembers([aDifferentSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrowTimestamp);
        // Act
        await vestingContract.connect(aDifferentSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.teamMembers(aDifferentSigner.address);
        const anotherBeneficiary = await vestingContract.teamMembers(anotherSigner.address);
        expect(await tokenContract.balanceOf(aDifferentSigner.address)).to.be.closeTo(fivePercentUnlockBonus, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(fivePercentUnlockBonus, delta);
        expect(otherBeneficiary.claimed).to.be.closeTo(fivePercentUnlockBonus, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)
        expect(anotherBeneficiary.claimed).to.be.closeTo(fivePercentUnlockBonus, delta)
        expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(anotherBeneficiary.allocation).to.equal(allocationPerInvestor)
      })

      it('allows to claim the correct amount at 50% of the vesting period', async () => {
        // Asuming we have 2 team members.
        // 5% of 200,000,000 tokens = 10,000,000 tokens
        // Each team member gets 5,000,000 tokens (on first claim)
        // The 95% remaining tokens = 190.000.000 is split into the team members allocation
        // Arrange
        const fiveMillionTokens = tokensAmount(5000000);
        const allocationPerInvestor = tokensAmount(190000000).div(2);
        const delta = tokensAmount(4);
        const { vestingContract, tokenContract, anotherSigner, aDifferentSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
        await vestingContract.setStartDate(tomorrowTimestamp);
        await vestingContract.addTeamMembers([aDifferentSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrowTimestamp);
        // TODO: Review this
        await time.increase((time.duration.days((numberOfDaysInTwoYears / 2) - 2.5)));
        // Act
        await vestingContract.connect(aDifferentSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.teamMembers(aDifferentSigner.address);
        const anotherBeneficiary = await vestingContract.teamMembers(anotherSigner.address);
        const expectedBalanceForBeneficiares = allocationPerInvestor.div(2).add(fiveMillionTokens);
        expect(await tokenContract.balanceOf(aDifferentSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(otherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)
        expect(anotherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(anotherBeneficiary.allocation).to.equal(allocationPerInvestor)
      });

      it('allows to claims the correct amount at 100% of the vesting period', async () => {
        // Asuming we have 2 team members.
        // 5% of 200,000,000 tokens = 10,000,000 tokens
        // Each team member gets 5,000,000 tokens (on first claim)
        // The 95% remaining tokens = 190.000.000 is split into the team members allocation
        // Arrange
        const fiveMillionTokens = tokensAmount(5000000);
        const allocationPerInvestor = tokensAmount(190000000).div(2);
        const delta = tokensAmount(1);
        const { vestingContract, tokenContract, anotherSigner, aDifferentSigner } = await loadFixture(deployFixture);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setStartDate(tomorrow);
        await vestingContract.addTeamMembers([aDifferentSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrow);
        await time.increase(time.duration.days(numberOfDaysInTwoYears));
        // Act
        await vestingContract.connect(aDifferentSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.teamMembers(aDifferentSigner.address);
        const anotherBeneficiary = await vestingContract.teamMembers(anotherSigner.address);
        const expectedBalanceForBeneficiares = allocationPerInvestor.add(fiveMillionTokens);
        expect(await tokenContract.balanceOf(aDifferentSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(otherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)
        expect(anotherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(anotherBeneficiary.allocation).to.equal(allocationPerInvestor)
      });
    });

    describe('as an Investor', () => {
      it('reverts if tries to claim before the vesting period', async () => {
        const { vestingContract, deployerAddress, tomorrowTimestamp } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowTimestamp);
        await vestingContract.addInvestor(deployerAddress);

        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });

      it('allows to claim the 5% unlock reward', async () => {
        // Assuming we have 2 investors.
        // 5% of 50,000,000 tokens = 2,500,000 tokens. Each investor gets the unlock bonus on first claim (1,250,000 tokens)
        // Arrange
        const fivePercentUnlockBonus = tokensAmount(1250000);
        const allocationPerInvestor = tokensAmount(47500000).div(2);
        const delta = tokensAmount(1);
        const { vestingContract, tokenContract, anotherSigner, aDifferentSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowTimestamp);
        await vestingContract.addInvestors([aDifferentSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrowTimestamp);
        // Act
        await vestingContract.connect(aDifferentSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.investors(aDifferentSigner.address);
        const anotherBeneficiary = await vestingContract.investors(anotherSigner.address);
        expect(await tokenContract.balanceOf(aDifferentSigner.address)).to.be.closeTo(fivePercentUnlockBonus, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(fivePercentUnlockBonus, delta);
        expect(otherBeneficiary.claimed).to.be.closeTo(fivePercentUnlockBonus, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)
        expect(anotherBeneficiary.claimed).to.be.closeTo(fivePercentUnlockBonus, delta)
        expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(anotherBeneficiary.allocation).to.equal(allocationPerInvestor)
      });

      it('allows to claim the correct amount at 50% of the vesting period', async () => {
        // Assuming we have 2 investors.
        // 5% of 50,000,000 tokens = 2,500,000 tokens. Each investor gets the unlock bonus on first claim (1,250,000 tokens)
        // 95% remaining tokens = 47.500.000 is split into the investors allocation
        // When claiming, the investor should get 1,250,000 tokens plus 50% of the allocation = 11,875,000 tokens + 1,250,000 tokens = 25,000,000 tokens
        // Arrange
        const { vestingContract, tokenContract, anotherSigner, aDifferentSigner, tomorrowTimestamp } = await loadFixture(deployFixture);
        const fivePercentUnlockBonus = tokensAmount(1250000);
        const allocationPerInvestor = tokensAmount(47500000).div(2); // 23,750,000
        const delta = tokensAmount(1);
        await vestingContract.setDexLaunchDate(tomorrowTimestamp);
        await vestingContract.addInvestors([aDifferentSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrowTimestamp);
        // TODO: Review this
        await time.increase((time.duration.days((numberOfDaysInTwoYears / 2) - 2.5)));
        // Act
        await vestingContract.connect(aDifferentSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.investors(aDifferentSigner.address);
        const anotherBeneficiary = await vestingContract.investors(anotherSigner.address);
        // 23,750,000 / 2 = 11,875,000
        // 11,875,000 + 1,250,000 = 13,125,000
        const expectedBalanceForBeneficiares = allocationPerInvestor.div(2).add(fivePercentUnlockBonus);
        expect(await tokenContract.balanceOf(aDifferentSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(otherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)
        expect(anotherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(anotherBeneficiary.allocation).to.equal(allocationPerInvestor)
      });

      it('allows to claims the correct amount at 100% of the vesting period', async () => {
        // Assuming we have 2 investors.
        // 5% of 50,000,000 tokens = 2,500,000 tokens. Each investor gets the unlock bonus on first claim (1,250,000 tokens)
        // 95% remaining tokens = 47.500.000 is split into the investors allocation
        // When claiming, the investor should get 1,250,000 tokens plus 100% of the allocation = 23.750.000 tokens + 1,250,000 tokens = 25,000,000 tokens
        // Arrange
        const { vestingContract, tokenContract, anotherSigner, aDifferentSigner } = await loadFixture(deployFixture);
        const fivePercentUnlockBonus = tokensAmount(1250000);
        const allocationPerInvestor = tokensAmount(47500000).div(2); // 23,750,000
        const delta = tokensAmount(1);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setDexLaunchDate(tomorrow);
        await vestingContract.addInvestors([aDifferentSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrow);
        await time.increase(time.duration.days(numberOfDaysInTwoYears));
        // Act
        await vestingContract.connect(aDifferentSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.investors(aDifferentSigner.address);
        const anotherBeneficiary = await vestingContract.investors(anotherSigner.address);
        // 23,750,000 + 1,250,000 = 25,000,000
        const expectedBalanceForBeneficiares = allocationPerInvestor.add(fivePercentUnlockBonus);
        expect(await tokenContract.balanceOf(aDifferentSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
        expect(otherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)
        expect(anotherBeneficiary.claimed).to.be.closeTo(expectedBalanceForBeneficiares, delta)
        expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(anotherBeneficiary.allocation).to.equal(allocationPerInvestor)
      });
    });

    describe('as a DAO', () => {
      it('reverts if tries to claim before the vesting period', async () => {
        const { vestingContract, deployerAddress, tomorrowTimestamp } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowTimestamp);
        await vestingContract.addDAO(deployerAddress);

        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });

      it('allows to claim the correct amount at 50% of the vesting period', async () => {
        // 50,000,000 tokens linearly vested over 36 months
        // Arrange
        const allocation = tokensAmount(50000000);
        const { vestingContract, tokenContract, deployerAddress, tomorrowTimestamp } = await loadFixture(deployFixture);
        const delta = tokensAmount(1);
        await vestingContract.setDexLaunchDate(tomorrowTimestamp);
        await vestingContract.addDAO(deployerAddress);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrowTimestamp);
        await time.increase((time.duration.days((numberOfDaysInThreeYears / 2))));
        // Act
        await vestingContract.claim();
        // Assert
        const beneficiary = await vestingContract.dao(deployerAddress);
        expect(beneficiary.allocation).to.equal(allocation)
        expect(beneficiary.claimed).to.be.closeTo(allocation.div(2), delta);
        expect(await tokenContract.balanceOf(deployerAddress)).to.closeTo(allocation.div(2), delta);
      });

      it('allows to claims the correct amount at 100% of the vesting period', async () => {
        // Arrange
        const allocation = tokensAmount(50000000);
        const { vestingContract, tokenContract, deployerAddress, tomorrowTimestamp } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowTimestamp);
        await vestingContract.addDAO(deployerAddress);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistribution();
        await time.increaseTo(tomorrowTimestamp);
        await time.increase(time.duration.days(numberOfDaysInThreeYears));
        // Act
        await vestingContract.claim();
        // Assert
        const beneficiary = await vestingContract.dao(deployerAddress);
        expect(beneficiary.allocation).to.equal(allocation)
        expect(beneficiary.claimed).to.equal(allocation);
        expect(await tokenContract.balanceOf(deployerAddress)).to.equal(allocation);
      })
    });
  });
});



