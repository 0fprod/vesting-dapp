import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Token, Vesting } from "../typechain-types";

export async function moveTimeForwardInDays(numberOfDays = 1) {
  const oneDayInSeconds = 3600 * 24;

  await mine(2, { interval: oneDayInSeconds * numberOfDays });
}

export function tokensAmount(amount: number): BigNumber {
  return ethers.utils.parseEther(`${amount}`)
}

export function formatUnits(amount: BigNumber): number {
  return +ethers.utils.formatUnits(amount, 18)
}

export function mintTokensFor(tokenContract: Token, signer: SignerWithAddress, amount: number) {
  return tokenContract.connect(signer).faucet(signer.address, tokensAmount(amount))
}

export async function approveAndFundContract(stakingContract: Vesting, tokenContract: Token, amount: number) {
  const tokens = tokensAmount(amount);
  await approveWith(tokenContract, stakingContract.address, amount);
  await stakingContract.fundContractWithErc20Token(tokens)
}

export async function approveWith(tokenContract: Token, address: string, amount: number) {
  const tokens = ethers.utils.parseEther(`${amount}`);
  await tokenContract.approve(address, tokens);
}

export async function addTeamMembers(vestingContract: Vesting, beneficiaries: string[]) {
  const promises = beneficiaries.map(beneficiary => vestingContract.addTeamMember(beneficiary));
  await Promise.all(promises);
}

export async function addInvestors(vestingContract: Vesting, beneficiaries: string[]) {
  const promises = beneficiaries.map(beneficiary => vestingContract.addInvestor(beneficiary));
  await Promise.all(promises);
}

export function yesterDayDateInSeconds() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return Math.floor(date.getTime() / 1000);
}

export function tomorrowDateInSeconds() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return Math.floor(date.getTime() / 1000);
}