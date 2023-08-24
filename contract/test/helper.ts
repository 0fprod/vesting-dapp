import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Token, Vesting } from "../typechain-types";

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