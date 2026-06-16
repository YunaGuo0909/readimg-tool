const MAX_IMAGES = 20;

const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const dropZone = document.getElementById('dropZone');
const thumbnailStrip = document.getElementById('thumbnailStrip');
const imageCounter = document.getElementById('imageCounter');
const imageCountText = document.getElementById('imageCountText');
const clearImagesBtn = document.getElementById('clearImagesBtn');
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

let imageQueue = [];       // { file, dataUrl }
let recognizedText = '';
let detectedLang = 'unknown';
let isSpeaking = false;
let speechRate = 1.0;
let keepAliveTimer = null;

// --- Speed control ---
speedRange.addEventListener('input', () => {
    speechRate = parseFloat(speedRange.value);
    speedValue.textContent = speechRate.toFixed(1) + 'x';
});

// --- Image input: file picker ---
cameraInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
});
galleryInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
});

// --- Image input: paste ---
document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            files.push(item.getAsFile());
        }
    }
    if (files.length) {
        e.preventDefault();
        addFiles(files);
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
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length) addFiles(files);
});

// --- Add files to queue ---
function addFiles(fileList) {
    const files = [...fileList].filter(f => f.type.startsWith('image/'));
    const remaining = MAX_IMAGES - imageQueue.length;
    if (remaining <= 0) {
        showToast(`Maximum ${MAX_IMAGES} images reached`);
        return;
    }
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
        showToast(`Only added ${remaining} of ${files.length} (limit ${MAX_IMAGES})`);
    }

    let loaded = 0;
    toAdd.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            imageQueue.push({ file, dataUrl: ev.target.result, name: file.name });
            loaded++;
            if (loaded === toAdd.length) {
                updateThumbnails();
                processAllImages();
            }
        };
        reader.readAsDataURL(file);
    });
}

// --- Clear all ---
clearImagesBtn.addEventListener('click', () => {
    stopSpeaking();
    imageQueue = [];
    recognizedText = '';
    updateThumbnails();
    resultSection.hidden = true;
    statusSection.hidden = true;
});

// --- Thumbnails with drag reorder ---
let dragSrcIdx = null;

function updateThumbnails() {
    thumbnailStrip.innerHTML = '';
    if (imageQueue.length === 0) {
        thumbnailStrip.hidden = true;
        imageCounter.hidden = true;
        return;
    }
    thumbnailStrip.hidden = false;
    imageCounter.hidden = false;
    imageCountText.textContent = `${imageQueue.length} image${imageQueue.length > 1 ? 's' : ''}`;

    imageQueue.forEach((item, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail';
        thumb.draggable = true;
        thumb.dataset.idx = idx;

        // Truncate filename for display
        const displayName = truncName(item.name, 12);

        thumb.innerHTML = `
            <img src="${item.dataUrl}" alt="Image ${idx + 1}" draggable="false">
            <span class="thumb-index">${idx + 1}</span>
            <button class="thumb-remove" data-idx="${idx}">&times;</button>
            <span class="thumb-name" title="${escHtml(item.name)}">${escHtml(displayName)}</span>
        `;
        thumbnailStrip.appendChild(thumb);

        // --- Drag events for reorder ---
        thumb.addEventListener('dragstart', (e) => {
            dragSrcIdx = idx;
            thumb.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', idx);
        });
        thumb.addEventListener('dragend', () => {
            thumb.classList.remove('dragging');
            thumbnailStrip.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('drag-over-left', 'drag-over-right'));
            dragSrcIdx = null;
        });
        thumb.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dragSrcIdx === null || dragSrcIdx === idx) return;
            const rect = thumb.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            thumb.classList.toggle('drag-over-left', e.clientX < midX);
            thumb.classList.toggle('drag-over-right', e.clientX >= midX);
        });
        thumb.addEventListener('dragleave', () => {
            thumb.classList.remove('drag-over-left', 'drag-over-right');
        });
        thumb.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            thumb.classList.remove('drag-over-left', 'drag-over-right');
            if (dragSrcIdx === null || dragSrcIdx === idx) return;
            // Move item in array
            const moved = imageQueue.splice(dragSrcIdx, 1)[0];
            imageQueue.splice(idx, 0, moved);
            dragSrcIdx = null;
            updateThumbnails();
            processAllImages();
        });
    });

    // --- Touch drag reorder ---
    initTouchDrag();

    // Remove individual image
    thumbnailStrip.querySelectorAll('.thumb-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            imageQueue.splice(idx, 1);
            updateThumbnails();
            if (imageQueue.length > 0) {
                processAllImages();
            } else {
                resultSection.hidden = true;
                statusSection.hidden = true;
                recognizedText = '';
            }
        });
    });
}

