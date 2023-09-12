import { ethers } from "hardhat";
import { Wallet, utils } from "zksync-web3";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

// load env file
import dotenv from "dotenv";
import { time } from "@nomicfoundation/hardhat-network-helpers";
dotenv.config();

// load wallet private key from env file
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || "";
const GALL_TOKEN_ADDRESS = process.env.GALL_TOKEN_ADDRESS || "";

if (!PRIVATE_KEY)
  throw "⛔️ Private key not detected! Add it to the .env file!";

// An example of a deploy script that will deploy and call a simple contract.
export default async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Running deploy script for the CoreTeamMembersVesting contract`);
  // Initialize the wallet.
  const wallet = new Wallet(PRIVATE_KEY);
  const gallTestnetAddress = GALL_TOKEN_ADDRESS;

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  const artifact = await deployer.loadArtifact("VestingCoreTeamMembers");

  // Estimate contract deployment fee
  const numberOfDaysInTwoYears = 735;
  const vestingDuration = time.duration.days(numberOfDaysInTwoYears);
  const septermberFirst = new Date("2023-09-01T00:00:00Z");
  const startDate = Math.floor(septermberFirst.getTime() / 1000);
  const deploymentFee = await deployer.estimateDeployFee(artifact, [gallTestnetAddress, startDate, vestingDuration]);

  // Deploy this contract.
  const parsedFee = ethers.utils.formatEther(deploymentFee.toString());
  console.log(`The deployment is estimated to cost ${parsedFee} ETH`);
  const teamMembersVestingContract = await deployer.deploy(artifact, [gallTestnetAddress, startDate, vestingDuration]);

  // Show the contract info.
  const contractAddress = teamMembersVestingContract.address;
  console.log(`${artifact.contractName} was deployed to ${contractAddress}`);

  // verify contract for tesnet & mainnet
  if (process.env.NODE_ENV != "test") {
    // Contract MUST be fully qualified name (e.g. path/sourceName:contractName)
    const contractFullyQualifedName = "contracts/VestingCoreTeamMembers.sol:VestingCoreTeamMembers";

    // Verify contract programmatically
    const verificationId = await hre.run("verify:verify", {
      address: contractAddress,
      contract: contractFullyQualifedName,
      constructorArguments: [gallTestnetAddress, startDate, vestingDuration],
      bytecode: artifact.bytecode,
    });
    console.log("🚀 ~ verificationId:", verificationId);
  } else {
    console.log(`Contract not verified, deployed locally.`);
  }
}