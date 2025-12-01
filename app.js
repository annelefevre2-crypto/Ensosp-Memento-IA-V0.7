// ======================================================
// Mémento opérationnel IA – RCH
// app.js — Version QR Optimisée (Option A)
// ------------------------------------------------------
// - Compression optimisée (deflateRaw + base64)
// - Wrapper compact { z:"p1", d:"..." }
// - QR codes lisibles, taille réduite x4 à x10
// - Génération QR fiable (niveau M, marges adaptées)
// - Lecture QR via QrScanner (caméra + fichier)
// - Variables : texte / nombre / géoloc
// - Compilation du prompt + envoi vers ChatGPT, Perplexity, Mistral
// ======================================================

// État global
let qrScanner = null;
let isCameraRunning = false;
let currentFiche = null;
let variableCounter = 0;

// ======================================================
// INITIALISATION
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
  initVersion();
  initTabs();
  initCreateTab();
  initReadTab();
});

// ------------------------------------------------------
// Version automatique affichée dans le header
// ------------------------------------------------------
function initVersion() {
  const el = document.getElementById("app-version");
  if (!el) return;

  const now = new Date();
  const v = now.toISOString().slice(0, 10).replace(/-/g, ".");
  el.textContent = "V" + v;
}

// ------------------------------------------------------
// Gestion des onglets
// ------------------------------------------------------
function initTabs() {
  const btnRead = document.getElementById("tab-btn-read");
  const btnCreate = document.getElementById("tab-btn-create");
  const tabRead = document.getElementById("tab-read");
  const tabCreate = document.getElementById("tab-create");

  btnRead.addEventListener("click", () => {
    btnRead.classList.add("active");
    btnCreate.classList.remove("active");
    tabRead.classList.add("active");
    tabCreate.classList.remove("active");
  });

  btnCreate.addEventListener("click", () => {
    btnCreate.classList.add("active");
    btnRead.classList.remove("active");
    tabCreate.classList.add("active");
    tabRead.classList.remove("active");
  });
}

// ======================================================
// ONGLET CREATION
// ======================================================

function initCreateTab() {
  const preprompt = document.getElementById("preprompt");
  const counter = document.getElementById("preprompt-count");
  const btnAddVar = document.getElementById("btn-add-variable");
  const btnGenerateQR = document.getElementById("btn-generate-qr");
  const btnReset = document.getElementById("btn-reset-create");
  const btnDownloadQR = document.getElementById("btn-download-qr");

  // compteur de caractères
  preprompt.addEventListener("input", () => {
    counter.textContent = preprompt.value.length;
  });

  addVariableRow();

  btnAddVar.addEventListener("click", addVariableRow);
  btnGenerateQR.addEventListener("click", generateFicheAndQR);
  btnReset.addEventListener("click", resetCreateTab);
  btnDownloadQR.addEventListener("click", downloadGeneratedQR);
}

// ------------------------------------------------------
// Ajout d’une ligne de variable
// ------------------------------------------------------
function addVariableRow() {
  const container = document.getElementById("variables-container");
  const btnAdd = document.getElementById("btn-add-variable");

  if (variableCounter >= 10) {
    btnAdd.disabled = true;
    return;
  }

  variableCounter++;
  const row = document.createElement("div");
  row.className = "variable-row";

  row.innerHTML = `
    <div class="form-group"><input class="var-label" placeholder="Label" /></div>
    <div class="form-group"><input class="var-id" placeholder="Identifiant" /></div>
    <div class="form-group">
      <select class="var-type">
        <option value="text">Texte</option>
        <option value="number">Nombre</option>
        <option value="geolocation">Géolocalisation</option>
      </select>
    </div>
    <div class="var-required">
      <input type="checkbox" class="var-required-check" />
      <label>Obligatoire</label>
    </div>
    <button class="btn ghost small var-remove-btn">Supprimer</button>
  `;

  row.querySelector(".var-remove-btn").addEventListener("click", () => {
    row.remove();
    variableCounter--;
    btnAdd.disabled = false;
  });

  container.appendChild(row);
}

