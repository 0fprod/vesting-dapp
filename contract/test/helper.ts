import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Token, Vesting, VestingCoreTeamMembers } from "../typechain-types";

export function tokensAmount(amount: number): BigNumber {
  return ethers.utils.parseEther(`${amount}`)
}

export function formatUnits(amount: BigNumber): number {
  return +ethers.utils.formatUnits(amount, 18)
}

export function mintTokensFor(tokenContract: Token, signer: SignerWithAddress, amount: number) {
  return tokenContract.connect(signer).faucet(signer.address, tokensAmount(amount))
}

export async function approveAndFundContract(stakingContract: Vesting | VestingCoreTeamMembers, tokenContract: Token, amount: number) {
  const tokens = tokensAmount(amount);
  await approveWith(tokenContract, stakingContract.address, amount);
  await stakingContract.fundContractWithErc20Token(tokens)
}

export async function approveWith(tokenContract: Token, address: string, amount: number) {
  const tokens = ethers.utils.parseEther(`${amount}`);
  await tokenContract.approve(address, tokens);
}

export function getAllocations() {
  return [
    25127900.1,
    12897973.4,
    2416339.5,
    238588.1,
    3172714.7,
    0,
    1096490.2,
    243664.5,
    791909.6,
    266508.0,
    3563593.1,
    7913765.6,
    16124116.6,
    1281015.3,
    761451.5,
    0,
    913741.8,
    2783105.3,
    50763.4,
    356359.3
  ]
}