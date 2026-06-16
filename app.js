const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const dropZone = document.getElementById('dropZone');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const statusSection = document.getElementById('statusSection');
const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const resultSection = document.getElementById('resultSection');
const textOutput = document.getElementById('textOutput');
const langBadge = document.getElementById('langBadge');
const speakBtn = document.getElementById('speakBtn');
const copyBtn = document.getElementById('copyBtn');
const speedRange = document.getElementById('speedRange');
const speedValue = document.getElementById('speedValue');

let recognizedText = '';
let detectedLang = 'unknown';
let isSpeaking = false;
let speechRate = 1.0;

// --- Speed control ---
speedRange.addEventListener('input', () => {
    speechRate = parseFloat(speedRange.value);
    speedValue.textContent = speechRate.toFixed(1) + 'x';
});

// --- Image input: file picker ---
cameraInput.addEventListener('change', handleImageSelect);
galleryInput.addEventListener('change', handleImageSelect);

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    loadFileAsImage(file);
    e.target.value = '';
}

// --- Image input: paste ---
document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            loadFileAsImage(item.getAsFile());
            return;
        }
    }
});

// --- Image input: drag & drop ---
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        loadFileAsImage(file);
    }
});

function loadFileAsImage(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        previewImage.src = ev.target.result;
        previewContainer.hidden = false;
        performOCR(file);
    };
    reader.readAsDataURL(file);
}

// --- OCR ---
async function performOCR(file) {
    stopSpeaking();
    resultSection.hidden = true;
    statusSection.hidden = false;
    statusText.textContent = 'Loading recognition engine...';
    progressFill.style.width = '10%';

    try {
        const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 100);
                    progressFill.style.width = `${10 + pct * 0.85}%`;
                    statusText.textContent = `Recognizing... ${pct}%`;
                }
            }
        });

        progressFill.style.width = '95%';
        statusText.textContent = 'Extracting text...';

        const { data } = await worker.recognize(file);
        await worker.terminate();

        recognizedText = data.text.trim();
        progressFill.style.width = '100%';

        if (!recognizedText) {
            statusText.textContent = 'No text detected. Try a clearer image.';
            return;
        }

        detectedLang = detectLanguage(recognizedText);
        langBadge.textContent = {
            zh: 'Chinese', en: 'English', mixed: 'Mixed', unknown: 'Unknown'
        }[detectedLang];

        textOutput.textContent = recognizedText;
        resultSection.hidden = false;
        statusSection.hidden = true;
    } catch (err) {
        statusText.textContent = 'Recognition failed: ' + err.message;
        progressFill.style.width = '0%';
    }
}

// --- Language detection ---
function detectLanguage(text) {
    let cn = 0, en = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code >= 0x4E00 && code <= 0x9FFF) cn++;
        else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) en++;
    }
    if (cn > 0 && en > 0) return 'mixed';
    if (cn > 0) return 'zh';
    if (en > 0) return 'en';
    return 'unknown';
}

// --- Speech: pick the best available voice ---
let voiceCache = {};

function getBestVoice(langCode) {
    if (voiceCache[langCode]) return voiceCache[langCode];
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // Prefer natural / premium / enhanced voices
    const premium = ['natural', 'premium', 'enhanced', 'neural', 'wavenet'];
    const matching = voices.filter(v => v.lang.startsWith(langCode));

    for (const v of matching) {
        const name = v.name.toLowerCase();
        if (premium.some(kw => name.includes(kw))) {
            voiceCache[langCode] = v;
            return v;
        }
    }
    // Fallback: prefer non-compact local voice
    const local = matching.find(v => v.localService);
    const result = local || matching[0] || null;
    if (result) voiceCache[langCode] = result;
    return result;
}

// Pre-load voices
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        voiceCache = {};
        window.speechSynthesis.getVoices();
    };
}

// --- Speech: read aloud ---
speakBtn.addEventListener('click', () => {
    if (isSpeaking) {
        stopSpeaking();
    } else {
        speak(recognizedText, detectedLang);
    }
});

function makeUtterance(text, lang) {
    const u = new SpeechSynthesisUtterance(text);
    const langCode = lang === 'zh' ? 'zh' : 'en';
    u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    u.rate = speechRate;
    u.pitch = 1.0;
    const voice = getBestVoice(langCode);
    if (voice) u.voice = voice;
    return u;
}

function speak(text, lang) {
    if (!('speechSynthesis' in window)) {
        showToast('Speech synthesis not supported');
        return;
    }
    window.speechSynthesis.cancel();

    // Split long text into sentences for more natural reading
    if (lang === 'mixed') {
        speakMixed(text);
    } else {
        const chunks = splitIntoSentences(text);
        chunks.forEach((chunk, i) => {
            const u = makeUtterance(chunk, lang);
            if (i === chunks.length - 1) {
                u.onend = () => setSpeakingState(false);
            }
            u.onerror = () => setSpeakingState(false);
            window.speechSynthesis.speak(u);
        });
    }
    setSpeakingState(true);
}

function speakMixed(text) {
    const segments = splitByLanguage(text);
    segments.forEach((seg, i) => {
        const u = makeUtterance(seg.text, seg.lang);
        if (i === segments.length - 1) {
            u.onend = () => setSpeakingState(false);
        }
        u.onerror = () => setSpeakingState(false);
        window.speechSynthesis.speak(u);
    });
}

function splitIntoSentences(text) {
    // Split on sentence-ending punctuation, keeping short pauses natural
    const parts = text.split(/(?<=[.!?\u3002\uff01\uff1f\n])\s*/);
    return parts.filter(p => p.trim().length > 0);
}

function splitByLanguage(text) {
    const segments = [];
    let current = '';
    let currentLang = null;

    for (const ch of text) {
        const code = ch.codePointAt(0);
        let charLang = null;
        if (code >= 0x4E00 && code <= 0x9FFF) charLang = 'zh';
        else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) charLang = 'en';

        if (charLang && charLang !== currentLang && current.length > 0 && currentLang) {
            segments.push({ text: current, lang: currentLang });
            current = '';
        }
        if (charLang) currentLang = charLang;
        current += ch;
    }
    if (current) {
        segments.push({ text: current, lang: currentLang || 'en' });
    }
    return segments;
}

function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeakingState(false);
}

function setSpeakingState(speaking) {
    isSpeaking = speaking;
    if (speaking) {
        speakBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Stop';
        speakBtn.classList.add('btn-stop');
        speakBtn.classList.remove('btn-primary');
    } else {
        speakBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.5 4.5 0 0 0 2.5-3.5zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z"/></svg> Read Aloud';
        speakBtn.classList.remove('btn-stop');
        speakBtn.classList.add('btn-primary');
    }
}

// --- Copy ---
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(recognizedText).then(() => {
        showToast('Copied to clipboard');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = recognizedText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied to clipboard');
    });
});

// --- Toast ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.hidden = true; }, 300);
    }, 2000);
}

// --- Service Worker ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