// ------------------------------------------------------
// Génération QR : fiche → JSON → compress → base64 → QR
// ------------------------------------------------------
function generateFicheAndQR() {
  const errorEl = document.getElementById("create-error");
  errorEl.textContent = "";

  try {
    const fiche = buildFicheFromCreateForm();
    const payload = buildWrapperAndCompress(fiche);
    renderQRCode(payload);

    document.getElementById("qr-section").style.display = "block";
  } catch (e) {
    errorEl.textContent = e.message || "Erreur inconnue.";
  }
}

// ------------------------------------------------------
// Construction fiche JSON depuis formulaire
// ------------------------------------------------------
function buildFicheFromCreateForm() {
  const fiche = {
    meta: {
      category: getInput("meta-category"),
      title: getInput("meta-title"),
      objective: getInput("meta-objective"),
      author: getInput("meta-author"),
      date: getInput("meta-date"),
      version: getInput("meta-version"),
    },

    trust: {
      chatgpt: Number(getInput("trust-chatgpt")),
      perplexity: Number(getInput("trust-perplexity")),
      mistral: Number(getInput("trust-mistral")),
    },

    variables: [],
    preprompt: getInput("preprompt"),
  };

  if (!fiche.meta.category || !fiche.meta.title || !fiche.preprompt) {
    throw new Error("Catégorie, Titre et Pré-prompt sont obligatoires.");
  }

  const rows = document.querySelectorAll(".variable-row");
  rows.forEach((row) => {
    const label = row.querySelector(".var-label").value.trim();
    const id = row.querySelector(".var-id").value.trim();
    const type = row.querySelector(".var-type").value;
    const required = row.querySelector(".var-required-check").checked;

    if (label || id) {
      if (!label || !id) throw new Error("Chaque variable doit avoir label + identifiant");

      fiche.variables.push({ label, id, type, required });
    }
  });

  return fiche;
}

// ======================================================
// COMPRESSION OPTIMISÉE (Option A)
// ======================================================

function buildWrapperAndCompress(fiche) {
  const json = JSON.stringify(fiche);

  // Compression binaire RAW → optimisation maximale
  const compressed = pako.deflateRaw(json);

  // Conversion binary → base64
  const base64 = uint8ToBase64(compressed);

  // Wrapper minimal
  return JSON.stringify({ z: "p1", d: base64 });
}

// Conversion Uint8Array vers base64 compacte
function uint8ToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

// ======================================================
// AFFICHAGE DU QR CODE (Option A optimisée)
// ======================================================

function renderQRCode(payload) {
  const container = document.getElementById("qr-output");
  container.innerHTML = "";

  new QRCode(container, {
    text: payload,
    width: 400,
    height: 400,
    margin: 4,
    correctLevel: QRCode.CorrectLevel.M, // densité plus faible = meilleur scan
  });
}

// ------------------------------------------------------
// Téléchargement du QR généré
// ------------------------------------------------------
function downloadGeneratedQR() {
  const canvas = document.querySelector("#qr-output canvas");
  if (!canvas) return alert("QR non généré.");

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "qr-fiche-rch.png";
  link.click();
}

// ------------------------------------------------------
// Reset onglet création
// ------------------------------------------------------
function resetCreateTab() {
  [
    "meta-category",
    "meta-title",
    "meta-objective",
    "meta-author",
    "meta-date",
    "meta-version",
    "preprompt",
  ].forEach((id) => (document.getElementById(id).value = ""));

  document.getElementById("preprompt-count").textContent = "0";
  document.getElementById("qr-output").innerHTML = "";
  document.getElementById("qr-section").style.display = "none";
  document.getElementById("create-error").textContent = "";

  document.getElementById("variables-container").innerHTML = "";
  variableCounter = 0;
  addVariableRow();
}

// ======================================================
// UTILITAIRES
// ======================================================
function getInput(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

// ======================================================
// ONGLET LECTURE
// ======================================================

function initReadTab() {
  document.getElementById("btn-start-camera").addEventListener("click", toggleCamera);
  document.getElementById("file-input").addEventListener("change", onFileImport);
  document.getElementById("btn-reset-read").addEventListener("click", resetReadTab);
  document.getElementById("read-extra-info").addEventListener("input", updateCompiledPrompt);
  document.getElementById("btn-copy-prompt").addEventListener("click", copyCompiledPrompt);

  document.querySelectorAll(".ia-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!btn.disabled) sendPromptToIA(btn.dataset.ia);
    });
  });
}

