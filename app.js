// ===== Konfigurace =====
const BET_TOKEN_ADDRESS = "0xbF7970D56a150cD0b60BD08388A4A75a27777777";
const TARGET_ADDRESS = "0x44008dC4C0A1E6cDce453D721E1cDbccF3BdF4C1"; // uprav podle sebe

const BET_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

let provider;
let signer;
let betContract;
let decimals = 18;

let rows = []; // { index, sourceAddress, amountStr, statusCell, rowElement }

const logEl = document.getElementById("log");
const activeAddressEl = document.getElementById("activeAddress");
const activeAddressStatusEl = document.getElementById("activeAddressStatus");
const addressesBodyEl = document.getElementById("addressesBody");
const connectBtn = document.getElementById("connectBtn");
const sendBtn = document.getElementById("sendBtn");
const exportLogBtn = document.getElementById("exportLogBtn");
const csvInput = document.getElementById("csvInput");
const percentInput = document.getElementById("percentInput");
const manualInput = document.getElementById("manualInput");

let logLines = [];

// ===== Logging =====

function log(msg) {
  const time = new Date().toISOString().substring(11, 19);
  const line = `[${time}] ${msg}`;
  logLines.push(line);
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// ===== Peněženka =====

async function connectWallet() {
  if (!window.ethereum) {
    alert("Nebyla nalezena žádná peněženka (Rabby / MetaMask).");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();

  const network = await provider.getNetwork();
  if (network.chainId !== 137) {
    alert("Přepni síť v Rabby na Polygon (chainId 137).");
  }

  betContract = new ethers.Contract(BET_TOKEN_ADDRESS, BET_ABI, signer);
  decimals = await betContract.decimals();

  await updateActiveAddress();
  log("Peněženka připojena.");
  sendBtn.disabled = rows.length === 0;
}

// ===== Aktivní adresa =====

async function updateActiveAddress() {
  if (!signer) {
    activeAddressEl.textContent = "Nepřipojeno";
    activeAddressStatusEl.textContent = "";
    activeAddressStatusEl.className = "";
    return null;
  }

  try {
    const active = await signer.getAddress();
    activeAddressEl.textContent = active;
    activeAddressStatusEl.textContent = "Aktivní adresa je načtena.";
    activeAddressStatusEl.className = "status-ok";
    return active;
  } catch (e) {
    activeAddressEl.textContent = "Chyba při čtení adresy";
    activeAddressStatusEl.textContent = "";
    activeAddressStatusEl.className = "";
    return null;
  }
}

// Vrátí true/false podle toho, zda je aktivní adresa = zdrojová
async function ensureCorrectSigner(sourceAddress) {
  if (!signer) {
    alert("Nejprve připoj peněženku.");
    return false;
  }

  const active = await signer.getAddress();
  if (active.toLowerCase() !== sourceAddress.toLowerCase()) {
    activeAddressStatusEl.textContent =
      "Aktivní adresa v Rabby neodpovídá zdrojové adrese. Přepni v Rabby na správnou adresu a klikni znovu.";
    activeAddressStatusEl.className = "status-bad";

    alert(
      "V Rabby je aktivní jiná adresa.\n\n" +
      "Aktivní:   " + active + "\n" +
      "Očekávaná: " + sourceAddress + "\n\n" +
      "Přepni v Rabby na správnou adresu a spusť odesílání znovu."
    );
    return false;
  }

  activeAddressStatusEl.textContent = "Aktivní adresa odpovídá zdrojové adrese.";
  activeAddressStatusEl.className = "status-ok";
  return true;
}

// ===== Režim odesílání =====

function getMode() {
  const radios = document.querySelectorAll('input[name="mode"]');
  for (const r of radios) {
    if (r.checked) return r.value;
  }
  return "csv";
}

// ===== Ruční vstup =====

function parseManualInput() {
  const text = manualInput.value.trim();
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((line, idx) => {
      const parts = line.split(",").map(p => p.trim());
      return {
        index: idx + 1,
        sourceAddress: parts[0],
        amountStr: parts[1] || ""
      };
    });
}

// ===== CSV načtení =====

let csvRowsRaw = []; // jen surová data z CSV

csvInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  csvRowsRaw = [];

  lines.forEach((line, idx) => {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length < 1) return;
    csvRowsRaw.push({
      index: idx + 1,
      sourceAddress: parts[0],
      amountStr: parts[1] || ""
    });
  });

  log(`Načteno ${csvRowsRaw.length} řádků z CSV.`);
  rebuildTable();
});

// ===== Rekonstrukce tabulky z CSV + ručního vstupu =====

function rebuildTable() {
  const manualRows = parseManualInput();
  const allRows = [...manualRows, ...csvRowsRaw];

  addressesBodyEl.innerHTML = "";
  rows = [];

  allRows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    const tdIndex = document.createElement("td");
    const tdAddr = document.createElement("td");
    const tdAmount = document.createElement("td");
    const tdStatus = document.createElement("td");

    tdIndex.textContent = idx + 1;
    tdAddr.textContent = r.sourceAddress;
    tdAmount.textContent = r.amountStr;
    tdStatus.textContent = "Čeká";

    tr.appendChild(tdIndex);
    tr.appendChild(tdAddr);
    tr.appendChild(tdAmount);
    tr.appendChild(tdStatus);

    addressesBodyEl.appendChild(tr);

    rows.push({
      index: idx + 1,
      sourceAddress: r.sourceAddress,
      amountStr: r.amountStr,
      statusCell: tdStatus,
      rowElement: tr
    });
  });

  sendBtn.disabled = rows.length === 0 || !signer;
}

