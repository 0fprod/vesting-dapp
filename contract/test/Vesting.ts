import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { approveAndFundContract, tokensAmount } from "./helper";

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
    const [deployer, otherSigner] = await ethers.getSigners();
    const deployerAddress = deployer.address
    const { tokenContract } = await loadFixture(deployErc20Fixture);
    const tokenAddress = tokenContract.address;
    const vestingFactory = await ethers.getContractFactory("Vesting")
    const vestingContract = await vestingFactory.deploy(tokenAddress);

    return { vestingContract, tokenContract, deployerAddress, otherSigner };
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
      // Core team 20% -> 200,000,000 tokens, 5% unlocked since June 2023. Linear vesting over 24 months. Among all the members.
      // Investors 5% -> 50,000,000 tokens, 5% unlocked at DEX Launch. Linear vesting over 24 months.
      // DAO 5% -> 50,000,000 tokens, 5% unlocked at DEX Launch. Linear vesting over 36 months. Its one wallet.
      const { vestingContract, tokenContract } = await loadFixture(deployFixture);
      const twoHundredMillionTokens = tokensAmount(200000000);
      const fiftyMillionTokens = tokensAmount(50000000);
      await approveAndFundContract(vestingContract, tokenContract, oneBillionNumber);
      await vestingContract.initializeTokenDistributionsAmount();

      expect(await vestingContract.teamTokensAmount()).to.equal(twoHundredMillionTokens);
      expect(await vestingContract.investorsTokensAmount()).to.equal(fiftyMillionTokens);
      expect(await vestingContract.daoTokensAmount()).to.equal(fiftyMillionTokens);
    });
  })

  describe('Manage beneficiaries', () => {
    it('adds a team member', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.addTeamMember(deployerAddress);
      expect((await vestingContract.teamMembers(deployerAddress)).isRegistered).to.equal(true);
    });

    it('adds an investor', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.addInvestor(deployerAddress);
      expect((await vestingContract.investors(deployerAddress)).isRegistered).to.equal(true);
    });

    it('adds a DAO', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.addDAO(deployerAddress);
      expect((await vestingContract.dao(deployerAddress)).isRegistered).to.equal(true);
    });

    it('adds several team members', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.addTeamMembers([deployerAddress, otherSigner.address]);
      expect((await vestingContract.teamMembers(deployerAddress)).isRegistered).to.equal(true);
      expect((await vestingContract.teamMembers(otherSigner.address)).isRegistered).to.equal(true);
    });

    it('adds several investors', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.addInvestors([deployerAddress, otherSigner.address]);
      expect((await vestingContract.investors(deployerAddress)).isRegistered).to.equal(true);
      expect((await vestingContract.investors(otherSigner.address)).isRegistered).to.equal(true);
    });

    it('reverts when adding a team member twice', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.addTeamMember(deployerAddress);
      await expect(vestingContract.addTeamMember(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding an investor twice', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.addInvestor(deployerAddress);
      await expect(vestingContract.addInvestor(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding a DAO twice', async () => {
      const { vestingContract, deployerAddress } = await loadFixture(deployFixture);
      await vestingContract.addDAO(deployerAddress);
      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts when adding a different DAO address', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.addDAO(deployerAddress);
      await expect(vestingContract.addDAO(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__OnlyOneDAOAllowed")
    });

    it('reverts if a team member or dao is added as investor', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.addTeamMember(deployerAddress);
      await vestingContract.addDAO(otherSigner.address);

      await expect(vestingContract.addInvestor(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addInvestor(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts if an investor or dao is added as team member', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.addInvestor(deployerAddress);
      await vestingContract.addDAO(otherSigner.address);
      await expect(vestingContract.addTeamMember(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addTeamMember(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });

    it('reverts if an investor or team member is added as DAO', async () => {
      const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
      await vestingContract.addInvestor(deployerAddress);
      await vestingContract.addTeamMember(otherSigner.address);
      await expect(vestingContract.addDAO(deployerAddress)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
      await expect(vestingContract.addDAO(otherSigner.address)).to.be.revertedWithCustomError(vestingContract, "Vesting__AlreadyRegistered")
    });
  })

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
    });

    describe('as an Investor or DAO', () => {
      it('reverts if tries to claim before the vesting period', async () => {
        const dexLaunchDateInSeconds = new Date('2024-01-01T00:00:00.000Z').getTime() / 1000;
        const { vestingContract, deployerAddress, otherSigner } = await loadFixture(deployFixture);
        await vestingContract.setDexLaunchDate(dexLaunchDateInSeconds);
        await vestingContract.addInvestor(deployerAddress);
        await vestingContract.addDAO(otherSigner.address);

        await expect(vestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
        const connectedVestingContract = await vestingContract.connect(otherSigner)
        await expect(connectedVestingContract.claim()).to.be.revertedWithCustomError(vestingContract, "Vesting__NotVestingPeriod")
      });
    });

    // it('claims the correct amount of tokens after the vesting period', async () => { });
  });
});



