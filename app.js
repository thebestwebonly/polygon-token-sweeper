let provider;
let signer;
let tokenContract;
let tokenDecimals = 18;
let addresses = [];
let balances = {};
let plan = []; // { address, balance, amountToSend, status, txHash, rowEl, statusEl, amountEl }
let exportLog = []; // { address, amount, txHash, status }

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

function log(msg) {
  const logsEl = document.getElementById("logs");
  const line = document.createElement("div");
  line.textContent = msg;
  logsEl.prepend(line);
}

function isValidAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("Nebyla nalezena žádná peněženka (Rabby / MetaMask).");
    return;
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });

  provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = provider.getSigner();

  // Přepnout na Polygon
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0x89" }]
  });

  const addr = await signer.getAddress();
  document.getElementById("walletInfo").textContent = `Připojeno jako: ${addr}`;
  log("Peněženka připojena a síť nastavena na Polygon.");
}

async function loadTokenInfo() {
  const tokenAddress = document.getElementById("tokenAddressInput").value.trim();
  if (!isValidAddress(tokenAddress)) {
    alert("Neplatná adresa tokenu.");
    return;
  }

  if (!provider) {
    alert("Nejprve připojte peněženku.");
    return;
  }

  tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  try {
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals()
    ]);
    tokenDecimals = decimals;
    document.getElementById("tokenInfo").textContent =
      `Token: ${name} (${symbol}), decimals: ${decimals}`;
    log(`Načten token ${name} (${symbol}).`);
  } catch (e) {
    console.error(e);
    alert("Nepodařilo se načíst informace o tokenu. Je to platný ERC‑20 na Polygonu?");
  }
}

function parseAddresses() {
  const raw = document.getElementById("addressesInput").value.split("\n");
  const cleaned = raw
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const unique = [...new Set(cleaned)];
  const valid = unique.filter(isValidAddress);
  const invalid = unique.filter(a => !isValidAddress(a));

  if (invalid.length > 0) {
    alert("Nalezeny neplatné adresy:\n" + invalid.join("\n"));
  }

  addresses = valid;
  log(`Platných adres: ${addresses.length}`);
}

function getMinBalanceX() {
  const v = document.getElementById("minBalanceInput").value;
  const x = parseFloat(v || "0");
  return x >= 0 ? x : 0;
}

function getStrategy() {
  const radios = document.querySelectorAll("input[name='strategy']");
  let value = "send_all";
  radios.forEach(r => {
    if (r.checked) value = r.value;
  });
  return value;
}

function getStrategyY(strategy) {
  if (strategy === "send_all_except") {
    return parseFloat(document.getElementById("strategyAllExceptInput").value || "0");
  }
  if (strategy === "send_fixed") {
    return parseFloat(document.getElementById("strategyFixedInput").value || "0");
  }
  if (strategy === "send_percent") {
    return parseFloat(document.getElementById("strategyPercentInput").value || "0");
  }
  if (strategy === "send_at_least") {
    return parseFloat(document.getElementById("strategyAtLeastInput").value || "0");
  }
  return 0;
}

