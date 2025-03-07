const { v4: uuidv4 } = require("uuid");
const { Wallet, ethers } = require("ethers");
const fs = require("fs");
const axios = require("axios");
const colors = require("colors");
const { loadData, saveJson, getRandomElement, getRandomNumber, sleep, randomDelay } = require("./utils.js");
const { config } = require("./config.js");

const questions = loadData("questions.txt");

function showBanner() {
  console.log(colors.yellow("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)"));
}

function log(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  switch (type) {
    case "success":
      console.log(`[${timestamp}] [✓] ${msg}`.green);
      break;
    case "custom":
      console.log(`[${timestamp}] [*] ${msg}`.magenta);
      break;
    case "error":
      console.log(`[${timestamp}] [✗] ${msg}`.red);
      break;
    case "warning":
      console.log(`[${timestamp}] [!] ${msg}`.yellow);
      break;
    default:
      console.log(`[${timestamp}] [ℹ] ${msg}`.blue);
  }
}

function getRandomMessage() {
  return getRandomElement(questions);
}

function getRandomInterval() {
  return getRandomNumber(config.DELAY_CHAT[0], config.DELAY_CHAT[1]) * 1000;
}

function createApiClient(token) {
  return axios.create({
    baseURL: config.API_BASE_URL,
    headers: {
      "x-session-token": token,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      origin: "https://klokapp.ai",
      referer: "https://klokapp.ai/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    },
    timeout: 30000,
  });
}

async function resetToken() {
  fs.writeFileSync("token.json", JSON.stringify({}), "utf8");
  console.log("tokens.json has been reset to {}".green);
}

async function checkRateLimit(apiClient, accountIndex) {
  try {
    const response = await apiClient.get("/rate-limit");
    return {
      hasRemaining: response.data.remaining > 0,
      resetTime: response.data.reset_time,
      remaining: response.data.remaining,
    };
  } catch (error) {
    log(`Account ${accountIndex + 1}: Error checking limit: ${error.message}`, "error");
    return { hasRemaining: false, resetTime: 0, remaining: 0 };
  }
}

async function getThreads(apiClient) {
  try {
    const response = await apiClient.get("/threads");
    return response.data.data;
  } catch (error) {
    log(`Error fetching thread list: ${error.message}`, "error");
    return [];
  }
}

async function createNewThread(apiClient, message) {
  const threadId = uuidv4();
  const chatData = {
    id: threadId,
    messages: [{ role: "user", content: message }],
    model: "llama-3.3-70b-instruct",
    created_at: new Date().toISOString(),
    language: "english",
  };

  try {
    await apiClient.post("/chat", chatData);
    log(`New conversation created successfully with ID: ${threadId}`, "success");
    return { id: threadId };
  } catch (error) {
    log(`Unable to create new conversation: ${error.message}`, "error");
    return null;
  }
}

async function sendMessageToThread(apiClient, threadId, message) {
  try {
    const chatData = {
      id: threadId,
      messages: [{ role: "user", content: message }],
      model: "llama-3.3-70b-instruct",
      created_at: new Date().toISOString(),
      language: "english",
    };

    await apiClient.post("/chat", chatData);
    log(`Message sent successfully to thread: ${threadId}`, "success");
  } catch (error) {
    log(`Error sending message: ${error.message}`, "error");
  }
}

async function checkPoints(apiClient, accountIndex) {
  try {
    const response = await apiClient.get("/points");
    log(`Account ${accountIndex + 1} | Points: ${response.data.total_points || 0}`, "custom");
    return response.data;
  } catch (error) {
    log(`Error reading points for account ${accountIndex + 1}: ${error.message}`, "error");
    return null;
  }
}

async function handleAccount(token, accountIndex) {
  log(`Processing account ${accountIndex + 1}...`);
  const apiClient = createApiClient(token);

  const pointsData = await checkPoints(apiClient, accountIndex);
  const rateLimitInfo = await checkRateLimit(apiClient, accountIndex);

  if (!rateLimitInfo.hasRemaining) return;

  const threads = await getThreads(apiClient);
  let currentThreadId = threads.length > 0 ? threads[0].id : null;

  if (!currentThreadId) {
    const newThread = await createNewThread(apiClient, "Starting new conversation");
    if (newThread) currentThreadId = newThread.id;
  }

  return { token, apiClient, currentThreadId, accountIndex };
}

function createSiweMessage(address) {
  return `klokapp.ai wants you to sign in with your Ethereum account:\n${address}\n\nURI: https://klokapp.ai/\nVersion: 1\nChain ID: 1\nNonce: ${ethers.hexlify(ethers.randomBytes(32)).slice(2)}\nIssued At: ${new Date().toISOString()}`;
}

async function getNewToken(wallet) {
  const address = wallet.address;
  const message = createSiweMessage(address);
  console.log(`📝 Signing Message for ${address}`.blue);
  const signedMessage = await wallet.signMessage(message);

  try {
    const response = await axios.post(`${config.API_BASE_URL}/verify`, { signedMessage, message, referral_code: config.REFERRAL_CODE }, { headers: { "Content-Type": "application/json" } });
    if (response.data.message === "Verification successful") {
      console.log(`✅ Login ${address} success!`);
      const token = response.data.session_token;
      saveJson(address, token, "tokens.json");
      return token;
    }
  } catch (error) {
    console.error(`❌ Login failed for ${address}: ${error.message}`);
  }
  return null;
}

async function runBot() {
  showBanner();
  const tokens = require("./tokens.json");
  const privateKeys = loadData("privateKeys.txt");

  const accountPromises = privateKeys.map(async (privateKey, index) => {
    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const wallet = new ethers.Wallet(formattedKey);
    let token = tokens[wallet.address] || await getNewToken(wallet);

    if (!token) return null;

    await sleep(getRandomNumber(config.DELAY_START_BOT[0], config.DELAY_START_BOT[1]));

    return await handleAccount(token, index);
  });

  const accounts = (await Promise.all(accountPromises)).filter(Boolean);

  async function processAccounts() {
    for (const account of accounts) {
      const message = getRandomMessage();
      log(`Account ${account.accountIndex + 1}: Sending message: "${message}"`, "info");
      await sendMessageToThread(account.apiClient, account.currentThreadId, message);
      await sleep(getRandomInterval() / 1000);
    }
    setTimeout(processAccounts, getRandomInterval());
  }

  processAccounts();
}

runBot().catch((error) => {
  log(`Bot crashed: ${error}`, "error");
  process.exit(1);
});