manualInput.addEventListener("input", rebuildTable);

// ===== Výpočet částky podle režimu =====

async function computeAmountToSend(sourceAddress, amountStrFromCsv) {
  const mode = getMode();

  if (mode === "csv") {
    if (!amountStrFromCsv || amountStrFromCsv.trim() === "") {
      throw new Error("V režimu CSV chybí částka.");
    }
    return ethers.utils.parseUnits(amountStrFromCsv, decimals);
  }

  const balance = await betContract.balanceOf(sourceAddress);

  if (mode === "all") {
    return balance;
  }

  if (mode === "percent") {
    const percent = parseFloat(percentInput.value || "0");
    if (isNaN(percent) || percent <= 0 || percent > 100) {
      throw new Error("Neplatné procento.");
    }
    const fraction = percent / 100;
    const amount = balance.mul(ethers.BigNumber.from(Math.floor(fraction * 10000))).div(10000);
    return amount;
  }

  throw new Error("Neznámý režim.");
}

// ===== Odesílání =====

async function sendAll() {
  if (!signer || !betContract) {
    alert("Nejprve připoj peněženku.");
    return;
  }

  if (rows.length === 0) {
    alert("Nejsou načteny žádné adresy.");
    return;
  }

  sendBtn.disabled = true;
  log("Proces odesílání zahájen. Režim: " + getMode());

  for (const row of rows) {
    const { sourceAddress, amountStr, statusCell, rowElement, index } = row;

    // 1) Kontrola, že aktivní adresa = zdrojová
    const ok = await ensureCorrectSigner(sourceAddress);
    if (!ok) {
      rowElement.classList.remove("ok-row");
      rowElement.classList.add("bad-row");
      statusCell.textContent = "Špatná aktivní adresa v Rabby";
      log(`Řádek ${index}: Špatná aktivní adresa v Rabby. Proces zastaven.`);
      sendBtn.disabled = false;
      return; // tvrdé zastavení – uživatel přepne adresu a spustí znovu
    }

    rowElement.classList.remove("bad-row");
    rowElement.classList.add("ok-row");
    statusCell.textContent = "Ověřeno, počítám částku…";

    // 2) Výpočet částky
    let amount;
    try {
      amount = await computeAmountToSend(sourceAddress, amountStr);
    } catch (e) {
      statusCell.textContent = "Chyba částky: " + e.message;
      log(`Řádek ${index}: Chyba částky: ${e.message}`);
      continue;
    }

    if (amount.isZero()) {
      statusCell.textContent = "Nulová částka, přeskočeno";
      log(`Řádek ${index}: Nulová částka, přeskočeno.`);
      continue;
    }

    const humanAmount = ethers.utils.formatUnits(amount, decimals);
    statusCell.textContent = "Ověřeno, odesílám " + humanAmount + " BET…";

    // 3) Odeslání transakce
    try {
      log(`Řádek ${index}: Připravuji transakci z ${sourceAddress} na ${humanAmount} BET.`);
      const tx = await betContract.transfer(TARGET_ADDRESS, amount);
      log(`Řádek ${index}: Odesláno, čekám na potvrzení... Tx: ${tx.hash}`);
      statusCell.textContent = "Odesláno, čeká na potvrzení";

      const receipt = await tx.wait();
      if (receipt.status === 1) {
        statusCell.textContent = "Hotovo";
        log(`Řádek ${index}: Transakce potvrzena.`);
      } else {
        statusCell.textContent = "Selhalo (receipt.status != 1)";
        log(`Řádek ${index}: Transakce selhala (receipt.status != 1).`);
      }
    } catch (err) {
      statusCell.textContent = "Chyba při odesílání";
      rowElement.classList.add("bad-row");
      log(
        `Řádek ${index}: Chyba při odesílání z ${sourceAddress}: ${err.message || err}`
      );
      continue;
    }
  }

  log("Proces odesílání dokončen.");
  sendBtn.disabled = false;
}

// ===== Export logu do CSV =====

function exportLogToCsv() {
  if (logLines.length === 0) {
    alert("Log je prázdný.");
    return;
  }

  const header = "time,message";
  const rowsCsv = logLines.map(line => {
    const match = line.match(/^\[(.*?)\]\s*(.*)$/);
    if (!match) return `,${JSON.stringify(line)}`;
    const time = match[1];
    const msg = match[2].replace(/"/g, '""');
    return `"${time}","${msg}"`;
  });

  const csvContent = [header, ...rowsCsv].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "bet-sweep-log.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== Eventy =====

connectBtn.addEventListener("click", connectWallet);
sendBtn.addEventListener("click", sendAll);
exportLogBtn.addEventListener("click", exportLogToCsv);

// při loadu zkusíme načíst aktivní adresu (pokud už je peněženka připojená)
window.addEventListener("load", () => {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    signer = provider.getSigner();
    betContract = new ethers.Contract(BET_TOKEN_ADDRESS, BET_ABI, signer);
    updateActiveAddress().catch(() => {});
  }
});
