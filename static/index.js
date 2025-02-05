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

let customCommmandsEnabled = false;
const customCommandsCheckbox = document.getElementById('customCommandsCheckbox');

const commandLog = document.getElementById('commandLog');

let useConfidenceThreshold = false;
let confidenceThreshold = 0;
const confidenceThresholdWrapper = document.getElementById('confidenceThresholdWrapper');
const confidenceThresholdInputWrapper = document.getElementById('confidenceThresholdInputWrapper');
const confidenceThresholdCheckbox = document.getElementById('confidenceThresholdCheckbox');
const confidenceThresholdInput = document.getElementById('confidenceThresholdInput');

let wordReplacementEnabled = false;
const wordReplacementCheckbox = document.getElementById('wordReplacementCheckbox');
const addWordPairBtn = document.getElementById('addWordPairBtn');

let removePunctuation = false;
const removePunctuationCheckbox = document.getElementById('removePunctuationCheckbox');

let outputStreaming = true;
const outputStreamingCheckbox = document.getElementById('outputStreamingCheckbox');

let sendEvents = true;
const sendEventsCheckbox = document.getElementById('sendEventsCheckbox');

let wordDictionary = {};

function sendEvent(event) {
  if (sendEvents) {
    websocket.send(event);
  }
}

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
    sendEvent(wordReplacementEnabled ? '[replacementEnabled]' : '[replacementDisabled]');
    saveSettings();
  });

  debugModeCheckbox.addEventListener('change', () => {
    debugModeEnabled = debugModeCheckbox.checked;

    confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
    confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
    document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";

    if (debugModeEnabled) sendEvent('[debugEnabled]');
    else sendEvent('[debugDisabled]');
    saveSettings();
  });

  customCommandsCheckbox.addEventListener('change', () => {
    customCommmandsEnabled = customCommandsCheckbox.checked;
    if (customCommmandsEnabled) sendEvent('[customCommandsEnabled]');
    else sendEvent('[customCommandsDisabled]');
    saveSettings();
  })

  removePunctuationCheckbox.addEventListener('change', () => {
    removePunctuation = removePunctuationCheckbox.checked;
    if (removePunctuation) sendEvent('[removePunctuationEnabled]');
    else sendEvent('[removePunctuationDisabled]');
    saveSettings();
  });

  outputStreamingCheckbox.addEventListener('change', () => {
    outputStreaming = outputStreamingCheckbox.checked;
    if (outputStreaming) sendEvent('[outputStreamingEnabled]');
    else sendEvent('[outputStreamingDisabled]');
    saveSettings();
  });

  confidenceThresholdCheckbox.addEventListener('change', () => {
    useConfidenceThreshold = confidenceThresholdCheckbox.checked;
    setUseConfidenceThreshold();
    saveSettings();
  });
  
  sendEventsCheckbox.addEventListener('change', () => {
    sendEvents = sendEventsCheckbox.checked;
    saveSettings();
  });

  confidenceThresholdInput.addEventListener('input', () => {
    const prevValue = confidenceThreshold;
    if (prevValue === parseFloat(confidenceThresholdInput.value)) return;
    confidenceThreshold = parseFloat(confidenceThresholdInput.value);
    if (!isNaN(confidenceThreshold)) sendEvent('[setConfidence=' + confidenceThreshold + ']');
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
  wordDictionary = localStorage.getItem('wordDictionary') || '{}';
  wordDictionary = JSON.parse(wordDictionary);
  renderWordPairs();

  debugModeEnabled = localStorage.getItem('debugModeEnabled') === 'true';
  debugModeCheckbox.checked = debugModeEnabled;

  customCommmandsEnabled = localStorage.getItem('customCommandsEnabled') === 'true';
  customCommandsCheckbox.checked = customCommmandsEnabled;

  useConfidenceThreshold = localStorage.getItem('useConfidenceThreshold') === 'true';
  confidenceThreshold = parseFloat(localStorage.getItem('confidenceThreshold'));
  confidenceThresholdCheckbox.checked = useConfidenceThreshold;
  confidenceThresholdInput.value = confidenceThreshold;

  confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
  document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";

  selectedLanguage = localStorage.getItem('selectedLanguage') || 'en-US';
  langSelect.value = selectedLanguage;

  removePunctuation = localStorage.getItem('removePunctuation') === 'true';
  removePunctuationCheckbox.checked = removePunctuation;

  outputStreaming = localStorage.getItem('outputStreaming') === 'true';
  outputStreamingCheckbox.checked = outputStreaming;
  
  sendEvents = localStorage.getItem('sendEvents') !== 'false';
  sendEventsCheckbox.checked = sendEvents;
}

function saveSettings() {
  localStorage.setItem('wordReplacementEnabled', wordReplacementEnabled);
  localStorage.setItem('debugModeEnabled', debugModeEnabled);
  localStorage.setItem('customCommandsEnabled', customCommmandsEnabled);
  localStorage.setItem('useConfidenceThreshold', useConfidenceThreshold);
  localStorage.setItem('confidenceThreshold', confidenceThreshold);
  localStorage.setItem('wordDictionary', JSON.stringify(wordDictionary));
  localStorage.setItem('selectedLanguage', selectedLanguage);
  localStorage.setItem('removePunctuation', removePunctuation);
  localStorage.setItem('outputStreaming', outputStreaming);
  localStorage.setItem('sendEvents', sendEvents);
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
  sendEvent("[lang=" + langSelect.value + "]");
  selectedLanguage = langSelect.value;
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
  sendEvent(micEnabled ? "[enabled] " : "[disabled]");
  saveSettings();
}

function replaceWords(text) {
  return text.split(' ').map(word => wordDictionary[word] || word).join(' ');
}

function stripPunctuation(text) {
  return text.replace(/[^a-zA-Z0-9 ]/g, '');
}

function stripPunctuationWebsocket(text) {
  const regex = /[^\w\s]/g;
  return text.replace(regex, '');
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

function onSpeechRecognized(e) {
  const recognized = e.results[0][0];
  document.getElementById("confidenceScore").textContent = recognized.confidence.toFixed(2);
  if (useConfidenceThreshold && recognized.confidence < confidenceThreshold) return;

  let processedTranscript = recognized.transcript;
  if (removePunctuation) {
    processedTranscript = stripPunctuation(processedTranscript);
  }

  if (wordReplacementEnabled) {
    processedTranscript = replaceWords(processedTranscript);
  }

  if (processedTranscript !== transcript && processedTranscript.length > transcript.length) {
    if (manuallyCleared) {
      transcript = processedTranscript.replace(clearedSection, '');
    } else transcript = processedTranscript;

    document.getElementById("sttOutput").innerHTML = transcript;
    if (outputStreaming) websocket.send(transcript);

    if (customCommmandsEnabled) testTranscriptCommands();

    if (debugModeEnabled) sendEvent('[debugConfidence=' + recognized.confidence.toFixed(2) + ']');
  }
}

function onSpeechEnded() {
  if (micEnabled) recognition.start();
  if (transcript.length) {
    if (!outputStreaming) websocket.send(transcript);
    sendEvent('[speechEnded]');
  }
  transcript = '';
  clearedSection = '';
  manuallyCleared = false;
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
    sendEvent('[changedConfidence=' + confidenceThreshold + ']');
  } else if (event.data === 'replacementEnable') {
    wordReplacementEnabled = true;
    sendEvent('[replacementEnabled]');
    saveSettings();
  } else if (event.data === 'replacementDisable') {
    wordReplacementEnabled = false;
    sendEvent('[replacementDisabled]');
    saveSettings();
  } else if (event.data === 'replacementToggle') {
    wordReplacementEnabled = !wordReplacementEnabled;
    if (wordReplacementEnabled) sendEvent('[replacementEnabled]');
    else sendEvent('[replacementDisabled]');
    saveSettings();
  } else if (event.data === 'removePunctuationEnable') {
    removePunctuation = true;
    sendEvent('[removePunctuationEnabled]');
  } else if (event.data === 'removePunctuationDisable') {
    removePunctuation = false;
    sendEvent('[removePunctuationDisabled]');
  } else if (event.data === 'removePunctuationToggle') {
    removePunctuation = !removePunctuation;
    if (removePunctuation) sendEvent('[removePunctuationEnabled]');
    else sendEvent('[removePunctuationDisabled]');
  } else if (event.data === 'outputStreamingEnable') {
    outputStreaming = true;
    sendEvent('[outputStreamingEnabled]');
  } else if (event.data === 'outputStreamingDisable') {
    outputStreaming = false;
    sendEvent('[outputStreamingDisabled]');
  } else if (event.data === 'outputStreamingToggle') {
    outputStreaming = !outputStreaming;
    if (outputStreaming) sendEvent('[outputStreamingEnabled]');
    else sendEvent('[outputStreamingDisabled]');
  } else if (event.data === 'customCommandsEnable') {
    customCommandsEnabled = true;
    sendEvent('[customCommandsEnabled]');
    saveSettings();
  } else if (event.data === 'customCommandsDisable') {
    customCommandsEnabled = false;
    sendEvent('[customCommandsDisabled]');
    saveSettings();
  } else if (event.data === 'customCommandsToggle') {
    customCommandsEnabled = !customCommandsEnabled;
    if (customCommandsEnabled) sendEvent('[customCommandsEnabled]');
    else sendEvent('[customCommandsDisabled]');
    saveSettings();
  }
}

function setUseConfidenceThreshold() {
  confidenceThresholdCheckbox.checked = useConfidenceThreshold;
  confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
  document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  if (useConfidenceThreshold) sendEvent('[enableConfidenceThreshold]');
  else sendEvent('[disableConfidenceThreshold]');
  saveSettings();
}

function setDebugMode() {
  debugModeCheckbox.checked = debugModeEnabled;

  confidenceThresholdWrapper.style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";
  confidenceThresholdInputWrapper.style.display = useConfidenceThreshold ? "block" : "none";
  document.getElementById("confidenceValue").style.display = useConfidenceThreshold || debugModeEnabled ? "block" : "none";

  if (debugModeEnabled) sendEvent('[debugEnabled]');
  else sendEvent('[debugDisabled]');
  saveSettings();
}

function clearTranscript() {
  clearedSection = transcript;
  manuallyCleared = true;
  document.getElementById("sttOutput").innerHTML = '';
  sendEvent("[cleared]");
}

function onError(event) {
  document.getElementById("websocketStatus").innerHTML = '<span style="color: red;">ERROR: ' + event.data + '</span>';
}

function onClose(event) {
  document.getElementById("websocketStatus").innerHTML = '<span style="color: red;">Disconnected from backend</span>';
}

function exportWordDictionary() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(wordDictionary));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "rvb-word-replacement-dictionary.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function importWordDictionary(event) {
  const fileReader = new FileReader();
  fileReader.onload = function(event) {
    try {
      const importedDict = JSON.parse(event.target.result);
      wordDictionary = importedDict;
      renderWordPairs();
      saveSettings();
    } catch (error) {
      console.error('Error importing word dictionary:', error);
      alert('Invalid file format');
    }
  };
  const file = event.target.files[0];
  if (file) {
    fileReader.readAsText(file);
  }
}

