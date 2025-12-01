// ======================================================
// Mémento opérationnel IA – RCH
// app.js — Version dynamique (version = date du jour)
// ------------------------------------------------------
// - Application 100 % côté client, online uniquement
// - Onglet Création de fiche : JSON + QR code compressé
// - Onglet Lecture de fiche : scan caméra / fichier (QrScanner)
// - Compression : DEFLATE (pako) + Base64 dans un wrapper
//   { z: "pako-base64-v1", d: "<base64>" }
// - Gestion des variables (texte / nombre / géolocalisation)
// - Compilation d’un prompt final + envoi vers 3 IA
// ======================================================

let qrScanner = null;             // Instance QrScanner
let currentFiche = null;          // Objet JSON de la fiche décodée
let isCameraRunning = false;      // État caméra
let variableCounter = 0;          // Compteur pour les variables (création)

// =============================
// Initialisation globale
// =============================

document.addEventListener('DOMContentLoaded', () => {
  initVersion();
  initTabs();
  initCreateTab();
  initReadTab();
});

// =============================
// Version automatique
// =============================

function initVersion() {
  const el = document.getElementById('app-version');
  if (!el) return;
  try {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '.');
    el.textContent = 'Version auto : V' + dateStr;
  } catch (e) {
    el.textContent = 'Version';
  }
}

// =============================
// Gestion des onglets
// =============================

function initTabs() {
  const btnRead = document.getElementById('tab-btn-read');
  const btnCreate = document.getElementById('tab-btn-create');
  const tabRead = document.getElementById('tab-read');
  const tabCreate = document.getElementById('tab-create');

  if (!btnRead || !btnCreate || !tabRead || !tabCreate) return;

  btnRead.addEventListener('click', () => {
    btnRead.classList.add('active');
    btnCreate.classList.remove('active');
    tabRead.classList.add('active');
    tabCreate.classList.remove('active');
  });

  btnCreate.addEventListener('click', () => {
    btnCreate.classList.add('active');
    btnRead.classList.remove('active');
    tabCreate.classList.add('active');
    tabRead.classList.remove('active');
  });
}

// =============================
// Onglet CREATION
// =============================

function initCreateTab() {
  const preprompt = document.getElementById('preprompt');
  const prepromptCount = document.getElementById('preprompt-count');
  const btnAddVar = document.getElementById('btn-add-variable');
  const btnGenerateQR = document.getElementById('btn-generate-qr');
  const btnDownloadQR = document.getElementById('btn-download-qr');
  const btnResetCreate = document.getElementById('btn-reset-create');

  if (!preprompt || !prepromptCount) return;

  // Compteur de caractères
  preprompt.addEventListener('input', () => {
    prepromptCount.textContent = preprompt.value.length.toString();
  });

  // Ajout première ligne de variable (optionnel)
  addVariableRow();

  if (btnAddVar) {
    btnAddVar.addEventListener('click', () => {
      addVariableRow();
    });
  }

  if (btnGenerateQR) {
    btnGenerateQR.addEventListener('click', () => {
      generateFicheAndQR();
    });
  }

  if (btnDownloadQR) {
    btnDownloadQR.addEventListener('click', () => {
      downloadGeneratedQR();
    });
  }

  if (btnResetCreate) {
    btnResetCreate.addEventListener('click', () => {
      resetCreateTab();
    });
  }
}

// -----------------------------
// Ajout d’une ligne de variable
// -----------------------------

function addVariableRow() {
  const container = document.getElementById('variables-container');
  const btnAddVar = document.getElementById('btn-add-variable');
  const maxVars = 10;

  if (!container) return;
  if (variableCounter >= maxVars) {
    if (btnAddVar) btnAddVar.disabled = true;
    return;
  }

  variableCounter++;

  const row = document.createElement('div');
  row.className = 'variable-row';
  row.dataset.index = String(variableCounter);

  row.innerHTML = `
    <div class="form-group">
      <input type="text" class="var-label" placeholder="Label (ex : Code ONU)" />
    </div>
    <div class="form-group">
      <input type="text" class="var-id" placeholder="Identifiant (ex : code_onu)" />
    </div>
    <div class="form-group">
      <select class="var-type">
        <option value="text">Texte</option>
        <option value="number">Nombre</option>
        <option value="geolocation">Géolocalisation</option>
      </select>
    </div>
    <div class="var-required">
      <input type="checkbox" class="var-required-check" id="var-required-${variableCounter}" />
      <label for="var-required-${variableCounter}">Obligatoire</label>
    </div>
    <button type="button" class="btn ghost small var-remove-btn">Supprimer</button>
  `;

  const removeBtn = row.querySelector('.var-remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      row.remove();
      variableCounter--;
      if (btnAddVar) btnAddVar.disabled = false;
    });
  }

  container.appendChild(row);
}

