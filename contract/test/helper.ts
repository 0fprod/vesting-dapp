import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Token } from "../typechain-types";

export async function moveTimeForwardInWeeks(numberOfWeeks = 1) {
  const oneWeekInSeconds = 604800;

  await mine(2, { interval: oneWeekInSeconds * numberOfWeeks });
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