function truncName(name, max) {
    if (!name) return 'image';
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.substring(0, dot) : name;
    const ext = dot > 0 ? name.substring(dot) : '';
    if (base.length <= max) return name;
    return base.substring(0, max) + '...' + ext;
}

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Touch drag for mobile ---
function initTouchDrag() {
    let touchSrcIdx = null;
    let touchClone = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;

    const thumbs = thumbnailStrip.querySelectorAll('.thumbnail');
    thumbs.forEach((thumb, idx) => {
        thumb.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('thumb-remove')) return;
            const touch = e.touches[0];
            touchSrcIdx = idx;
            const rect = thumb.getBoundingClientRect();
            touchOffsetX = touch.clientX - rect.left;
            touchOffsetY = touch.clientY - rect.top;

            // Create floating clone after a brief hold
            setTimeout(() => {
                if (touchSrcIdx !== idx) return;
                touchClone = thumb.cloneNode(true);
                touchClone.className = 'thumbnail drag-clone';
                touchClone.style.width = rect.width + 'px';
                touchClone.style.height = rect.height + 'px';
                document.body.appendChild(touchClone);
                positionClone(touch.clientX, touch.clientY);
                thumb.classList.add('dragging');
            }, 150);
        }, { passive: true });

        thumb.addEventListener('touchmove', (e) => {
            if (touchClone) {
                e.preventDefault();
                positionClone(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: false });

        thumb.addEventListener('touchend', (e) => {
            if (touchClone) {
                const touch = e.changedTouches[0];
                const targetIdx = getThumbIdxAtPoint(touch.clientX, touch.clientY);
                document.body.removeChild(touchClone);
                touchClone = null;
                thumbs.forEach(t => t.classList.remove('dragging'));

                if (targetIdx !== null && targetIdx !== touchSrcIdx) {
                    const moved = imageQueue.splice(touchSrcIdx, 1)[0];
                    imageQueue.splice(targetIdx, 0, moved);
                    updateThumbnails();
                    processAllImages();
                }
            }
            touchSrcIdx = null;
        });
    });

    function positionClone(cx, cy) {
        if (!touchClone) return;
        touchClone.style.left = (cx - touchOffsetX) + 'px';
        touchClone.style.top = (cy - touchOffsetY) + 'px';
    }

    function getThumbIdxAtPoint(x, y) {
        const allThumbs = thumbnailStrip.querySelectorAll('.thumbnail');
        for (const t of allThumbs) {
            const r = t.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom + 20) {
                return parseInt(t.dataset.idx);
            }
        }
        return null;
    }
}

// --- OCR all images sequentially ---
async function processAllImages() {
    stopSpeaking();
    resultSection.hidden = true;
    statusSection.hidden = false;
    recognizedText = '';

    const total = imageQueue.length;
    let allTexts = [];

    try {
        statusText.textContent = 'Loading recognition engine...';
        progressFill.style.width = '5%';

        const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
            logger: () => {}
        });

        for (let i = 0; i < total; i++) {
            const pctBase = (i / total) * 100;
            const pctNext = ((i + 1) / total) * 100;

            statusText.textContent = `Recognizing image ${i + 1} of ${total}...`;
            progressFill.style.width = `${pctBase}%`;

            const { data } = await worker.recognize(imageQueue[i].file);
            const cleaned = cleanOCRText(data.text.trim());
            if (cleaned) allTexts.push(cleaned);

            progressFill.style.width = `${pctNext}%`;

            // Highlight current thumbnail
            const thumbs = thumbnailStrip.querySelectorAll('.thumbnail');
            thumbs.forEach((t, j) => {
                t.classList.toggle('done', j <= i);
                t.classList.toggle('active', j === i);
            });
        }

        await worker.terminate();

        recognizedText = allTexts.join('\n\n---\n\n');
        progressFill.style.width = '100%';

        if (!recognizedText) {
            statusText.textContent = 'No text detected in any image.';
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
    const cjk = '\\u4E00-\\u9FFF\\u3400-\\u4DBF\\uF900-\\uFAFF';
    const cjkPunc = '\\u3000-\\u303F\\uFF00-\\uFFEF';
    const re = new RegExp(`([${cjk}${cjkPunc}])\\s+([${cjk}${cjkPunc}])`, 'g');
    let cleaned = text.replace(re, '$1$2');
    cleaned = cleaned.replace(re, '$1$2');
    cleaned = cleaned.replace(new RegExp(`([${cjk}])\\s+([，。！？、；：""''（）])`, 'g'), '$1$2');
    cleaned = cleaned.replace(new RegExp(`([，。！？、；：""''（）])\\s+([${cjk}])`, 'g'), '$1$2');
    return cleaned;
}

// --- Speech ---
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

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
    window.speechSynthesis.cancel();

    setTimeout(() => {
        const effectiveLang = (lang === 'mixed') ? dominantLanguage(text) : lang;
        const langCode = effectiveLang === 'zh' ? 'zh-CN' : 'en-US';

        const u = new SpeechSynthesisUtterance(text);
        u.lang = langCode;
        u.rate = speechRate;
        u.pitch = 1.0;

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
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeakingState(false);
}

function setSpeakingState(speaking) {
    isSpeaking = speaking;
    if (speaking) {
        speakBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Stop';
        speakBtn.classList.add('btn-stop');
        speakBtn.classList.remove('btn-primary');
    } else {
        speakBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.5v7a4.5 4.5 0 0 0 2.5-3.5zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z"/></svg> Read All';
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
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
    }).then(() => {
        navigator.serviceWorker.register('sw.js');
    }).catch(() => {});
}