function addCommandLogEntry(details) {
  const datetime = new Date();
  const dateString = datetime.toLocaleDateString();
  const timeString = datetime.toLocaleTimeString();

  console.log(details);

  let outputString = `<div class="log-entry"><div class="log-header"><span class="output-datime">${dateString} ${timeString}</span>
    <span style="font-weight: bold;">${details.matchedCommand}</span></div>
    <div class="output-container" style="display: flex;">`;

  if (details.output.command) {
    outputString += `<div class="output-command">Command <span class="command-label">${details.output.command}</span></div>`;
  }

  for (let i = 0; i < details.output.params.length; i++) {
    outputString += `<div class="output-parameter">${details.output.params[i].name} <span class="param-label ${details.output.type === 'number' ? 'param-number' : ''}">${details.output.params[i].value}</span></div>`;
  }

  outputString += "</div></div>";

  const newEntry = document.createElement("div");
  newEntry.classList.add("log-entry");
  newEntry.innerHTML = outputString;

  commandLog.prepend(newEntry);
}

function formatWebsocketCommand(details) {
  let outputString = '';
  if (details.command) {
    outputString += `${details.command}|`;
  }
  for (let i = 0; i < details.params.length; i++) {
    if (i > 0) outputString += '>'
    outputString += `${details.params[i].name}=${details.params[i].value}>`;
  }
  return outputString;
}

function testTranscriptCommands() {
  const preparedTranscript = stripPunctuationWebsocket(transcript);
  const results = testAllCommands(preparedTranscript);
  if (results.success) {
    addCommandLogEntry(results);
    websocket.send(formatWebsocketCommand(results.output));
  }
}

document.querySelectorAll('.accordion-button').forEach(button => {
  button.addEventListener('click', () => {
    const accordionContent = button.nextElementSibling;
    button.classList.toggle('active'); // Toggles the 'active' class on the button
    if (button.classList.contains('active')) {
      accordionContent.style.display = 'block';
    } else {
      accordionContent.style.display = 'none';
    }
  });
});

document.getElementById('exportWordDictBtn').addEventListener('click', exportWordDictionary);

document.getElementById('importWordDictBtn').addEventListener('click', () => {
  document.getElementById('wordDictFileInput').click(); // Trigger file input
});

document.getElementById('wordDictFileInput').addEventListener('change', importWordDictionary);

window.addEventListener("load", init, false);
