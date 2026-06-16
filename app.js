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

        recognizedText = cleanOCRText(data.text.trim());
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

// --- Clean OCR output ---
function cleanOCRText(text) {
    // Remove spaces between CJK characters (Tesseract inserts them)
    const cjk = '\\u4E00-\\u9FFF\\u3400-\\u4DBF\\uF900-\\uFAFF';
    const cjkPunc = '\\u3000-\\u303F\\uFF00-\\uFFEF';
    const re = new RegExp(`([${cjk}${cjkPunc}])\\s+([${cjk}${cjkPunc}])`, 'g');
    // Run twice to catch overlapping matches (e.g. "A B C" → "AB C" → "ABC")
    let cleaned = text.replace(re, '$1$2');
    cleaned = cleaned.replace(re, '$1$2');
    // Remove space between CJK and CJK punctuation
    cleaned = cleaned.replace(new RegExp(`([${cjk}])\\s+([，。！？、；：""''（）])`, 'g'), '$1$2');
    cleaned = cleaned.replace(new RegExp(`([，。！？、；：""''（）])\\s+([${cjk}])`, 'g'), '$1$2');
    return cleaned;
}

// Pre-load voices
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// --- Speech: read aloud ---
let keepAliveTimer = null;

speakBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
        if (isSpeaking) {
            stopSpeaking();
        } else {
            speak(recognizedText, detectedLang);
        }
    } catch (err) {
        console.error('Speech error:', err);
        showToast('Speech error: ' + err.message);
    }
});

function speak(text, lang) {
    if (!window.speechSynthesis) {
        showToast('Speech synthesis not supported');
        return;
    }

    // Must cancel first
    window.speechSynthesis.cancel();

    // Small delay after cancel to let browser reset
    setTimeout(() => {
        const effectiveLang = (lang === 'mixed') ? dominantLanguage(text) : lang;
        const langCode = effectiveLang === 'zh' ? 'zh-CN' : 'en-US';

        const u = new SpeechSynthesisUtterance(text);
        u.lang = langCode;
        u.rate = speechRate;
        u.pitch = 1.0;

        // Try to find a matching voice
        const voices = window.speechSynthesis.getVoices();
        const match = voices.find(v => v.lang === langCode) ||
                      voices.find(v => v.lang.startsWith(effectiveLang === 'zh' ? 'zh' : 'en'));
        if (match) u.voice = match;

        u.onend = () => {
            clearInterval(keepAliveTimer);
            setSpeakingState(false);
        };
        u.onerror = (e) => {
            console.error('Speech utterance error:', e);
            clearInterval(keepAliveTimer);
            setSpeakingState(false);
        };

        window.speechSynthesis.speak(u);
        setSpeakingState(true);

        // Chrome workaround: poke speechSynthesis to prevent it from stopping
        clearInterval(keepAliveTimer);
        keepAliveTimer = setInterval(() => {
            if (!window.speechSynthesis.speaking) {
                clearInterval(keepAliveTimer);
                setSpeakingState(false);
                return;
            }
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
        }, 10000);
    }, 100);
}

function dominantLanguage(text) {
    let cn = 0, en = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code >= 0x4E00 && code <= 0x9FFF) cn++;
        else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) en++;
    }
    return cn >= en ? 'zh' : 'en';
}

function stopSpeaking() {
    clearInterval(keepAliveTimer);
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
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

// --- Service Worker: unregister old, register fresh ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    }).then(() => {
        navigator.serviceWorker.register('sw.js');
    }).catch(() => {});
}