// -----------------------------
// Génération du JSON + QR
// -----------------------------

function generateFicheAndQR() {
  const errorEl = document.getElementById('create-error');
  if (errorEl) errorEl.textContent = '';

  try {
    const fiche = buildFicheFromCreateForm();
    const payload = buildWrapperAndCompress(fiche);
    renderQRCode(payload);
    const qrSection = document.getElementById('qr-section');
    if (qrSection) qrSection.style.display = 'block';
  } catch (err) {
    console.error(err);
    if (errorEl) {
      errorEl.textContent = err && err.message
        ? err.message
        : "Erreur inattendue lors de la génération de la fiche.";
    }
  }
}

// Construit l’objet fiche à partir du formulaire
function buildFicheFromCreateForm() {
  const category = getInputValue('meta-category');
  const title = getInputValue('meta-title');
  const objective = getInputValue('meta-objective');
  const author = getInputValue('meta-author');
  const date = getInputValue('meta-date');
  const version = getInputValue('meta-version');
  const preprompt = getInputValue('preprompt');
  const trustChatgpt = getSelectValue('trust-chatgpt');
  const trustPerplexity = getSelectValue('trust-perplexity');
  const trustMistral = getSelectValue('trust-mistral');

  if (!category || !title || !preprompt) {
    throw new Error("Catégorie, Titre et Pré-prompt sont obligatoires pour générer la fiche.");
  }

  if (preprompt.length > 10000) {
    throw new Error("Le pré-prompt dépasse la limite de 10 000 caractères.");
  }

  const variables = [];
  const varRows = document.querySelectorAll('.variable-row');
  varRows.forEach(row => {
    const label = row.querySelector('.var-label')?.value.trim();
    const id = row.querySelector('.var-id')?.value.trim();
    const type = row.querySelector('.var-type')?.value || 'text';
    const required = !!row.querySelector('.var-required-check')?.checked;

    if (label || id) {
      if (!label || !id) {
        throw new Error("Chaque variable utilisée doit avoir un label ET un identifiant.");
      }
      variables.push({
        label: label,
        id: id,
        type: type,
        required: required
      });
    }
  });

  const fiche = {
    meta: {
      category,
      title,
      objective,
      author,
      date,
      version
    },
    trust: {
      chatgpt: Number(trustChatgpt || 3),
      perplexity: Number(trustPerplexity || 3),
      mistral: Number(trustMistral || 3)
    },
    variables: variables,
    preprompt: preprompt
  };

  return fiche;
}

// Compression + wrapper
function buildWrapperAndCompress(fiche) {
  if (!window.pako) {
    throw new Error("La bibliothèque de compression (pako) n'est pas chargée.");
  }
  const jsonStr = JSON.stringify(fiche);
  const compressedBinary = pako.deflate(jsonStr, { to: 'string' });
  const base64 = btoa(compressedBinary);

  const wrapper = {
    z: "pako-base64-v1",
    d: base64
  };
  return JSON.stringify(wrapper);
}

// Affiche le QR dans la zone prévue
function renderQRCode(text) {
  const qrContainer = document.getElementById('qr-output');
  if (!qrContainer) return;

  qrContainer.innerHTML = ''; // reset

  if (!window.QRCode) {
    throw new Error("La bibliothèque de génération de QR (QRCode) n'est pas chargée.");
  }

  // QRCode.js ajuste automatiquement la version en fonction du contenu
  new QRCode(qrContainer, {
    text: text,
    width: 260,
    height: 260,
    correctLevel: QRCode.CorrectLevel.H // niveau d’erreur élevé pour robustesse impression
  });
}