// ------------------------------------------------------
// Caméra
// ------------------------------------------------------
function toggleCamera() {
  if (isCameraRunning) stopCamera();
  else startCamera();
}

function startCamera() {
  const video = document.getElementById("qr-video");
  const wrapper = document.getElementById("video-wrapper");
  const errorEl = document.getElementById("read-error");

  if (!qrScanner) {
    QrScanner.WORKER_PATH =
      "https://unpkg.com/qr-scanner@1.4.2/qr-scanner-worker.min.js";

    qrScanner = new QrScanner(
      video,
      (result) => handleQrResult(result),
      {
        preferredCamera: "environment",
      }
    );
  }

  qrScanner
    .start()
    .then(() => {
      isCameraRunning = true;
      wrapper.classList.add("active");
      document.getElementById("btn-start-camera").textContent = "Arrêter la caméra";
    })
    .catch(() => {
      errorEl.textContent =
        "Impossible d'accéder à la caméra. Vérifiez les autorisations.";
    });
}

function stopCamera() {
  if (qrScanner) qrScanner.stop();
  isCameraRunning = false;
  document.getElementById("video-wrapper").classList.remove("active");
  document.getElementById("btn-start-camera").textContent = "Activer la caméra";
}

// ------------------------------------------------------
// Lecture par fichier
// ------------------------------------------------------
function onFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  QrScanner.scanImage(file)
    .then((result) => handleQrResult(result))
    .catch(() => {
      document.getElementById("read-error").textContent =
        "Impossible de lire le QR depuis le fichier.";
    });
}

// ------------------------------------------------------
// Décodage du QR (Option A → wrapper p1)
// ------------------------------------------------------
function handleQrResult(text) {
  stopCamera();
  document.getElementById("read-error").textContent = "";

  try {
    const parsed = JSON.parse(text);

    // wrapper optimisé
    if (parsed.z === "p1") {
      const binary = atob(parsed.d);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const jsonStr = pako.inflateRaw(bytes, { to: "string" });
      currentFiche = JSON.parse(jsonStr);
    } else {
      throw new Error("QR code non compatible avec Option A.");
    }

    renderReadForm(currentFiche);
  } catch (e) {
    document.getElementById("read-error").textContent =
      "Impossible de décoder la fiche : " + e.message;
  }
}

// ------------------------------------------------------
// Affichage du formulaire de lecture
// ------------------------------------------------------
function renderReadForm(fiche) {
  const form = document.getElementById("read-form");
  form.style.display = "block";

  document.getElementById("read-category").value = fiche.meta.category || "";
  document.getElementById("read-title").value = fiche.meta.title || "";

  const vars = document.getElementById("read-variables-container");
  vars.innerHTML = "";

  fiche.variables.forEach((v) => vars.appendChild(createReadVariableRow(v)));

  updateIaButtons(fiche.trust);
  updateCompiledPrompt();
}

// Ligne variable lecture
function createReadVariableRow(v) {
  const row = document.createElement("div");
  row.dataset.varId = v.id;
  row.dataset.varType = v.type;
  row.dataset.required = v.required ? "true" : "false";

  if (v.type === "geolocation") {
    row.className = "geoloc-row";
    row.innerHTML = `
      <div class="form-group">
        <label>${v.label}${v.required ? " *" : ""}</label>
        <button class="btn secondary btn-geoloc">Acquérir</button>
      </div>
      <div class="form-group">
        <label>Latitude</label>
        <input class="var-input-lat" readonly />
      </div>
      <div class="form-group">
        <label>Longitude</label>
        <input class="var-input-lon" readonly />
      </div>
    `;

    row.querySelector(".btn-geoloc").addEventListener("click", () =>
      acquirePosition(row)
    );
  } else {
    row.className = "variables-read-row";
    row.innerHTML = `
      <div class="form-group">
        <label>${v.label}${v.required ? " *" : ""}</label>
        <input class="var-input" type="${v.type === "number" ? "number" : "text"}" />
      </div>
    `;
    row.querySelector(".var-input").addEventListener("input", updateCompiledPrompt);
  }

  return row;
}

