require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const { Wallet, ethers } = require("ethers");
const { config } = require("./config.js");
const { loadData, saveJson, sleep } = require("./utils.js");
const colors = require("colors");

if (!config.REF_CODE) {
  console.error("❌ Not found referral code!");
  process.exit(1);
}

function generateWallet() {
  return Wallet.createRandom();
}

function createSiweMessage(address) {
  const nonce = ethers.hexlify(ethers.randomBytes(32)).slice(2);
  const timestamp = new Date().toISOString();
  return (
    `klokapp.ai wants you to sign in with your Ethereum account:\n${address}\n\n\n` + 
    `URI: https://klokapp.ai/\n` + 
    `Version: 1\n` + 
    `Chain ID: 1\n` + 
    `Nonce: ${nonce}\n` + 
    `Issued At: ${timestamp}`
  );
}

async function signMessageAndRegister(wallet) {
  const address = wallet.address;
  const message = createSiweMessage(address);
  console.log(`📝 Signing Message for ${address}`);
  const signedMessage = await wallet.signMessage(message);
  const payload = { signedMessage, message, referral_code: config.REF_CODE };

  try {
    const response = await axios.post(`${config.API_BASE_URL}/verify`, payload, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        Origin: "https://klokapp.ai",
        Referer: "https://klokapp.ai/",
      }
    });

    if (response.data.message === "Verification successful") {
      console.log(`✅ Sign ${address} success! Wallet info saved to wallets.txt | Private key saved to privateKeys.txt`.green);
      const data = `\nAddress: ${address}\nPrivate key: ${wallet.privateKey}\nSeed phrase: ${wallet.mnemonic.phrase || JSON.stringify(wallet.mnemonic)}\n==============================`;
      fs.appendFileSync("wallets.txt", data, "utf8");
      fs.appendFileSync("privateKeys.txt", `\n${wallet.privateKey}`, "utf8");
      const token = response.data.session_token;
      saveJson(address, token, "tokens.json");
      return token;
    } else {
      console.log(`Register ${address} failed!`.yellow, JSON.stringify(response.data));
    }
  } catch (error) {
    console.error(`❌ Failed to sign ${address}:`, error.response ? JSON.stringify(error.response.data || {}) : error.message);
  }
}

async function main() {
  console.log(colors.yellow("Tool developed by the Airdrop Hunter Siêu Tốc team (https://t.me/airdrophuntersieutoc)"));
  console.log(colors.magenta(`\nNumber of refs: ${config.AMOUNT_REF} | Ref code: ${config.REF_CODE}`));

  for (let i = 0; i < config.AMOUNT_REF; i++) {
    const wallet = generateWallet();
    console.log(`\n[${i + 1}/${config.AMOUNT_REF}] Starting wallet ${wallet.address}`.blue);
    await signMessageAndRegister(wallet);
  }
}

main();