// Téléchargement du QR généré en PNG
function downloadGeneratedQR() {
  const qrContainer = document.getElementById('qr-output');
  if (!qrContainer) return;

  let dataUrl = null;
  const canvas = qrContainer.querySelector('canvas');
  const img = qrContainer.querySelector('img');

  if (canvas && canvas.toDataURL) {
    dataUrl = canvas.toDataURL('image/png');
  } else if (img && img.src.startsWith('data:image')) {
    dataUrl = img.src;
  }

  if (!dataUrl) {
    alert("Impossible de récupérer l'image du QR code pour le téléchargement.");
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'fiche-ia-rch-qr.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Réinitialisation onglet création
function resetCreateTab() {
  const fields = [
    'meta-category', 'meta-title', 'meta-objective',
    'meta-author', 'meta-date', 'meta-version', 'preprompt'
  ];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const prepromptCount = document.getElementById('preprompt-count');
  if (prepromptCount) prepromptCount.textContent = '0';

  const varsContainer = document.getElementById('variables-container');
  if (varsContainer) {
    varsContainer.innerHTML = '';
  }
  variableCounter = 0;
  addVariableRow();

  const qrSection = document.getElementById('qr-section');
  if (qrSection) qrSection.style.display = 'none';

  const qrOutput = document.getElementById('qr-output');
  if (qrOutput) qrOutput.innerHTML = '';

  const errorEl = document.getElementById('create-error');
  if (errorEl) errorEl.textContent = '';
}

// Utilitaires pour inputs
function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function getSelectValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

// =============================
// Onglet LECTURE
// =============================

function initReadTab() {
  const btnStartCamera = document.getElementById('btn-start-camera');
  const fileInput = document.getElementById('file-input');
  const btnResetRead = document.getElementById('btn-reset-read');
  const extraInfo = document.getElementById('read-extra-info');
  const btnCopyPrompt = document.getElementById('btn-copy-prompt');

  if (btnStartCamera) {
    btnStartCamera.addEventListener('click', () => {
      toggleCamera();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', event => {
      if (!event.target.files || !event.target.files[0]) return;
      const file = event.target.files[0];
      decodeFromFile(file);
    });
  }

  if (btnResetRead) {
    btnResetRead.addEventListener('click', () => {
      resetReadTab();
    });
  }

  if (extraInfo) {
    extraInfo.addEventListener('input', () => {
      updateCompiledPrompt();
    });
  }

  if (btnCopyPrompt) {
    btnCopyPrompt.addEventListener('click', () => {
      copyCompiledPrompt();
    });
  }

  // Boutons IA
  const iaButtons = document.querySelectorAll('.ai-buttons-row .ia-btn');
  iaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const ia = btn.dataset.ia;
      sendPromptToIA(ia);
    });
  });
}

// -----------------------------
// Gestion caméra (QrScanner)
// -----------------------------

function toggleCamera() {
  if (isCameraRunning) {
    stopCamera();
  } else {
    startCamera();
  }
}

function startCamera() {
  const video = document.getElementById('qr-video');
  const videoWrapper = document.getElementById('video-wrapper');
  const errorEl = document.getElementById('read-error');

  if (errorEl) errorEl.textContent = '';

  if (!window.QrScanner) {
    if (errorEl) {
      errorEl.textContent = "La bibliothèque de lecture QR (QrScanner) n'est pas chargée.";
    }
    return;
  }

  if (!video) return;

  if (!qrScanner) {
    qrScanner = new QrScanner(
      video,
      result => {
        handleQrResult(result);
      },
      {
        /* Préférence pour la caméra arrière sur mobile */
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true
      }
    );
  }

  qrScanner.start()
    .then(() => {
      isCameraRunning = true;
      if (videoWrapper) videoWrapper.classList.add('active');
      const btn = document.getElementById('btn-start-camera');
      if (btn) btn.textContent = 'Arrêter la caméra';
    })
    .catch(err => {
      console.error(err);
      isCameraRunning = false;
      if (videoWrapper) videoWrapper.classList.remove('active');
      const btn = document.getElementById('btn-start-camera');
      if (btn) btn.textContent = 'Activer la caméra';
      if (errorEl) {
        errorEl.textContent = "Impossible d'accéder à la caméra. Vérifiez les autorisations du navigateur.";
      }
    });
}

function stopCamera() {
  const videoWrapper = document.getElementById('video-wrapper');

  if (qrScanner) {
    qrScanner.stop();
  }
  isCameraRunning = false;
  if (videoWrapper) videoWrapper.classList.remove('active');
  const btn = document.getElementById('btn-start-camera');
  if (btn) btn.textContent = 'Activer la caméra';
}

