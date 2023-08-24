import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, yesterDayDateInSeconds, tokensAmount, tomorrowDateInSeconds, addInvestors } from "./helper";

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
    const [deployer, otherSigner, anotherSigner] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const vestingFactory = await ethers.getContractFactory("Vesting")
    const vestingContract = await vestingFactory.deploy(tokenAddress);

    return { vestingContract, tokenContract, deployerAddress, otherSigner, anotherSigner };
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
      const { vestingContract } = await loadFixture(deployFixture);
      const startDate = new Date('2023-06-01T00:00:00.000Z');
      const startDateInSeconds = startDate.getTime() / 1000;
      await vestingContract.setStartDate(startDateInSeconds);
      await vestingContract.setDexLaunchDate(startDateInSeconds);

      expect(await vestingContract.startDate()).to.equal(startDateInSeconds);
      expect(await vestingContract.dexLaunchDate()).to.equal(startDateInSeconds);
    });

    it('initializes the correct tokens distributions', async () => {
      // Core team 20% -> 200,000,000 tokens (5% unlocked -> 10,000,000 tokens)
      // Investors 5% -> 50,000,000 tokens (5% unlocked -> 2,500,000 tokens)
      // DAO 5% -> 50,000,000 tokens
      const { vestingContract, tokenContract } = await loadFixture(deployFixture);
      const twoHundredMillionTokens = tokensAmount(200000000);
      const fiftyMillionTokens = tokensAmount(50000000);
      const tenMillionTokens = tokensAmount(10000000);
      const twoMillionsAndHalfTokens = tokensAmount(2500000);
      await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
      await vestingContract.initializeTokenDistributionsAmount();

      expect(await vestingContract.teamTokensAmount()).to.equal(twoHundredMillionTokens.sub(tenMillionTokens));
      expect(await vestingContract.teamTokensAmountOnUnlock()).to.equal(tenMillionTokens);
      expect(await vestingContract.investorsTokensAmount()).to.equal(fiftyMillionTokens.sub(twoMillionsAndHalfTokens));
      expect(await vestingContract.investorsTokensAmountOnUnlock()).to.equal(twoMillionsAndHalfTokens);
      expect(await vestingContract.daoTokensAmount()).to.equal(fiftyMillionTokens);
    });
  })


  describe('Manage beneficiaries', () => {
    it('adds a team member', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowDateInSeconds());

      await vestingContract.addTeamMember(deployerAddress);

      expect((await vestingContract.teamMembers(deployerAddress)).isRegistered).to.equal(true);
    });

    it('adds an investor', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addInvestor(deployerAddress);

      expect((await vestingContract.investors(deployerAddress)).isRegistered).to.equal(true);
    });

    it('adds a DAO', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addDAO(deployerAddress);

      expect((await vestingContract.dao(deployerAddress)).isRegistered).to.equal(true);
      expect(await vestingContract.daoCount()).to.equal(1);
    });

    it('adds several team members', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowDateInSeconds());

      await vestingContract.addTeamMembers([deployerAddress, otherSigner.address]);

      expect((await vestingContract.teamMembers(deployerAddress)).isRegistered).to.equal(true);
      expect((await vestingContract.teamMembers(otherSigner.address)).isRegistered).to.equal(true);
      expect(await vestingContract.teamMembersCount()).to.equal(2);
    });

    it('adds several investors', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addInvestors([deployerAddress, otherSigner.address]);

      expect((await vestingContract.investors(deployerAddress)).isRegistered).to.equal(true);
      expect((await vestingContract.investors(otherSigner.address)).isRegistered).to.equal(true);
      expect(await vestingContract.investorsCount()).to.equal(2);
    });

    it('reverts when adding a team member twice', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowDateInSeconds());

      await vestingContract.addTeamMember(deployerAddress);

      await expect(vestingContract.addTeamMember(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding an investor twice', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addInvestor(deployerAddress);

      await expect(vestingContract.addInvestor(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding a DAO twice', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addDAO(deployerAddress);

      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding a different DAO address', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addDAO(deployerAddress);

      await expect(vestingContract.addDAO(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__OnlyOneDAOAllowed")
    });

    it('reverts if a team member or dao is added as investor', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowDateInSeconds());
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addTeamMember(deployerAddress);
      await vestingContract.addDAO(otherSigner.address);

      await expect(vestingContract.addInvestor(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addInvestor(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts if an investor or dao is added as team member', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());
      await vestingContract.setStartDate(tomorrowDateInSeconds());

      await vestingContract.addInvestor(deployerAddress);
      await vestingContract.addDAO(otherSigner.address);

      await expect(vestingContract.addTeamMember(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addTeamMember(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts if an investor or team member is added as DAO', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(tomorrowDateInSeconds());
      await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());

      await vestingContract.addInvestor(deployerAddress);
      await vestingContract.addTeamMember(otherSigner.address);

      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addDAO(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts if a team member is added after the vesting period started', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setStartDate(yesterDayDateInSeconds());

      await expect(vestingContract.addTeamMember(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__NotAllowedAfterVestingStarted")
    });

    it('reverts if an investor is added after the vesting period started', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(yesterDayDateInSeconds());

      await expect(vestingContract.addInvestor(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__NotAllowedAfterVestingStarted")
    });

    it('reverts if a DAO is added after the vesting period started', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.setDexLaunchDate(yesterDayDateInSeconds());

      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__NotAllowedAfterVestingStarted")
    });
  })

  // Distribution among all members
  // TeamMembers --> 5% unlocked since June 2023. Linear vesting over 24 months
  // Investors --> 5 % unlocked at DEX Launch.Linear vesting over 24 months.
  // DAO --> Linear vesting over 36 months after DEX launch. Its one wallet.
  describe('Claiming', () => {
    // Scenarios
    // Before the StartDate or the DEX Launch (0%)
    // During the vesting period (50%)
    // After the vesting period  (100%)
    it('reverts if a non-registered address tries to claim', async () => {
      const { vestingContract } = await loadFixture(deployFixture);
      await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotRegistered")
    });

    describe('as a Team Member', () => {
      it('reverts if tries to claim before the vesting period', async () => {
        const startDateInSeconds = new Date('2024-01-01T00:00:00.000Z').getTime() / 1000;
        const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
        await vestingContract.setStartDate(startDateInSeconds);
        await vestingContract.addTeamMember(deployerAddress);
        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });

      it('allows to claim the 5% unlock reward', async () => {
        // 5% of 200,000,000 tokens = 10,000,000 tokens
        // Each team member gets 5,000,000 tokens (on first claim)
        // The 95% remaining tokens = 190.000.000 is split into the team members allocation
        const fiveMillionTokens = tokensAmount(5000000);
        const allocationPerInvestor = tokensAmount(190000000).div(2);
        const delta = tokensAmount(5);
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setStartDate(tomorrow);
        await vestingContract.addTeamMembers([otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);

        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        const otherBeneficiary = await vestingContract.teamMembers(otherSigner.address);
        const anotherBeneficiary = await vestingContract.teamMembers(anotherSigner.address);

        expect(await tokenContract.balanceOf(otherSigner.address)).to.be.closeTo(fiveMillionTokens, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(fiveMillionTokens, delta);

        expect(otherBeneficiary.claimed).to.be.closeTo(fiveMillionTokens, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)

        expect(anotherBeneficiary.claimed).to.be.closeTo(fiveMillionTokens, delta)
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
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setStartDate(tomorrow);
        await vestingContract.addTeamMembers([otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);
        await time.increase((time.duration.days((numberOfDaysInTwoYears / 2) - 2.5)));
        // Act
        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.teamMembers(otherSigner.address);
        const anotherBeneficiary = await vestingContract.teamMembers(anotherSigner.address);
        const expectedBalanceForBeneficiares = allocationPerInvestor.div(2).add(fiveMillionTokens);
        expect(await tokenContract.balanceOf(otherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
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
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setStartDate(tomorrow);
        await vestingContract.addTeamMembers([otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);
        await time.increase(time.duration.days(numberOfDaysInTwoYears));
        // Act
        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.teamMembers(otherSigner.address);
        const anotherBeneficiary = await vestingContract.teamMembers(anotherSigner.address);
        const expectedBalanceForBeneficiares = allocationPerInvestor.add(fiveMillionTokens);
        expect(await tokenContract.balanceOf(otherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
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
        const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());
        await vestingContract.addInvestor(deployerAddress);

        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });

      it('allows to claim the 5% unlock reward', async () => {
        // 5% of 50,000,000 tokens = 2,500,000 tokens
        // Each investor gets 1,250,000 tokens (on first claim)
        // The 95% remaining tokens = 47.500.000 is split into the investors allocation
        const oneMillionTwoHundredFiftyThousandTokens = tokensAmount(1250000);
        const allocationPerInvestor = tokensAmount(47500000).div(2);
        const delta = tokensAmount(1);
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setDexLaunchDate(tomorrow);
        await addInvestors(vestingContract, [otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);

        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        const otherBeneficiary = await vestingContract.investors(otherSigner.address);
        const anotherBeneficiary = await vestingContract.investors(anotherSigner.address);

        expect(await tokenContract.balanceOf(otherSigner.address)).to.be.closeTo(oneMillionTwoHundredFiftyThousandTokens, delta);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.be.closeTo(oneMillionTwoHundredFiftyThousandTokens, delta);

        expect(otherBeneficiary.claimed).to.be.closeTo(oneMillionTwoHundredFiftyThousandTokens, delta)
        expect(otherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(otherBeneficiary.allocation).to.equal(allocationPerInvestor)

        expect(anotherBeneficiary.claimed).to.be.closeTo(oneMillionTwoHundredFiftyThousandTokens, delta)
        expect(anotherBeneficiary.hasClaimedUnlockedTokens).to.equal(true);
        expect(anotherBeneficiary.allocation).to.equal(allocationPerInvestor)
      });

      it('allows to claim the correct amount at 50% of the vesting period', async () => {
        // 5% of 50,000,000 tokens = 2,500,000 tokens
        // Each investor gets 1,250,000 tokens (on first claim)
        // The 95% remaining tokens = 47.500.000 is split into the investors allocation
        // So if the investor claims at 50% of the vesting period
        // he should get 1,250,000 tokens plus 50 % of the 47.500.000 tokens = 23.750.000 tokens
        // Arrange
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        const fivePercentUnlockBonus = tokensAmount(1250000);
        const allocationPerInvestor = tokensAmount(47500000).div(2); // 23,750,000
        const delta = tokensAmount(1);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setDexLaunchDate(tomorrow);
        await addInvestors(vestingContract, [otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);
        await time.increase((time.duration.days((numberOfDaysInTwoYears / 2) - 2.5)));
        // Act
        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.investors(otherSigner.address);
        const anotherBeneficiary = await vestingContract.investors(anotherSigner.address);
        // 23,750,000 / 2 = 11,875,000
        // 11,875,000 + 1,250,000 = 13,125,000
        const expectedBalanceForBeneficiares = allocationPerInvestor.div(2).add(fivePercentUnlockBonus);
        expect(await tokenContract.balanceOf(otherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
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
        // So if the investor claims at 100% of the vesting period
        // he should get 1,250,000 tokens plus 100% of the allocation = 23.750.000 tokens + 1,250,000 tokens = 25,000,000 tokens
        // Arrange
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        const fivePercentUnlockBonus = tokensAmount(1250000);
        const allocationPerInvestor = tokensAmount(47500000).div(2); // 23,750,000
        const delta = tokensAmount(1);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        await vestingContract.setDexLaunchDate(tomorrow);
        await addInvestors(vestingContract, [otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);
        await time.increase(time.duration.days(numberOfDaysInTwoYears));
        // Act
        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();
        // Assert
        const otherBeneficiary = await vestingContract.investors(otherSigner.address);
        const anotherBeneficiary = await vestingContract.investors(anotherSigner.address);
        // 23,750,000 + 1,250,000 = 25,000,000
        const expectedBalanceForBeneficiares = allocationPerInvestor.add(fivePercentUnlockBonus);
        expect(await tokenContract.balanceOf(otherSigner.address)).to.be.closeTo(expectedBalanceForBeneficiares, delta);
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
        const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());
        await vestingContract.addDAO(deployerAddress);

        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });

      it('allows to claim the correct amount at 50% of the vesting period', async () => {
        // 50,000,000 tokens linearly vested over 36 months
        const allocation = tokensAmount(50000000);
        const { vestingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
        const tomorrow = await time.latest() + time.duration.seconds(10);
        const delta = tokensAmount(1);
        await vestingContract.setDexLaunchDate(tomorrow);
        await vestingContract.addDAO(deployerAddress);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);
        await time.increase((time.duration.days(numberOfDaysInThreeYears / 2)));

        await vestingContract.claim();
        const beneficiary = await vestingContract.dao(deployerAddress);

        expect(beneficiary.allocation).to.equal(allocation)
        expect(beneficiary.claimed).to.be.closeTo(allocation.div(2), delta);
        expect(await tokenContract.balanceOf(deployerAddress)).to.closeTo(allocation.div(2), delta);
      });

      it('allows to claims the correct amount at 100% of the vesting period', async () => {
        const allocation = tokensAmount(50000000);
        const { vestingContract, tokenContract, deployerAddress } = await loadFixture(deployFixture);
        const tomorrow = await time.latest() + time.duration.days(1);
        await vestingContract.setDexLaunchDate(tomorrow);
        await vestingContract.addDAO(deployerAddress);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await time.increaseTo(tomorrow);
        await time.increase(time.duration.days(numberOfDaysInThreeYears));

        await vestingContract.claim();
        const beneficiary = await vestingContract.dao(deployerAddress);

        expect(beneficiary.allocation).to.equal(allocation)
        expect(beneficiary.claimed).to.equal(allocation);
        expect(await tokenContract.balanceOf(deployerAddress)).to.equal(allocation);
      })
    });
  });
});



