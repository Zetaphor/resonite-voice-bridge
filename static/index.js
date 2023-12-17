let url = "ws://localhost:6789";
let recognition;
let websocket;

let output;
let transcript = '';
const clearBtn = document.getElementById('clearBtn');

let selectedLanguage = 'en-US';
const langSelect = document.getElementById('languageSelect');

let manuallyCleared = false;
let clearedSection = '';

let debugModeEnabled = false;
const debugModeCheckbox = document.getElementById('debugModeCheckbox');

let micEnabled = false;
const toggleMicButton = document.getElementById('toggleMicBtn');

let useConfidenceThreshold = false;
let confidenceThreshold = 0;
const confidenceThresholdWrapper = document.getElementById('confidenceThresholdWrapper');
const confidenceThresholdInputWrapper = document.getElementById('confidenceThresholdInputWrapper');
const confidenceThresholdCheckbox = document.getElementById('confidenceThresholdCheckbox');
const confidenceThresholdInput = document.getElementById('confidenceThresholdInput');

let wordReplacementEnabled = false;
const wordReplacementCheckbox = document.getElementById('wordReplacementCheckbox');
const wordReplacementContainer = document.getElementById('wordReplacementContainer');
const addWordPairBtn = document.getElementById('addWordPairBtn');

const speechTimeoutCheckbox = document.getElementById('speechTimeoutCheckbox');
const speechTimeoutInput = document.getElementById('speechTimeoutInput');
let speechTimeoutEnabled = false;
let speechTimeoutDuration = 0; // Duration in milliseconds
let waitingForCustomTimeout = false;
let speechTimer = null;

const defaultWordDictionary = {
  'f***': 'fuck',
  'f****': 'fucks',
  'b******': 'bitches',
  's***': 'shit',
  's****': 'shits',
  'cont': 'cunt',
  'b****': 'bitch',
  'a******': 'asshole',
};

let wordDictionary = {};

function init() {
  output = document.getElementById("output");
  websocket = new WebSocket(url);

  websocket.onopen = function (e) { onOpen(e); };
  websocket.onmessage = function (e) { onMessage(e); };
  websocket.onerror = function (e) { onError(e); };
  websocket.onclose = function (e) { onClose(e); };

  initializeRecognition();

  toggleMicButton.addEventListener('click', toggleMic);
  langSelect.addEventListener('change', changeLanguage);
  clearBtn.addEventListener('click', clearTranscript);
  wordReplacementCheckbox.addEventListener('change', () => {
    wordReplacementEnabled = wordReplacementCheckbox.checked;
    wordReplacementContainer.style.display = wordReplacementEnabled ? "block" : "none";
    websocket.send(wordReplacementEnabled ? '[replacementEnabled]' : '[replacementDisabled]');
    saveSettings();
  });

  debugModeCheckbox.addEventListener('change', () => {
    debugModeEnabled = debugModeCheckbox.checked;

    confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
    confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
    document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";

    if (debugModeEnabled) websocket.send('[debugEnabled]');
    else websocket.send('[debugDisabled]');
    saveSettings();
  });

  confidenceThresholdCheckbox.addEventListener('change', () => {
    useConfidenceThreshold = confidenceThresholdCheckbox.checked;
    setUseConfidenceThreshold();
    saveSettings();
  });

  confidenceThresholdInput.addEventListener('input', () => {
    const prevValue = confidenceThreshold;
    if (prevValue === parseFloat(confidenceThresholdInput.value)) return;
    confidenceThreshold = parseFloat(confidenceThresholdInput.value);
    if (!isNaN(confidenceThreshold)) websocket.send('[setConfidence=' + confidenceThreshold + ']');
    saveSettings();
  });

  speechTimeoutCheckbox.addEventListener('change', () => {
    speechTimeoutEnabled = speechTimeoutCheckbox.checked;
    document.getElementById("speechTimeoutInputWrapper").style.display = speechTimeoutCheckbox.checked ? "block" : "none";
    saveSettings();
  });

  speechTimeoutInput.addEventListener('input', () => {
    speechTimeoutDuration = parseInt(speechTimeoutInput.value, 10);
    saveSettings();
  });

  addWordPairBtn.addEventListener('click', addWordPair);
  loadSetings();
  checkMicrophoneAccess();
  renderWordPairs();
}

