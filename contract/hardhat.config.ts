import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";
import 'hardhat-watcher'
import dotenv from 'dotenv';

dotenv.config();
const GOERLI_RPC_URL = process.env.GOERLI_RPC_URL || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || '';

const config: HardhatUserConfig = {
  // compilers
  solidity: "0.8.18",
  zksolc: {
    version: "1.3.13", // Uses latest available in https://github.com/matter-labs/zksolc-bin/
    settings: {},
  },
  defaultNetwork: "zkSyncTestnet",
  // networks
  networks: {
    hardhat: {
      chainId: 1337, // Hardhat default
    },
    zkSyncTestnet: {
      url: "https://testnet.era.zksync.dev",
      ethNetwork: "goerli",  // or a Goerli RPC endpoint from Infura/Alchemy/Chainstack etc.
      zksync: true,
    },
  },
  // Tests watcher
  watcher: {
    test: {
      tasks: [{ command: 'test', params: { testFiles: ['{path}'] } }],
      files: ['./test/**/*'],
      verbose: true,
      clearOnStart: true,
      start: 'echo Running my test task now..',
    },
    compilation: {
      tasks: ['compile'],
      files: ['./contracts'],
      ignoredFiles: ['**/.vscode'],
      verbose: true,
      clearOnStart: true,
      start: 'echo Running my compilation task now..',
    },
  },
  // Gas reporter
  gasReporter: {
    currency: 'EUR',
    enabled: false,
    coinmarketcap: COINMARKETCAP_API_KEY,
  },
};

export default config;
