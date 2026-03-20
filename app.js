// ===== Konfigurace =====
const BET_TOKEN_ADDRESS = "0xbF7970D56a150cD0b60BD08388A4A75a27777777";

// Cílová adresa – normalizujeme ji až po načtení ethers.js
let TARGET_ADDRESS = "0x44008dC4C0A1E6cDce453D721E1cDbccF3BdF4C1";

const BET_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

let provider;
let signer;
let betContract;
let decimals = 18;

let rows = [];          // { index, sourceAddress, amountStr, statusCell, rowElement }
let csvRowsRaw = [];    // surová data z CSV

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

// ===== Kontrola správné adresy =====

async function ensureCorrectSigner(sourceAddress) {
  if (!signer) {
    alert("Nejprve připoj peněženku.");
    return false;
  }

  const active = await signer.getAddress();
  if (active.toLowerCase() !== sourceAddress.toLowerCase()) {
    activeAddressStatusEl.textContent =
      "Aktivní adresa v Rabby neodpovídá zdrojové adrese. Přepni v Rabby na správnou adresu.";
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

// ===== Robustní parser ručního vstupu =====

function parseManualInput() {
  const text = manualInput.value.trim();
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((line, idx) => {
      // Podpora: TAB, čárka, středník
      let parts = line.split(/[\t,;]+/).map(p => p.trim());

      const sourceAddress = parts[0];

      let amountStr = parts[1] || "";
      amountStr = amountStr.replace(",", "."); // česká čárka → tečka

      return {
        index: idx + 1,
        sourceAddress,
        amountStr
      };
    });
}

// ===== CSV načtení =====

csvInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  csvRowsRaw = [];

  lines.forEach((line, idx) => {
    const parts = line.split(/[\t,;]+/).map(p => p.trim());
    csvRowsRaw.push({
      index: idx + 1,
      sourceAddress: parts[0],
      amountStr: (parts[1] || "").replace(",", ".")
    });
  });

  log(`Načteno ${csvRowsRaw.length} řádků z CSV.`);
  rebuildTable();
});

// ===== Rekonstrukce tabulky =====

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

    // Validace adresy
    try {
      ethers.utils.getAddress(r.sourceAddress);
      tdStatus.textContent = "OK";
      tr.classList.add("ok-row");
    } catch {
      tdStatus.textContent = "Neplatná adresa";
      tr.classList.add("bad-row");
    }

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

// ===== Výpočet částky =====

async function computeAmountToSend(sourceAddress, amountStrFromCsv) {
  const mode = getMode();

  if (mode === "csv") {
    if (!amountStrFromCsv) throw new Error("Chybí částka");
    if (!/^[0-9]+(\.[0-9]+)?$/.test(amountStrFromCsv))
      throw new Error("Neplatné číslo (použij tečku)");
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
    return balance.mul(Math.floor(fraction * 10000)).div(10000);
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

    // 1) Kontrola aktivní adresy
    const ok = await ensureCorrectSigner(sourceAddress);
    if (!ok) {
      rowElement.classList.add("bad-row");
      statusCell.textContent = "Špatná aktivní adresa";
      log(`Řádek ${index}: Špatná aktivní adresa. Proces zastaven.`);
      sendBtn.disabled = false;
      return;
    }

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
      log(`Řádek ${index}: Nulová částka.`);
      continue;
    }

    const humanAmount = ethers.utils.formatUnits(amount, decimals);
    statusCell.textContent = "Odesílám " + humanAmount + " BET…";

    // 3) Odeslání transakce
    try {
      log(`Řádek ${index}: Odesílám ${humanAmount} BET z ${sourceAddress}.`);
      const tx = await betContract.transfer(TARGET_ADDRESS, amount);
      log(`Řádek ${index}: Tx: ${tx.hash}`);
      statusCell.textContent = "Čeká na potvrzení…";

      const receipt = await tx.wait();
      if (receipt.status === 1) {
        statusCell.textContent = "Hotovo";
        log(`Řádek ${index}: Transakce potvrzena.`);
      } else {
        statusCell.textContent = "Selhalo";
        log(`Řádek ${index}: Selhalo (receipt.status != 1).`);
      }
    } catch (err) {
      statusCell.textContent = "Chyba";
      rowElement.classList.add("bad-row");
      log(`Řádek ${index}: Chyba: ${err.message}`);
      continue;
    }
  }

  log("Proces odesílání dokončen.");
  sendBtn.disabled = false;
}

// ===== Export logu =====

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

// ===== Inicializace po načtení stránky =====

window.addEventListener("load", () => {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    signer = provider.getSigner();
    betContract = new ethers.Contract(BET_TOKEN_ADDRESS, BET_ABI, signer);

    // Normalizace cílové adresy – až teď existuje ethers
    try {
      TARGET_ADDRESS = ethers.utils.getAddress(TARGET_ADDRESS);
    } catch (e) {
      console.error("Neplatná cílová adresa:", e);
      alert("Neplatná cílová adresa v kódu.");
    }

    updateActiveAddress().catch(() => {});
  }
});