function loadSetings() {
  wordReplacementEnabled = localStorage.getItem('wordReplacementEnabled') === 'true';
  wordReplacementCheckbox.checked = wordReplacementEnabled;
  wordDictionary = JSON.parse(localStorage.getItem('wordDictionary') || JSON.stringify(defaultWordDictionary));
  renderWordPairs();

  debugModeEnabled = localStorage.getItem('debugModeEnabled') === 'true';
  debugModeCheckbox.checked = debugModeEnabled;

  useConfidenceThreshold = localStorage.getItem('useConfidenceThreshold') === 'true';
  confidenceThreshold = parseFloat(localStorage.getItem('confidenceThreshold'));
  confidenceThresholdCheckbox.checked = useConfidenceThreshold;
  confidenceThresholdInput.value = confidenceThreshold;

  confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
  document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";

  selectedLanguage = localStorage.getItem('selectedLanguage') || 'en-US';
  langSelect.value = selectedLanguage;

  speechTimeoutEnabled = localStorage.getItem('speechTimeoutEnabled') === 'true';
  speechTimeoutDuration = parseInt(localStorage.getItem('speechTimeoutDuration'), 10) || 0;
  speechTimeoutCheckbox.checked = speechTimeoutEnabled;
  speechTimeoutInput.value = speechTimeoutDuration;
  if (speechTimeoutDuration === 0) waitingForCustomTimeout = true;
  document.getElementById("speechTimeoutInputWrapper").style.display = speechTimeoutEnabled ? "block" : "none";
}

function saveSettings() {
  localStorage.setItem('wordReplacementEnabled', wordReplacementEnabled);
  localStorage.setItem('debugModeEnabled', debugModeEnabled);
  localStorage.setItem('useConfidenceThreshold', useConfidenceThreshold);
  localStorage.setItem('confidenceThreshold', confidenceThreshold);
  localStorage.setItem('wordDictionary', JSON.stringify(wordDictionary));
  localStorage.setItem('selectedLanguage', selectedLanguage);
  localStorage.setItem('speechTimeoutEnabled', speechTimeoutEnabled);
  localStorage.setItem('speechTimeoutDuration', speechTimeoutDuration);
}

function initializeRecognition() {
  window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = langSelect.value;
  recognition.interimResults = true;
  recognition.continuous = false; // Required to receive the end event for more accurate deduplication
  transcript = '';
  recognition.addEventListener('result', onSpeechRecognized);
  recognition.addEventListener('end', onSpeechEnded);
}

function checkMicrophoneAccess() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      stream.getTracks().forEach(track => track.stop());
      micEnabled = true;
      updateMic();
    })
    .catch(err => {
      console.error('Microphone access denied:', err);
      micEnabled = false;
      updateMic();
      document.getElementById("error").innerHTML = `<span style="color: red;">Microphone access denied. Please allow microphone access to use this feature.</span>`;
      showError();
    });
}

function changeLanguage() {
  const micWasEnabled = micEnabled;
  if (micEnabled) toggleMic();
  recognition.lang = langSelect.value;
  websocket.send("[lang=" + langSelect.value + "]");
  saveSettings();
  const timeout = setTimeout(() => {
    if (micWasEnabled) toggleMic();
    clearTimeout(timeout);
  }, 1000);
}

function toggleMic() {
  micEnabled = !micEnabled;
  updateMic();
}

function updateMic() {
  if (micEnabled) {
    recognition.lang = langSelect.value;
    recognition.start();
  }
  else recognition.stop();
  document.getElementById("micStatus").innerHTML = micEnabled ? '<span style="color: green;">Listening</span>' : '<span style="color: red;">Not Listening</span>';
  websocket.send(micEnabled ? "[enabled] " : "[disabled]");
  saveSettings();
}

function replaceWords(text) {
  return text.split(' ').map(word => wordDictionary[word] || word).join(' ');
}

function renderWordPairs() {
  const wordPairList = document.getElementById('wordPairList');
  wordPairList.innerHTML = '';
  Object.keys(wordDictionary).forEach((key) => {
    const pairDiv = document.createElement('div');
    pairDiv.innerHTML = `
      <span>${key}: ${wordDictionary[key]}</span>
      <button onclick="editWordPair('${key}')">Edit</button>
      <button onclick="deleteWordPair('${key}')">Delete</button>
    `;
    wordPairList.appendChild(pairDiv);
  });
  wordReplacementContainer.style.display = wordReplacementEnabled ? "block" : "none";
}

function addWordPair() {
  const originalWord = document.getElementById('originalWord').value;
  const replacementWord = document.getElementById('replacementWord').value;
  if (originalWord && replacementWord) {
    wordDictionary[originalWord] = replacementWord;
    renderWordPairs();
  }
  saveSettings();
}

function deleteWordPair(key) {
  delete wordDictionary[key];
  renderWordPairs();
  saveSettings();
}

function editWordPair(key) {
  // Prompt because I am lazy
  const newReplacement = prompt(`Enter replacement for '${key}':`, wordDictionary[key]);
  if (newReplacement !== null) {
    wordDictionary[key] = newReplacement;
    renderWordPairs();
  }
  saveSettings();
}

function setWordReplacement() {
  document.getElementById("wordReplacementContainer").style.display = wordReplacementEnabled ? "block" : "none";
  saveSettings();
}