// -----------------------------
// Lecture depuis un fichier
// -----------------------------

function decodeFromFile(file) {
  const errorEl = document.getElementById('read-error');
  if (errorEl) errorEl.textContent = '';

  if (!window.QrScanner) {
    if (errorEl) {
      errorEl.textContent = "La bibliothèque QrScanner n'est pas disponible pour l'analyse d'image.";
    }
    return;
  }

  QrScanner.scanImage(file, { returnDetailedScanResult: true })
    .then(result => {
      handleQrResult(result.data || result);
    })
    .catch(err => {
      console.error(err);
      if (errorEl) {
        errorEl.textContent = "Impossible de lire le QR depuis le fichier : " + (err.message || 'erreur inconnue.');
      }
    });
}

// -----------------------------
// Traitement du résultat QR
// -----------------------------

function handleQrResult(text) {
  stopCamera();

  const errorEl = document.getElementById('read-error');
  if (errorEl) errorEl.textContent = '';

  try {
    const fiche = decodeWrapperOrJson(text);
    currentFiche = fiche;
    renderReadFormFromFiche(fiche);
  } catch (err) {
    console.error(err);
    if (errorEl) {
      errorEl.textContent = "QR code lu mais impossible de décoder les données : " +
        (err && err.message ? err.message : 'format non reconnu.');
    }
  }
}

// Décodage : wrapper + compression ou JSON direct
function decodeWrapperOrJson(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error("Le contenu décodé n'est pas un JSON valide.");
  }

  // Wrapper { z: "pako-base64-v1", d: "<base64>" }
  if (obj && obj.z === 'pako-base64-v1' && typeof obj.d === 'string') {
    if (!window.pako) {
      throw new Error("Le QR utilise une compression, mais la bibliothèque pako n'est pas disponible.");
    }
    const binaryStr = atob(obj.d);
    const jsonStr = pako.inflate(binaryStr, { to: 'string' });
    return JSON.parse(jsonStr);
  }

  // JSON direct (fallback)
  return obj;
}

// -----------------------------
// Construction du formulaire de lecture à partir de la fiche
// -----------------------------

function renderReadFormFromFiche(fiche) {
  const readForm = document.getElementById('read-form');
  const catInput = document.getElementById('read-category');
  const titleInput = document.getElementById('read-title');
  const varsContainer = document.getElementById('read-variables-container');
  const extraInfo = document.getElementById('read-extra-info');
  const compiledPrompt = document.getElementById('compiled-prompt');

  if (!readForm || !catInput || !titleInput || !varsContainer || !extraInfo || !compiledPrompt) return;

  readForm.style.display = 'block';

  const meta = fiche.meta || {};
  catInput.value = meta.category || '';
  titleInput.value = meta.title || '';

  // Vide les anciens champs
  varsContainer.innerHTML = '';

  const vars = fiche.variables || [];
  vars.forEach(variable => {
    const row = createReadVariableRow(variable);
    varsContainer.appendChild(row);
  });

  // Indices de confiance -> boutons IA
  setupIaButtonsFromTrust(fiche.trust);

  // Reset info + prompt
  extraInfo.value = '';
  compiledPrompt.value = '';

  // Première génération du prompt
  updateCompiledPrompt();
}