async function loadBalances() {
  parseAddresses();

  const targetAddress = document.getElementById("targetAddressInput").value.trim();
  if (!isValidAddress(targetAddress)) {
    alert("Neplatná cílová adresa.");
    return;
  }

  if (!provider || !signer) {
    alert("Nejprve připojte peněženku.");
    return;
  }

  if (!tokenContract) {
    await loadTokenInfo();
    if (!tokenContract) return;
  }

  if (addresses.length === 0) {
    alert("Žádná platná adresa.");
    return;
  }

  const minX = getMinBalanceX();
  const strategy = getStrategy();
  const Y = getStrategyY(strategy);

  const tbody = document.querySelector("#balancesTable tbody");
  tbody.innerHTML = "";
  balances = {};
  plan = [];
  exportLog = [];
  document.getElementById("exportCsvBtn").disabled = true;

  document.getElementById("balancesStatus").textContent = "Načítám zůstatky...";
  log("Načítám zůstatky...");

  for (const addr of addresses) {
    const balanceWei = await tokenContract.balanceOf(addr);
    const balance = parseFloat(ethers.utils.formatUnits(balanceWei, tokenDecimals));
    balances[addr] = balance;

    const row = document.createElement("tr");
    const tdAddr = document.createElement("td");
    const tdBal = document.createElement("td");
    const tdX = document.createElement("td");
    const tdAmount = document.createElement("td");
    const tdStatus = document.createElement("td");

    tdAddr.textContent = addr;
    tdBal.textContent = balance.toString();

    let eligible = balance >= minX;
    tdX.textContent = eligible ? "✔" : "✖";

    let amountToSend = 0;
    if (eligible) {
      if (strategy === "send_all") {
        amountToSend = balance;
      } else if (strategy === "send_all_except") {
        amountToSend = Math.max(balance - Y, 0);
      } else if (strategy === "send_fixed") {
        amountToSend = Math.min(balance, Y);
      } else if (strategy === "send_percent") {
        amountToSend = balance * (Y / 100);
      } else if (strategy === "send_at_least") {
        amountToSend = balance >= Y ? Y : 0;
      }
    }

    if (amountToSend > 0) {
      plan.push({
        address: addr,
        balance,
        amountToSend,
        status: "Připraveno",
        txHash: null,
        rowEl: row,
        statusEl: tdStatus,
        amountEl: tdAmount
      });
      tdAmount.textContent = amountToSend.toString();
      tdStatus.textContent = "Připraveno";
    } else {
      tdAmount.textContent = "-";
      tdStatus.textContent = eligible ? "Nic k odeslání" : "Přeskočeno (zůstatek < X)";
    }

    row.appendChild(tdAddr);
    row.appendChild(tdBal);
    row.appendChild(tdX);
    row.appendChild(tdAmount);
    row.appendChild(tdStatus);
    tbody.appendChild(row);
  }

  document.getElementById("balancesStatus").textContent =
    `Načteno. Adres k odeslání: ${plan.length}`;
  document.getElementById("startSendingBtn").disabled = plan.length === 0;
}

async function sendAll() {
  if (!provider || !signer) {
    alert("Nejprve připojte peněženku.");
    return;
  }

  const targetAddress = document.getElementById("targetAddressInput").value.trim();
  const tokenAddress = document.getElementById("tokenAddressInput").value.trim();

  if (!isValidAddress(targetAddress) || !isValidAddress(tokenAddress)) {
    alert("Neplatná cílová nebo token adresa.");
    return;
  }

  const total = plan.length;
  let done = 0;

  for (const item of plan) {
    const { address, amountToSend, statusEl, amountEl } = item;

    log(`Připravuje se transakce z adresy ${address} na ${amountToSend} tokenů.`);
    statusEl.textContent = "Čeká na podpis...";

    try {
      const localSigner = provider.getSigner(); // uživatel musí mít přepnutý správný účet
      const contractWithSigner = new ethers.Contract(tokenAddress, ERC20_ABI, localSigner);
      const amountWei = ethers.utils.parseUnits(
        amountToSend.toString(),
        tokenDecimals
      );

      const tx = await contractWithSigner.transfer(targetAddress, amountWei);
      log(`Odesláno, čekám na potvrzení... Tx: ${tx.hash}`);
      const receipt = await tx.wait();

      item.txHash = receipt.transactionHash;
      item.status = "Odesláno";
      statusEl.textContent = "Odesláno";
      amountEl.textContent = amountToSend.toString();
      done++;
      document.getElementById("progress").textContent =
        `Hotovo ${done} / ${total}`;

      exportLog.push({
        address,
        amount: amountToSend,
        txHash: item.txHash,
        status: item.status
      });
    } catch (e) {
      console.error(e);
      item.status = "Chyba";
      statusEl.textContent = "Chyba (viz log)";
      log(`Chyba při odesílání z ${address}: ${e.message}`);

      exportLog.push({
        address,
        amount: amountToSend,
        txHash: "",
        status: "Chyba"
      });
    }
  }

  log("Proces odesílání dokončen.");
  document.getElementById("exportCsvBtn").disabled = exportLog.length === 0;
}

function exportToCsv() {
  if (!exportLog.length) {
    alert("Žádná data k exportu.");
    return;
  }

  const header = ["address", "amount", "txHash", "status"];
  const rows = exportLog.map(item => [
    item.address,
    item.amount,
    item.txHash,
    item.status
  ]);

  const csvContent = [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "polygon-token-sweeper-log.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById("connectWalletBtn").addEventListener("click", connectWallet);
document.getElementById("tokenAddressInput").addEventListener("change", loadTokenInfo);
document.getElementById("loadBalancesBtn").addEventListener("click", loadBalances);
document.getElementById("startSendingBtn").addEventListener("click", sendAll);
document.getElementById("exportCsvBtn").addEventListener("click", exportToCsv);
