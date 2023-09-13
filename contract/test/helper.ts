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

export async function approveWith(tokenContract: Token, address: string, amount: number) {
  const tokens = ethers.utils.parseEther(`${amount}`);
  await tokenContract.approve(address, tokens);
}

export function getTeamMembers() {
  return [
    '0x71647Ab44704077583BCEcD42575b9b2a7607872',
    '0xd2417Bf5A86f706e09bE22e293C14Dba73FdE829',
    '0x7F38948e90598bb27dCF32EC01d8B68DfdE716e2',
    '0xE34c3C37D689E8e992448b70266d0CCCc4971F2f',
    '0xe5dce4d59cddd87630be13acaaf0cdf273bbf98d',
    '0xC6D98b10238739d472cf185976212d8801ce2380',
    '0xE2378b2D4f4C60f655b47f95D6a6D19a2bE28621',
    '0x096ae55563D37b8A9AFC5F6273B2dD1AdFC2Ab98',
    '0x2477d97E71F7738d48e86aF5a107616F71F43263',
    '0x0beb120460983644f1DF6eFfbb57aF7A90670384',
    '0xa6688219AEaA9fc07199693Ce6075F27DE4E9Cc3',
    '0x474DA53C8AcC2eADeDf3584186AdDa01B065A0cF',
    '0xc059046Cf19b3a13a8E50c3398D9D1AB8E3DE900',
    '0xE375B53D7cba19754dDE42abE6ea3280b9c219dE',
    '0x826F65df35A601af66dBDD35273f8Ecf144De4B6',
    '0x0fB213a1Af101b1429e6aD3020ad92Fb0D25Eb1E',
    '0x62A416e4a1be90E54828Bb488B3eE36c121312a0',
    '0xD34A7095B8aAd4A4A125a2bFaB003A030f319Fc3',
    '0xB2E38bb0Bbd8498Eb01bFdA1055e6D6c2cDCF1F5',
    '0x615beCC64183562B4aBF2D215d16D02396E16F75',
  ]
}

export function getAllocations() {
  return [
    tokensAmount(25127900.1),
    tokensAmount(12897973.4),
    tokensAmount(2416339.5),
    tokensAmount(238588.1),
    tokensAmount(3172714.7),
    tokensAmount(0),
    tokensAmount(1096490.2),
    tokensAmount(243664.5),
    tokensAmount(791909.6),
    tokensAmount(266508.0),
    tokensAmount(3563593.1),
    tokensAmount(7913765.6),
    tokensAmount(16124116.6),
    tokensAmount(1281015.3),
    tokensAmount(761451.5),
    tokensAmount(0),
    tokensAmount(913741.8),
    tokensAmount(2783105.3),
    tokensAmount(50763.4),
    tokensAmount(356359.3)
  ]
}