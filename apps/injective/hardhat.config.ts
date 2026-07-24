import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import * as dotenv from "dotenv"

dotenv.config()

const PRIVATE_KEY = process.env.PRIVATE_KEY
const RPC_URL = process.env.INJ_TESTNET_RPC_URL || "https://k8s.testnet.json-rpc.injective.network/"

/**
 * Injective EVM testnet (chainId 1439). Blockscout is the verifier; there is no
 * real Etherscan key, `nil` satisfies the toolbox. See
 * https://docs.injective.network/developers-evm/network-information
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Paris keeps the bytecode free of PUSH0/mcopy/transient-storage so it runs
      // on Injective's EVM regardless of its hardfork level.
      evmVersion: "paris",
    },
  },
  networks: {
    // Local dev node mirrors Injective's chainId so EIP-712 signatures made for
    // 1439 validate against it (the domain binds chainId to block.chainid).
    hardhat: { chainId: 1439 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 1439 },
    inj_testnet: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 1439,
    },
  },
  etherscan: {
    apiKey: { inj_testnet: "nil" },
    customChains: [
      {
        network: "inj_testnet",
        chainId: 1439,
        urls: {
          apiURL: "https://testnet.blockscout-api.injective.network/api",
          browserURL: "https://testnet.blockscout.injective.network/",
        },
      },
    ],
  },
  sourcify: { enabled: false },
}

export default config