// Création d’une ligne pour une variable à saisir (onglet lecture)
function createReadVariableRow(variable) {
  const container = document.createElement('div');
  container.className = 'variables-read-row';

  const label = variable.label || variable.id || 'Variable';
  const id = variable.id || '';
  const type = variable.type || 'text';
  const required = !!variable.required;

  // On stocke les informations nécessaires sur la ligne
  container.dataset.varId = id;
  container.dataset.varType = type;
  container.dataset.required = required ? 'true' : 'false';

  if (type === 'geolocation') {
    container.classList.add('geoloc-row');
    container.innerHTML = `
      <div class="form-group">
        <label>${label}${required ? ' *' : ''}</label>
        <button type="button" class="btn secondary btn-geoloc">Acquérir la position</button>
      </div>
      <div class="form-group">
        <label>Latitude</label>
        <input type="text" class="var-input-lat" readonly />
      </div>
      <div class="form-group">
        <label>Longitude</label>
        <input type="text" class="var-input-lon" readonly />
      </div>
    `;

    const btnGeoloc = container.querySelector('.btn-geoloc');
    if (btnGeoloc) {
      btnGeoloc.addEventListener('click', () => {
        acquirePositionForRow(container);
      });
    }

    const latInput = container.querySelector('.var-input-lat');
    const lonInput = container.querySelector('.var-input-lon');
    if (latInput) latInput.addEventListener('input', updateCompiledPrompt);
    if (lonInput) lonInput.addEventListener('input', updateCompiledPrompt);

  } else {
    container.innerHTML = `
      <div class="form-group">
        <label>${label}${required ? ' *' : ''}</label>
        <input type="${type === 'number' ? 'number' : 'text'}"
               class="var-input"
               data-var-id="${id}" />
      </div>
    `;
    const input = container.querySelector('.var-input');
    if (input) {
      input.addEventListener('input', () => {
        updateCompiledPrompt();
      });
    }
  }

  return container;
}

// Acquisition géolocalisation
function acquirePositionForRow(row) {
  const latInput = row.querySelector('.var-input-lat');
  const lonInput = row.querySelector('.var-input-lon');
  const errorEl = document.getElementById('read-error');

  if (errorEl) errorEl.textContent = '';

  if (!navigator.geolocation) {
    if (errorEl) errorEl.textContent = "La géolocalisation n'est pas supportée par ce navigateur.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude } = position.coords;
      if (latInput) latInput.value = latitude.toFixed(6);
      if (lonInput) lonInput.value = longitude.toFixed(6);
      updateCompiledPrompt();
    },
    err => {
      console.error(err);
      if (errorEl) {
        errorEl.textContent = "Impossible d'acquérir la position : " + (err.message || 'erreur inconnue.');
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    }
  );
}

// Configuration des boutons IA selon les indices de confiance
function setupIaButtonsFromTrust(trust) {
  const defaultTrust = { chatgpt: 3, perplexity: 3, mistral: 3 };
  const t = trust || defaultTrust;

  const map = {
    chatgpt: document.getElementById('btn-send-chatgpt'),
    perplexity: document.getElementById('btn-send-perplexity'),
    mistral: document.getElementById('btn-send-mistral')
  };

  Object.keys(map).forEach(key => {
    const btn = map[key];
    if (!btn) return;

    const value = Number(t[key] || 3);
    btn.classList.remove('ia-green', 'ia-orange', 'ia-grey', 'disabled');
    btn.disabled = false;

    if (value === 3) {
      btn.classList.add('ia-green');
    } else if (value === 2) {
      btn.classList.add('ia-orange');
    } else {
      btn.classList.add('ia-grey', 'disabled');
      btn.disabled = true;
    }
  });
}

// -----------------------------
// Compilation du prompt
// -----------------------------

function updateCompiledPrompt() {
  const compiledPrompt = document.getElementById('compiled-prompt');
  const extraInfo = document.getElementById('read-extra-info');
  const varsContainer = document.getElementById('read-variables-container');

  if (!compiledPrompt || !extraInfo || !varsContainer) return;
  if (!currentFiche) {
    compiledPrompt.value = '';
    return;
  }

  const preprompt = currentFiche.preprompt || '';
  let result = preprompt;

  // Récupération des valeurs de variables
  const varValues = {};
  const rows = varsContainer.querySelectorAll('.variables-read-row');

  let missingRequired = false;
  let firstMissing = null;

  rows.forEach(row => {
    const id = row.dataset.varId || '';
    const type = row.dataset.varType || 'text';
    const required = row.dataset.required === 'true';

    let value = '';

    if (type === 'geolocation') {
      const latInput = row.querySelector('.var-input-lat');
      const lonInput = row.querySelector('.var-input-lon');
      const lat = latInput ? latInput.value.trim() : '';
      const lon = lonInput ? lonInput.value.trim() : '';
      if (lat || lon) {
        value = `lat=${lat}, lon=${lon}`;
      }
      if (required && (!lat || !lon)) {
        missingRequired = true;
        if (!firstMissing) firstMissing = id || 'géolocalisation';
      }
    } else {
      const input = row.querySelector('.var-input');
      value = input ? input.value.trim() : '';
      if (required && !value) {
        missingRequired = true;
        if (!firstMissing) firstMissing = id || 'variable';
      }
    }

    if (id) {
      varValues[id] = value;
    }
  });

  // Remplacement simple {{id}} -> valeur
  Object.keys(varValues).forEach(key => {
    const pattern = new RegExp('\\{\\{' + escapeRegExp(key) + '\\}\\}', 'g');
    result = result.replace(pattern, varValues[key] || '');
  });

  // Ajout bloc récapitulatif
  result += '\n\nVariables :\n';
  Object.keys(varValues).forEach(key => {
    result += key + ' = ' + (varValues[key] || '') + '\n';
  });

  result += '\nInformations complémentaires :\n';
  result += (extraInfo.value || '');

  compiledPrompt.value = result;

  // Gestion des champs obligatoires -> boutons IA désactivés
  const errorEl = document.getElementById('read-error');
  const iaButtons = document.querySelectorAll('.ai-buttons-row .ia-btn');

  if (missingRequired) {
    if (errorEl) {
      errorEl.textContent = "Certaines variables obligatoires ne sont pas renseignées, envoi du prompt impossible.";
    }
    iaButtons.forEach(btn => {
      if (!btn.classList.contains('ia-grey')) {
        btn.disabled = true;
        btn.classList.add('disabled');
      }
    });
  } else {
    // Réactive selon les indices de confiance
    if (errorEl && errorEl.textContent.startsWith('Certaines variables')) {
      errorEl.textContent = '';
    }
    setupIaButtonsFromTrust(currentFiche.trust);
  }
}

