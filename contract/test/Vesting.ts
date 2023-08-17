import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, yesterDayDateInSeconds, tokensAmount, addTeamMembers, moveTimeForwardInDays, tomorrowDateInSeconds, addInvestors } from "./helper";

describe("Vesting contract", function () {
  const oneBillionNumber = 1000000000
  const oneBillionTokens = tokensAmount(oneBillionNumber);

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

      expect(await vestingContract.teamTokensAmount()).to.equal(twoHundredMillionTokens);
      expect(await vestingContract.teamTokensAmountOnUnlock()).to.equal(tenMillionTokens);
      expect(await vestingContract.investorsTokensAmount()).to.equal(fiftyMillionTokens);
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
  // DAO --> Linear vesting over 36 months. Its one wallet.
  describe('Claiming', () => {
    // Scenarios
    // Before the StartDate or the DEX Launch
    // During the vesting period 
    // After the vesting period 
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
        // Each team member gets 5,000,000 tokens
        const fiveMillionTokens = tokensAmount(5000000);
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        await vestingContract.setStartDate(tomorrowDateInSeconds());
        await addTeamMembers(vestingContract, [otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await moveTimeForwardInDays(2);

        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();

        expect(await tokenContract.balanceOf(otherSigner.address)).to.equal(fiveMillionTokens);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.equal(fiveMillionTokens);
      })
    });

    describe('as an Investor or DAO', () => {
      it('reverts if tries to claim before the vesting period', async () => {
        const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());
        await vestingContract.addInvestor(deployerAddress);
        await vestingContract.addDAO(otherSigner.address);

        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
        const connectedVestingContract = await vestingContract.connect(otherSigner)
        await expect(connectedVestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });

      it('allows to claim the 5% unlock reward', async () => {
        // 5% of 50,000,000 tokens = 2,500,000 tokens
        // Each investor gets 1,250,000 tokens
        const oneMillionTwoHundredFiftyThousandTokens = tokensAmount(1250000);
        const { vestingContract, tokenContract, anotherSigner, otherSigner } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(tomorrowDateInSeconds());
        await addInvestors(vestingContract, [otherSigner.address, anotherSigner.address]);
        await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
        await vestingContract.initializeTokenDistributionsAmount();
        await moveTimeForwardInDays(2);

        await vestingContract.connect(otherSigner).claim();
        await vestingContract.connect(anotherSigner).claim();

        expect(await tokenContract.balanceOf(otherSigner.address)).to.equal(oneMillionTwoHundredFiftyThousandTokens);
        expect(await tokenContract.balanceOf(anotherSigner.address)).to.equal(oneMillionTwoHundredFiftyThousandTokens);
      });
    });
  });
});