function onSpeechRecognized(e) {
  const recognized = e.results[0][0];
  const recognizedConfidence = e.results[0][0].confidence.toFixed(2);
  document.getElementById("confidenceScore").textContent = recognizedConfidence;

  if (useConfidenceThreshold && recognized.confidence < confidenceThreshold) return;

  let processedTranscript = recognized.transcript;
  if (wordReplacementEnabled) processedTranscript = replaceWords(processedTranscript);

  // console.log('Current:', transcript);
  // console.log('Processed:', processedTranscript);

  if (waitingForCustomTimeout) {
    // transcript += processedTranscript;
    console.log('Processed:', processedTranscript);
    console.log('transcript:', transcript);
    // Remove the processed part from the existing transcript
    transcript += ' ' + processedTranscript.replace(transcript, '');
  } else {
    console.log('Not waiting')
    transcript = processedTranscript;
  }

  // if (processedTranscript !== transcript && processedTranscript.length > transcript.length) {
  //   if (manuallyCleared) {
  //     transcript = processedTranscript.replace(clearedSection, '');
  //   } else transcript = processedTranscript;

  //   document.getElementById("sttOutput").innerHTML = transcript;
  //   websocket.send(transcript);

  //   if (debugModeEnabled) {
  //     websocket.send('[debugConfidence=' + recognizedConfidence + ']');
  //   }
  // }
}

function onSpeechEnded() {
  if (micEnabled) recognition.start();
  if (speechTimeoutEnabled) {
    clearTimeout(speechTimer);
    waitingForCustomTimeout = true;
    if (speechTimeoutDuration > 0) {
      speechTimer = setTimeout(() => {
        transcript = '';
        clearedSection = '';
        manuallyCleared = false;
        clearTimeout(speechTimer);
        waitingForCustomTimeout = false;
      }, speechTimeoutDuration);
    }
  } else {
    transcript = '';
    clearedSection = '';
    manuallyCleared = false;
  }
}

function clearTranscript() {
  clearedSection = transcript;
  transcript = '';
  manuallyCleared = true;
  document.getElementById("sttOutput").innerHTML = '';
  websocket.send("[cleared]");
}

function onOpen(event) {
  document.getElementById("websocketStatus").innerHTML = '<span style="color: green;">Connected to backend</span>';
}

function onMessage(event) {
  if (event.data === "toggle") toggleMic();
  else if (event.data === "enable") {
    micEnabled = true;
    updateMic();
  } else if (event.data === "disable") {
    micEnabled = false;
    updateMic();
  } else if (event.data.startsWith('lang=')) {
    const langCode = event.data.substring(5, event.data.length);
    selectedLanguage = langCode;
    langSelect.value = selectedLanguage;
    changeLanguage();
  } else if (event.data === 'clear') clearTranscript();
  else if (event.data === 'debugEnable') {
    if (debugModeEnabled) return;
    debugModeEnabled = true;
    setDebugMode();
  } else if (event.data === 'debugDisable') {
    if (!debugModeEnabled) return;
    debugModeEnabled = false;
    setDebugMode();
  } else if (event.data === 'debugToggle') {
    debugModeEnabled = !debugModeEnabled;
    setDebugMode();
  } else if (event.data === 'confidenceToggle') {
    useConfidenceThreshold = !useConfidenceThreshold;
    setUseConfidenceThreshold();
  } else if (event.data === 'confidenceEnable') {
    useConfidenceThreshold = true;
    setUseConfidenceThreshold();
  } else if (event.data === 'confidenceDisable') {
    useConfidenceThreshold = false;
    setUseConfidenceThreshold();
  } else if (event.data.startsWith('confidence=')) {
    confidenceThreshold = parseFloat(event.data.substring(11, event.data.length));
    confidenceThresholdInput.value = confidenceThreshold;
    websocket.send('[changedConfidence=' + confidenceThreshold + ']');
  } else if (event.data === 'replacementEnable') {
    wordReplacementEnabled = true;
    setWordReplacement();
  } else if (event.data === 'replacementDisable') {
    wordReplacementEnabled = false;
    setWordReplacement();
  } else if (event.data === 'replacementToggle') {
    wordReplacementEnabled = !wordReplacementEnabled;
    setWordReplacement();
  }
}

function setUseConfidenceThreshold() {
  confidenceThresholdCheckbox.checked = useConfidenceThreshold;
  confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
  document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  if (useConfidenceThreshold) websocket.send('[enableConfidenceThreshold]');
  else websocket.send('[disableConfidenceThreshold]');
  saveSettings();
}

function setDebugMode() {
  debugModeCheckbox.checked = debugModeEnabled;

  confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
  document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";

  if (debugModeEnabled) websocket.send('[debugEnabled]');
  else websocket.send('[debugDisabled]');
  saveSettings();
}

function onError(event) {
  document.getElementById("websocketStatus").innerHTML = '<span style="color: red;">ERROR: ' + event.data + '</span>';
}

function onClose(event) {
  document.getElementById("websocketStatus").innerHTML = '<span style="color: red;">Disconnected from backend</span>';
}

window.addEventListener("load", init, false);