// Échappement regex pour les identifiants de variables
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -----------------------------
// Copier le prompt
// -----------------------------

function copyCompiledPrompt() {
  const compiledPrompt = document.getElementById('compiled-prompt');
  if (!compiledPrompt) return;

  const text = compiledPrompt.value || '';
  if (!text) {
    alert("Aucun prompt compilé à copier.");
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert("Prompt copié dans le presse-papiers.");
      })
      .catch(err => {
        console.error(err);
        fallbackCopyText(text);
      });
  } else {
    fallbackCopyText(text);
  }
}

// Fallback copie
function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    alert("Prompt copié dans le presse-papiers.");
  } catch (e) {
    alert("Impossible de copier automatiquement le prompt.");
  }
  document.body.removeChild(textarea);
}

// -----------------------------
// Envoi vers les IA (ouverture URL)
// -----------------------------

function sendPromptToIA(iaKey) {
  const compiledPrompt = document.getElementById('compiled-prompt');
  if (!compiledPrompt) return;

  const text = compiledPrompt.value || '';
  if (!text) {
    alert("Le prompt compilé est vide, rien à envoyer.");
    return;
  }

  const encoded = encodeURIComponent(text);
  let url = '';

  switch (iaKey) {
    case 'chatgpt':
      url = 'https://chatgpt.com/?q=' + encoded;
      break;
    case 'perplexity':
      url = 'https://www.perplexity.ai/search?q=' + encoded;
      break;
    case 'mistral':
      url = 'https://chat.mistral.ai/chat?query=' + encoded;
      break;
    default:
      alert("IA non reconnue.");
      return;
  }

  window.open(url, '_blank', 'noopener');
}

// -----------------------------
// Réinitialisation onglet lecture
// -----------------------------

function resetReadTab() {
  stopCamera();

  currentFiche = null;

  const catInput = document.getElementById('read-category');
  const titleInput = document.getElementById('read-title');
  const varsContainer = document.getElementById('read-variables-container');
  const extraInfo = document.getElementById('read-extra-info');
  const compiledPrompt = document.getElementById('compiled-prompt');
  const readForm = document.getElementById('read-form');
  const errorEl = document.getElementById('read-error');

  if (catInput) catInput.value = '';
  if (titleInput) titleInput.value = '';
  if (varsContainer) varsContainer.innerHTML = '';
  if (extraInfo) extraInfo.value = '';
  if (compiledPrompt) compiledPrompt.value = '';
  if (readForm) readForm.style.display = 'none';
  if (errorEl) errorEl.textContent = '';

  const iaButtons = document.querySelectorAll('.ai-buttons-row .ia-btn');
  iaButtons.forEach(btn => {
    btn.disabled = true;
    btn.classList.add('disabled', 'ia-grey');
    btn.classList.remove('ia-green', 'ia-orange');
  });
}