// ------------------------------------------------------
// Géolocalisation
// ------------------------------------------------------
function acquirePosition(row) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      row.querySelector(".var-input-lat").value = pos.coords.latitude.toFixed(6);
      row.querySelector(".var-input-lon").value = pos.coords.longitude.toFixed(6);
      updateCompiledPrompt();
    },
    () => {
      document.getElementById("read-error").textContent =
        "Impossible d’obtenir la géolocalisation.";
    }
  );
}

// ------------------------------------------------------
// Boutons IA
// ------------------------------------------------------
function updateIaButtons(trust) {
  const map = {
    chatgpt: document.getElementById("btn-send-chatgpt"),
    perplexity: document.getElementById("btn-send-perplexity"),
    mistral: document.getElementById("btn-send-mistral"),
  };

  Object.keys(map).forEach((k) => {
    const btn = map[k];
    btn.classList.remove("ia-green", "ia-orange", "ia-grey", "disabled");
    const val = trust[k];

    if (val === 3) btn.classList.add("ia-green");
    else if (val === 2) btn.classList.add("ia-orange");
    else {
      btn.classList.add("ia-grey", "disabled");
      btn.disabled = true;
    }
  });
}

// ======================================================
// COMPILATION DU PROMPT
// ======================================================

function updateCompiledPrompt() {
  if (!currentFiche) return;

  let result = currentFiche.preprompt;
  const varsContainer = document.getElementById("read-variables-container");
  const extra = document.getElementById("read-extra-info").value;

  const varValues = {};
  let missing = false;

  varsContainer.querySelectorAll("[data-var-id]").forEach((row) => {
    const id = row.dataset.varId;
    const type = row.dataset.varType;
    const required = row.dataset.required === "true";

    let value = "";

    if (type === "geolocation") {
      const lat = row.querySelector(".var-input-lat").value.trim();
      const lon = row.querySelector(".var-input-lon").value.trim();
      value = lat && lon ? `lat=${lat}, lon=${lon}` : "";

      if (required && (!lat || !lon)) missing = true;
    } else {
      value = row.querySelector(".var-input").value.trim();
      if (required && !value) missing = true;
    }

    varValues[id] = value;
  });

  Object.keys(varValues).forEach((k) => {
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), varValues[k]);
  });

  result += "\n\nVariables :\n";
  Object.entries(varValues).forEach(([k, v]) => {
    result += `${k} = ${v}\n`;
  });

  result += "\nInformations complémentaires :\n" + (extra || "");

  document.getElementById("compiled-prompt").value = result;

  if (missing) {
    document.getElementById("read-error").textContent =
      "Variable(s) obligatoire(s) manquante(s).";
    disableIaButtons();
  } else {
    document.getElementById("read-error").textContent = "";
    updateIaButtons(currentFiche.trust);
  }
}

function disableIaButtons() {
  document.querySelectorAll(".ia-btn").forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("disabled", "ia-grey");
    btn.classList.remove("ia-green", "ia-orange");
  });
}

// ------------------------------------------------------
// Copier prompt
// ------------------------------------------------------
function copyCompiledPrompt() {
  const text = document.getElementById("compiled-prompt").value;
  navigator.clipboard.writeText(text).then(() => alert("Copié."));
}

// ------------------------------------------------------
// Envoi vers IA
// ------------------------------------------------------
function sendPromptToIA(ia) {
  const text = encodeURIComponent(document.getElementById("compiled-prompt").value);

  const urls = {
    chatgpt: "https://chatgpt.com/?q=",
    perplexity: "https://www.perplexity.ai/search?q=",
    mistral: "https://chat.mistral.ai/chat?query=",
  };

  window.open(urls[ia] + text, "_blank");
}

// ------------------------------------------------------
// Reset onglet lecture
// ------------------------------------------------------
function resetReadTab() {
  stopCamera();
  currentFiche = null;

  document.getElementById("read-form").style.display = "none";
  document.getElementById("read-variables-container").innerHTML = "";
  document.getElementById("read-category").value = "";
  document.getElementById("read-title").value = "";
  document.getElementById("read-extra-info").value = "";
  document.getElementById("compiled-prompt").value = "";

  disableIaButtons();
}
