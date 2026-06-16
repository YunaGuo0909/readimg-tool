const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
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

let recognizedText = '';
let detectedLang = 'unknown';
let isSpeaking = false;

// Image input handlers
cameraInput.addEventListener('change', handleImageSelect);
galleryInput.addEventListener('change', handleImageSelect);

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        previewImage.src = ev.target.result;
        previewContainer.hidden = false;
        performOCR(file);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// OCR
async function performOCR(file) {
    stopSpeaking();
    resultSection.hidden = true;
    statusSection.hidden = false;
    statusText.textContent = '正在加载识别引擎...';
    progressFill.style.width = '10%';

    try {
        const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 100);
                    progressFill.style.width = `${10 + pct * 0.85}%`;
                    statusText.textContent = `识别中... ${pct}%`;
                }
            }
        });

        progressFill.style.width = '95%';
        statusText.textContent = '正在提取文字...';

        const { data } = await worker.recognize(file);
        await worker.terminate();

        recognizedText = data.text.trim();
        progressFill.style.width = '100%';

        if (!recognizedText) {
            statusText.textContent = '未识别到文字，请尝试更清晰的图片';
            return;
        }

        detectedLang = detectLanguage(recognizedText);
        langBadge.textContent = {
            zh: '中文', en: 'English', mixed: '中英混合', unknown: '未知'
        }[detectedLang];

        textOutput.textContent = recognizedText;
        resultSection.hidden = false;
        statusSection.hidden = true;
    } catch (err) {
        statusText.textContent = '识别失败: ' + err.message;
        progressFill.style.width = '0%';
    }
}

// Language detection
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

// Speech
speakBtn.addEventListener('click', () => {
    if (isSpeaking) {
        stopSpeaking();
    } else {
        speak(recognizedText, detectedLang);
    }
});

function speak(text, lang) {
    if (!('speechSynthesis' in window)) {
        showToast('当前浏览器不支持语音朗读');
        return;
    }
    window.speechSynthesis.cancel();

    if (lang === 'mixed') {
        speakMixed(text);
    } else {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
        utterance.onend = () => setSpeakingState(false);
        utterance.onerror = () => setSpeakingState(false);
        window.speechSynthesis.speak(utterance);
    }
    setSpeakingState(true);
}

function speakMixed(text) {
    const segments = splitByLanguage(text);
    segments.forEach((seg, i) => {
        const utterance = new SpeechSynthesisUtterance(seg.text);
        utterance.lang = seg.lang === 'zh' ? 'zh-CN' : 'en-US';
        if (i === segments.length - 1) {
            utterance.onend = () => setSpeakingState(false);
        }
        utterance.onerror = () => setSpeakingState(false);
        window.speechSynthesis.speak(utterance);
    });
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
    speakBtn.innerHTML = speaking
        ? '<span class="icon">⏹️</span> 停止'
        : '<span class="icon">🔊</span> 朗读';
    if (speaking) {
        speakBtn.classList.add('btn-danger');
        speakBtn.classList.remove('btn-primary');
    } else {
        speakBtn.classList.remove('btn-danger');
        speakBtn.classList.add('btn-primary');
    }
}

// Copy
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(recognizedText).then(() => {
        showToast('已复制到剪贴板');
    }).catch(() => {
        // Fallback for iOS
        const ta = document.createElement('textarea');
        ta.value = recognizedText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('已复制到剪贴板');
    });
});

// Toast
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

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
