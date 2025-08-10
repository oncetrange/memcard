const cardFrontInput = document.getElementById('card-front');
const cardBackInput = document.getElementById('card-back');
const saveCardButton = document.getElementById('save-card');
const cardsContainer = document.getElementById('cards-container');
const startReviewButton = document.getElementById('start-review');
const reviewSection = document.getElementById('review-section');
const createSection = document.getElementById('create-section');
const cardsListSection = document.getElementById('cards-list');
const reviewCard = document.getElementById('review-card');
const cardContent = document.getElementById('card-content');
const cardPreview = document.getElementById('card-preview');
const speechEnabledSetting = document.getElementById('speech-enabled-setting');

const API_BASE_URL = 'https://117.72.179.137:3000/api'

const AUDIO_CACHE_PREFIX = 'youdao_audio_';
const AUDIO_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000;
const AUDIO_CACHE_MAX_ENTRIES = 200;

let userStatus, loginButton, registerButton, logoutButton, settingsButton;
let loginSection, registerSection, settingsSection;
let loginSubmit, loginCancel, registerSubmit, registerCancel;
let uploadCards, downloadCards, mergeCards, settingsBack;

async function getYoudaoAudioUrl(word) {
    const encodedWord = encodeURIComponent(word);
    return `${API_BASE_URL}/youdao-audio?audio=${encodedWord}&type=1`;
}

function getAudioCacheKey(word) {
    return AUDIO_CACHE_PREFIX + word.toLowerCase();
}

function isAudioCached(word) {
    const cacheKey = getAudioCacheKey(word);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return false;
    
    try {
        const cacheData = JSON.parse(cached);
        const now = Date.now();
        const valid = (now - cacheData.timestamp) < AUDIO_CACHE_DURATION;
        if (!valid) {
            // 过期立即清理，释放空间
            localStorage.removeItem(cacheKey);
        }
        return valid;
    } catch (e) {
        return false;
    }
}

function getCachedAudio(word) {
    const cacheKey = getAudioCacheKey(word);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    try {
        const cacheData = JSON.parse(cached);
        return cacheData.audioData;
    } catch (e) {
        return null;
    }
}

function isQuotaExceededError(err) {
    if (!err) return false;
    return (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014
    );
}

function getAllAudioCacheEntries() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(AUDIO_CACHE_PREFIX)) continue;
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed.timestamp !== 'number') continue;
            const size = raw ? raw.length : 0;
            entries.push({ key, timestamp: parsed.timestamp, size });
        } catch (_) {
            // 格式异常直接移除
            localStorage.removeItem(key);
        }
    }
    return entries;
}

function pruneExpiredAudioCache() {
    const now = Date.now();
    const entries = getAllAudioCacheEntries();
    for (const { key, timestamp } of entries) {
        if (now - timestamp >= AUDIO_CACHE_DURATION) {
            localStorage.removeItem(key);
        }
    }
}

function pruneOldestAudioCache(count = 5) {
    const entries = getAllAudioCacheEntries();
    entries.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < Math.min(count, entries.length); i++) {
        localStorage.removeItem(entries[i].key);
    }
}

function enforceAudioCacheEntryLimit() {
    const entries = getAllAudioCacheEntries();
    if (entries.length <= AUDIO_CACHE_MAX_ENTRIES) return;
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const overflow = entries.length - AUDIO_CACHE_MAX_ENTRIES;
    for (let i = 0; i < overflow; i++) {
        localStorage.removeItem(entries[i].key);
    }
}

function cacheAudio(word, audioData) {
    const cacheKey = getAudioCacheKey(word);
    const cacheData = {
        timestamp: Date.now(),
        audioData: audioData
    };
    // 优先清理过期项与超额项
    try {
        enforceAudioCacheEntryLimit();
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        return;
    } catch (err) {
        if (!isQuotaExceededError(err)) {
            console.warn('Cache audio failed (non-quota):', err);
            return;
        }
    }

    // 第一次失败：移除过期项后重试
    try {
        pruneExpiredAudioCache();
        enforceAudioCacheEntryLimit();
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        return;
    } catch (err2) {
        if (!isQuotaExceededError(err2)) {
            console.warn('Cache audio failed after pruneExpired:', err2);
            return;
        }
    }

    // 仍失败：按时间最早移除一批后多次重试
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            pruneOldestAudioCache(10);
            enforceAudioCacheEntryLimit();
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            return;
        } catch (err3) {
            if (!isQuotaExceededError(err3)) {
                console.warn('Cache audio failed after pruneOldest:', err3);
                return;
            }
        }
    }
    console.warn('Cache audio skipped: storage quota exceeded after multiple attempts');
}

async function fetchYoudaoAudio(word) {
    try {
        const audioUrl = await getYoudaoAudioUrl(word);
        const response = await fetch(audioUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        return `data:audio/mp3;base64,${base64Audio}`;
    } catch (error) {
        console.error('Failed to fetch Youdao audio:', error);
        return null;
    }
}

async function playYoudaoAudio(word) {
    try {
        // 检查本地缓存
        if (isAudioCached(word)) {
            const cachedAudio = getCachedAudio(word);
            if (cachedAudio) {
                await playAudioData(cachedAudio);
                return true;
            }
        }
        
        // 从有道API获取音频
        const audioData = await fetchYoudaoAudio(word);
        if (audioData) {
            // 缓存音频数据
            cacheAudio(word, audioData);
            // 播放音频
            await playAudioData(audioData);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error playing Youdao audio:', error);
        return false;
    }
}

function playAudioData(audioData) {
    return new Promise((resolve, reject) => {
        isPlayingAudio = true;
        const audio = new Audio(audioData);
        audio.onended = () => {
            isPlayingAudio = false;
            resolve();
        };
        audio.onerror = (error) => {
            isPlayingAudio = false;
            reject(error);
        };
        audio.play().catch((error) => {
            isPlayingAudio = false;
            reject(error);
        });
    });
}

function initAuthElements() {
    userStatus = document.getElementById('user-status');
    loginButton = document.getElementById('login-button');
    registerButton = document.getElementById('register-button');
    logoutButton = document.getElementById('logout-button');
    settingsButton = document.getElementById('settings-button');
    loginSection = document.getElementById('login-section');
    registerSection = document.getElementById('register-section');
    settingsSection = document.getElementById('settings-section');
    loginSubmit = document.getElementById('login-submit');
    loginCancel = document.getElementById('login-cancel');
    registerSubmit = document.getElementById('register-submit');
    registerCancel = document.getElementById('register-cancel');
    uploadCards = document.getElementById('upload-cards');
    downloadCards = document.getElementById('download-cards');
    mergeCards = document.getElementById('merge-cards');
    settingsBack = document.getElementById('settings-back');
}


let cards = JSON.parse(localStorage.getItem('memoryCards')) || [];
let reviewCards = [];
let currentCardIndex = 0;
let isShowingAnswer = false;
let currentUser = null;
let authToken = localStorage.getItem('authToken') || null;
let editingCardId = null;
let speechSynthesis = window.speechSynthesis;
let isPlayingAudio = false;

let isServerAvailable = false;

function updateCardsStats() {
    const totalCount = cards.length;
    const now = Date.now();
    const reviewCount = cards.filter(card => card.nextReviewDate <= now).length;
    
    const totalCountElement = document.getElementById('total-count');
    const reviewCountElement = document.getElementById('review-count');
    
    if (totalCountElement) {
        totalCountElement.textContent = totalCount;
    }
    if (reviewCountElement) {
        reviewCountElement.textContent = reviewCount;
    }
}

async function speakText(text, options = {}) {
    if (speechEnabledSetting && !speechEnabledSetting.checked) {
        return;
    }

    if (isPlayingAudio) {
        return;
    }
    
    try {
        const success = await playYoudaoAudio(text);
        if (success) {
            return;
        }
    } catch (error) {
        console.log('Youdao API failed, falling back to browser speech');
    }
    
    if (!speechSynthesis) {
        console.log('Speech synthesis not supported');
        return;
    }
    
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.rate = options.rate || 0.8;
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 0.8;
    utterance.lang = options.lang || 'en-US';
    isPlayingAudio = true;
    utterance.onend = () => {
        isPlayingAudio = false;
    };
    utterance.onerror = () => {
        isPlayingAudio = false;
    };
    
    speechSynthesis.speak(utterance);
}

function showEditSection(cardId) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    
    editingCardId = cardId;
    const editFrontInput = document.getElementById('edit-card-front');
    const editBackInput = document.getElementById('edit-card-back');
    
    editFrontInput.value = card.front;
    editBackInput.value = card.back;
    
    hideAllSections();
    document.getElementById('edit-section').classList.remove('hidden');
}

function saveEdit() {
    const front = document.getElementById('edit-card-front').value.trim();
    const back = document.getElementById('edit-card-back').value.trim();
    
    if (!front || !back) {
        alert('Please enter both front and back content');
        return;
    }
    
    const cardIndex = cards.findIndex(c => c.id === editingCardId);
    if (cardIndex === -1) return;
    
    cards[cardIndex].front = front;
    cards[cardIndex].back = back;
    
    saveCards();
    renderCardsList();
    updateCardsStats();

    editingCardId = null;
    document.getElementById('edit-card-front').value = '';
    document.getElementById('edit-card-back').value = '';

    showCardsList();
}


function cancelEdit() {
    editingCardId = null;
    document.getElementById('edit-card-front').value = '';
    document.getElementById('edit-card-back').value = '';
    
    showCardsList();
}

async function checkServerAvailability() {
    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout.')), 2000);
        });
        
        const fetchPromise = fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        isServerAvailable = response.ok;
    } catch (error) {
        console.log('Server unavailable, using offline mode');
        isServerAvailable = false;
    }
    updateServerStatusUI();
    return isServerAvailable;
}

function updateServerStatusUI() {
    if (userStatus) {
        if (!isServerAvailable) {
            if (loginButton) loginButton.classList.add('hidden');
            if (registerButton) registerButton.classList.add('hidden');
            if (logoutButton) logoutButton.classList.add('hidden');
            userStatus.textContent = 'offline';
        }
    }
}

async function register(username, password, confirmPassword) {
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return false;
    }
    
    // 检查服务器是否可用
    if (!isServerAvailable && !(await checkServerAvailability())) {
        alert('Server unavailable, unable to register. Please try again later.');
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Register failed!');
        }
        
        alert('Sucessfully registered! Please login.');
        showLoginSection();
        return true;
    } catch (error) {
        alert(error.message);
        return false;
    }
}

async function login(username, password) {
    if (!isServerAvailable && !(await checkServerAvailability())) {
        alert('Server unavailable, unable to login.');
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Login failed!');
        }

        authToken = data.token;
        currentUser = data.username;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', currentUser);

        updateAuthUI();
        showCardsList();
        
        return true;
    } catch (error) {
        alert(error.message);
        return false;
    }
}

async function logout() {
    if (!authToken) return;
    
    // 检查服务器是否可用
    if (isServerAvailable) {
        try {
            await fetch(`${API_BASE_URL}/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': authToken,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('logout error:', error);
        }
    }
    
    // 清除认证信息
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    // 更新UI
    updateAuthUI();
}

async function checkAuth() {
    if (!authToken) {
        currentUser = null;
        updateAuthUI();
        return false;
    }

    if (!await checkServerAvailability()) {
        currentUser = localStorage.getItem('currentUser');
        if (currentUser) {
            updateAuthUI();
            return true;
        } else {
            authToken = null;
            updateAuthUI();
            return false;
        }
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/cards`, {
            headers: {
                'Authorization': authToken
            }
        });
        
        if (!response.ok) {
            throw new Error('Authentication failed!');
        }
        
        // 从响应中提取用户名
        currentUser = localStorage.getItem('currentUser') || '用户';
        updateAuthUI();
        return true;
    } catch (error) {
        console.error('Authentication error:', error);
        authToken = null;
        currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        updateAuthUI();
        return false;
    }
}

// 卡片同步相关函数
async function uploadCardsToServer() {
    if (!authToken) {
        alert('Please login first');
        return false;
    }
    
    // 检查服务器是否可用
    if (!isServerAvailable && !(await checkServerAvailability())) {
        alert('Server unavailable.');
        return false;
    }
    
    try {
        const uploadData = {
            cards: cards,
            gemSlots: gemSlots,
            gemTotal: gemTotal
        };
        
        const response = await fetch(`${API_BASE_URL}/cards`, {
            method: 'POST',
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(uploadData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed!');
        }
        
        alert('Successfully uploaded!');
        return true;
    } catch (error) {
        if (error.message.includes('413')) {
            alert('Upload failed: Data too large. Please try with fewer cards or contact support.');
        } else {
            alert(error.message);
        }
        return false;
    }
}

async function downloadCardsFromServer() {
    if (!authToken) {
        alert('请先登录');
        return false;
    }
    
    // 检查服务器是否可用
    if (!isServerAvailable && !(await checkServerAvailability())) {
        alert('Server unavailable.');
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/cards`, {
            headers: {
                'Authorization': authToken
            }
        });
        
        if (!response.ok) {
            throw new Error('Download failed!');
        }
        
        const serverData = await response.json();
        
        if (confirm('Download will cover local data, continue?')) {
            if (Array.isArray(serverData)) {
                cards = serverData;
                gemSlots = [0, 0, 0, 0, 0, 0];
                gemTotal = [0, 0, 0, 0, 0, 0];
            } else {
                cards = serverData.cards || [];
                gemSlots = serverData.gemSlots || [0, 0, 0, 0, 0, 0];
                gemTotal = serverData.gemTotal || [0, 0, 0, 0, 0, 0];
            }
            
            saveCards();
            renderCardsList();
            renderGemSlots();
            updateReviewButtonState();
            alert('Successfully downloaded!');
            return true;
        }
    } catch (error) {
        alert(error.message);
        return false;
    }
}

async function mergeCardsWithServer() {
    if (!authToken) {
        alert('Please login first.');
        return false;
    }

    if (!isServerAvailable && !(await checkServerAvailability())) {
        alert('Server unavailable.');
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/cards`, {
            headers: {
                'Authorization': authToken
            }
        });
        
        if (!response.ok) {
            throw new Error('Download cards failed.');
        }
        
        const serverData = await response.json();

        let serverCards = [];
        let serverGemSlots = [0, 0, 0, 0, 0, 0];
        let serverGemTotal = [0, 0, 0, 0, 0, 0];
        
        if (Array.isArray(serverData)) {
            serverCards = serverData;
        } else {
            serverCards = serverData.cards || [];
            serverGemSlots = serverData.gemSlots || [0, 0, 0, 0, 0, 0];
            serverGemTotal = serverData.gemTotal || [0, 0, 0, 0, 0, 0];
        }

        const mergedCards = [...cards];
        const localCardIds = new Set(cards.map(card => card.id));
        
        for (const serverCard of serverCards) {
            if (!localCardIds.has(serverCard.id)) {
                mergedCards.push(serverCard);
            }
        }
        
        for (let i = 0; i < 6; i++) {
            gemSlots[i] = Math.max(gemSlots[i], serverGemSlots[i]);
            gemTotal[i] = Math.max(gemTotal[i], serverGemTotal[i]);
        }
        
        cards = mergedCards;
        saveCards();
        renderCardsList();
        renderGemSlots();
        updateReviewButtonState();

        await uploadCardsToServer();
        
        alert('Successfully merged!');
        return true;
    } catch (error) {
        alert(error.message);
        return false;
    }
}

function updateAuthUI() {
    if (!userStatus || !loginButton || !registerButton || !logoutButton || !settingsButton) {
        return;
    }
    
    if (currentUser && authToken) {
        userStatus.textContent = `${currentUser}`;
        loginButton.classList.add('hidden');
        registerButton.classList.add('hidden');
        logoutButton.classList.remove('hidden');
        settingsButton.classList.remove('hidden');
    } else {
        userStatus.textContent = 'offline';
        loginButton.classList.remove('hidden');
        registerButton.classList.remove('hidden');
        logoutButton.classList.add('hidden');
        settingsButton.classList.add('hidden');
    }
}

function showLoginSection() {
    hideAllSections();
    if (loginSection) loginSection.classList.remove('hidden');
}

function showRegisterSection() {
    hideAllSections();
    if (registerSection) registerSection.classList.remove('hidden');
}

function showSettingsSection() {
    hideAllSections();
    if (settingsSection) settingsSection.classList.remove('hidden');
}

function hideAllSections() {
    if (createSection) createSection.classList.add('hidden');
    if (cardsListSection) cardsListSection.classList.add('hidden');
    if (reviewSection) reviewSection.classList.add('hidden');
    if (loginSection) loginSection.classList.add('hidden');
    if (registerSection) registerSection.classList.add('hidden');
    if (settingsSection) settingsSection.classList.add('hidden');
    if (document.getElementById('edit-section')) document.getElementById('edit-section').classList.add('hidden');
    if (cardPreview) cardPreview.classList.add('hidden');
}

function showCreateSection() {
    hideAllSections();
    createSection.classList.remove('hidden');
    cardFrontInput.focus();
}

function showCardsList() {
    hideAllSections();
    cardsListSection.classList.remove('hidden');
}

function initApp() {
    initAuthElements();
    loadScoreData();
    
    showCardsList();
    
    renderCardsList();
    renderGemSlots();
    updateReviewButtonState();

    checkServerAvailability().then(() => {
        if (userStatus) {
            checkAuth();
        }
    });

    if (loginButton) {
        loginButton.addEventListener('click', showLoginSection);
    }
    
    if (registerButton) {
        registerButton.addEventListener('click', showRegisterSection);
    }
    
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    
    if (settingsButton) {
        settingsButton.addEventListener('click', showSettingsSection);
    }
    
    if (loginSubmit) {
        loginSubmit.addEventListener('click', async () => {
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value.trim();
            
            if (!username || !password) {
                alert('Please enter the username and password.');
                return;
            }
            
            if (await login(username, password)) {
                document.getElementById('login-username').value = '';
                document.getElementById('login-password').value = '';
            }
        });
    }
    
    if (loginCancel) {
        loginCancel.addEventListener('click', () => {
            showCardsList();
            const usernameInput = document.getElementById('login-username');
            const passwordInput = document.getElementById('login-password');
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
        });
    }
    
    if (registerSubmit) {
        registerSubmit.addEventListener('click', async () => {
            const username = document.getElementById('register-username').value.trim();
            const password = document.getElementById('register-password').value.trim();
            const confirmPassword = document.getElementById('register-confirm-password').value.trim();
            
            if (!username || !password || !confirmPassword) {
                alert('Please fill all boxes.');
                return;
            }
            
            if (await register(username, password, confirmPassword)) {
                const usernameInput = document.getElementById('register-username');
                const passwordInput = document.getElementById('register-password');
                const confirmInput = document.getElementById('register-confirm-password');
                if (usernameInput) usernameInput.value = '';
                if (passwordInput) passwordInput.value = '';
                if (confirmInput) confirmInput.value = '';
            }
        });
    }
    
    if (registerCancel) {
        registerCancel.addEventListener('click', () => {
            showCardsList();
            const usernameInput = document.getElementById('register-username');
            const passwordInput = document.getElementById('register-password');
            const confirmInput = document.getElementById('register-confirm-password');
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (confirmInput) confirmInput.value = '';
        });
    }
    
    if (uploadCards) {
        uploadCards.addEventListener('click', async () => {
            await uploadCardsToServer();
        });
    }
    
    if (downloadCards) {
        downloadCards.addEventListener('click', async () => {
            await downloadCardsFromServer();
        });
    }
    
    if (mergeCards) {
        mergeCards.addEventListener('click', async () => {
            await mergeCardsWithServer();
        });
    }
    
    if (settingsBack) {
        settingsBack.addEventListener('click', () => {
            showCardsList();
        });
    }
    
    // 编辑相关按钮事件监听器
    const saveEditButton = document.getElementById('save-edit');
    const cancelEditButton = document.getElementById('cancel-edit');
    const addCardButton = document.getElementById('add-card-btn');
    const backToListButton = document.getElementById('back-to-list');
    if (saveEditButton) {
        saveEditButton.addEventListener('click', saveEdit);
    }
    
    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', cancelEdit);
    }
    
    if (addCardButton) {
        addCardButton.addEventListener('click', showCreateSection);
    }
    
    if (backToListButton) {
        backToListButton.addEventListener('click', showCardsList);
    }

    // 添加键盘事件监听器
    document.addEventListener('keydown', handleKeyDown);
}

let gemSlots = [0, 0, 0, 0, 0, 0];
let gemTotal = [0, 0, 0, 0, 0, 0];
const GEM_COLORS = [
    '#3b6fff', // blue
    '#00e0e0', // cyan
    '#3edc6a', // green
    '#ffe14b', // yellow
    '#ff4b4b', // red
    '#ff7ad9'  // pink
];
const GEM_IMAGES = [
    'assets/images/blue.svg',
    'assets/images/cyan.svg',
    'assets/images/green.svg',
    'assets/images/yellow.svg',
    'assets/images/red.svg',
    'assets/images/pink.svg',
];

function getRandomGems(count) {
    const gems = [];
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * 6);
        gems.push({
            index: randomIndex,
            isNew: false
        });
    }
    return gems;
}

function getGemPath(gemIndex) {
    return GEM_IMAGES[gemIndex] || '';
}

function getGemName(gemIndex) {
    const path = getGemPath(gemIndex);
    return path.split('/').pop().replace('.svg', '');
}

function showCardPreview(front, gemlist) {
    if (!cardPreview) return;
    
    // 处理宝石数据
    const sortedGems = [...gemlist].sort((a, b) => {
        return a.index - b.index;
    });
    
    const gemHTML = sortedGems.map(gemData => 
        `<img src="${getGemPath(gemData.index)}" alt="gem" title="${getGemName(gemData.index)}">`
    ).join('');
    
    const gemCount = gemlist.length;
    let effectClass = '';
    let aniDuration = 1500;
    if (gemCount === 2) {
        effectClass = 'preview-2-gems';
        aniDuration = 2000;
    } else if (gemCount === 3) {
        effectClass = 'preview-3-gems';
        aniDuration = 3000;
    }
    cardPreview.innerHTML = `
        <div class="gem-container">
            ${gemHTML}
        </div>
        <div class="card-preview-front">${front}</div>
    `;
    if (effectClass!='') cardPreview.classList.add(effectClass);
    cardPreview.classList.add('show');
    cardPreview.classList.remove('hidden');
    setTimeout(() => {
        cardPreview.classList.remove('show');
        setTimeout(() => {
            if (effectClass!='') cardPreview.classList.remove(effectClass);
            cardPreview.classList.add('hidden');
            cardPreview.innerHTML = '';
        }, 800);
    }, aniDuration);
    
}

function saveCard() {
    const front = cardFrontInput.value.trim();
    const back = cardBackInput.value.trim();
    if (front && back) {
        const random = Math.random();
        let gemCount;
        if (random < 0.84) {
            gemCount = 1;
        } else if (random < 0.99) {
            gemCount = 2;
        } else {
            gemCount = 3;
        }
        gemlist = getRandomGems(gemCount);
        gemlist = [...gemlist].sort((a, b) => a.index - b.index);
        const newCard = {
            id: Date.now(),
            front,
            back,
            gem: gemlist,
            lastReviewed: null,
            history: [],
            fimilarity: 0,
            nextReviewDate: Date.now(),
        };
        cards.push(newCard);
        saveCards();
        renderCardsList();
        updateReviewButtonState();
        showCardPreview(front, gemlist);
        cardFrontInput.value = '';
        cardBackInput.value = '';
        cardFrontInput.focus();
    } else {
        alert('please enter the front and back content');
    }
}

saveCardButton.addEventListener('click', saveCard);

function renderCardsList() {
    cardsContainer.innerHTML = '';
    if (cards.length === 0) {
        cardsContainer.innerHTML = '<p>empty, please create new cards</p>';
        return;
    }
    cards.sort((a, b) => a.nextReviewDate - b.nextReviewDate);
    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'card-item';
        
        const lastReviewedText = card.lastReviewed 
            ? `Last Reviewed: ${new Date(card.lastReviewed).toLocaleDateString()}` 
            : 'Not Reviewed';
        time = card.nextReviewDate - Date.now();
        nextReviewText = '';    
        if (time > 48 * 60 * 60 * 1000) {
            nextReviewText = `Next Review: ${Math.round(time/(24 * 60 * 60 * 1000))} days`;
        } else if (time > 2 * 60 * 60 * 1000) {
            nextReviewText = `Next Review: ${Math.round(time/(60 * 60 * 1000))} hours`;
        } else if (time > 0) {
            nextReviewText = `Next Review: ${Math.round(time/(60 * 1000))} minutes`;
        } else if (time > -24 * 60 * 60 * 1000) {
            nextReviewText = `Next Review: ${-Math.round(time/(60 * 60 * 1000))} hours ago`;
        } else {
            nextReviewText = `Next Review: ${-Math.round(time/(24 * 60 * 60 * 1000))} days ago`;
        }
        
        // 渲染宝石
        const gemHTML = card.gem && card.gem.length > 0 ? 
            `<div class="card-item-gems">
                ${card.gem.map(gemData => {
                    const gemIndex = gemData.index;
                    const isNewGem = gemData.isNew;
                    const gemClass = isNewGem ? 'new-gem' : '';
                    return `<img src="${getGemPath(gemIndex)}" alt="gem" title="${getGemName(gemIndex)}" class="${gemClass}">`;
                }).join('')}
            </div>` : '<div class="card-item-gems"></div>';
        
        cardElement.innerHTML = `
            <div class="card-item-content">
                <div class="card-item-front">${card.front}</div>
                <div class="card-item-back">${card.back}</div>
                <div class="card-item-stats">
                    ${lastReviewedText} | ${nextReviewText}
                </div>
            </div>
            ${gemHTML}
            <div class="card-item-actions">
                <button class="edit-card" data-id="${card.id}">edit</button>
                <button class="delete-card" data-id="${card.id}">delete</button>
            </div>
        `;
        
        cardsContainer.appendChild(cardElement);
    });

    document.querySelectorAll('.delete-card').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            deleteCard(id);
        });
    });
    
    document.querySelectorAll('.edit-card').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            showEditSection(id);
        });
    });
    
    updateCardsStats();
}

function deleteCard(id) {
    if (confirm('Are you sure you want to delete this card?')) {
        cards = cards.filter(card => card.id !== id);
        saveCards();
        renderCardsList();
        updateReviewButtonState();
    }
}

function saveCards() {
    localStorage.setItem('memoryCards', JSON.stringify(cards));
    localStorage.setItem('gemSlots', JSON.stringify(gemSlots));
    localStorage.setItem('gemTotal', JSON.stringify(gemTotal));
}

function loadScoreData() {
    const savedGemSlots = localStorage.getItem('gemSlots');
    const savedGemTotal = localStorage.getItem('gemTotal');
    
    if (savedGemSlots) {
        gemSlots = JSON.parse(savedGemSlots);
    }
    if (savedGemTotal) {
        gemTotal = JSON.parse(savedGemTotal);
    }
}

function updateReviewButtonState() {
    startReviewButton.disabled = cards.length === 0;
    if (cards.length === 0) {
        startReviewButton.classList.add('disabled');
    } else {
        startReviewButton.classList.remove('disabled');
    }
}

startReviewButton.addEventListener('click', () => {
    if (cards.length === 0) return;
  
    if(selectCardsForReview()){
        createSection.classList.add('hidden');
        cardsListSection.classList.add('hidden');
        reviewSection.classList.remove('hidden');

        currentCardIndex = 0;
        isShowingAnswer = false;
        setupSwipeEvents();
        showCurrentCard();

        // start session metrics
        sessionStartMs = Date.now();
        sessionUnknownCount = 0;
        sessionTotalCount = 0;
    }
});

function selectCardsForReview() {
    const now = Date.now();

    const eligibleCards = cards.filter(card => {
        return card.nextReviewDate <= now;
    });
    
    reviewCards = eligibleCards.slice(0, 20);

    if (reviewCards.length < 10) {
        alert('Not enough cards to review, please create more');
        return false;
    }
    
    shuffleArray(reviewCards);
    return true;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function showCurrentCard() {
    if (currentCardIndex >= reviewCards.length) {
        finishReview();
        return;
    }
    cardContent.style.display = 'flex';
    cardContent.style.alignItems = 'center';
    cardContent.style.justifyContent = 'center';
    cardContent.classList.remove('swiped-left', 'swiped-right', 'swiped-up', 'dragging');
    cardContent.style.transform = '';
    cardContent.style.backgroundColor = '';
    cardContent.style.color = '';
    isShowingAnswer = true;
    
    toggleCardFace(true);
}

function renderGemSlots() {
    const gemSlotsDiv = document.getElementById('gem-slots');
    if (!gemSlotsDiv) return;
    gemSlotsDiv.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.className = 'gem-slot';
        slot.innerHTML = `
            <img class="gem-slot-img" src="${getGemPath(i)}" alt="gem">
            <div class="gem-slot-score" style="color:${GEM_COLORS[i]};font-size:12px">${gemTotal[i]}</div>
            <div class="gem-slot-glow" id="gem-slot-glow-${i}"></div>
            <div class="gem-slot-cover" id="gem-slot-cover-${i}"></div>
        `;
        
        // 鼠标悬浮显示槽位分数
        slot.addEventListener('mouseenter', () => {
            const scoreTooltip = document.createElement('div');
            scoreTooltip.className = 'score-tooltip';
            scoreTooltip.textContent = `${gemSlots[i]}`;
            scoreTooltip.style.color = GEM_COLORS[i];
            slot.appendChild(scoreTooltip);
        });
        
        slot.addEventListener('mouseleave', () => {
            const tooltip = slot.querySelector('.score-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        });
        
        gemSlotsDiv.appendChild(slot);
    }
    updateGemSlotCovers();
}

function updateGemSlotCovers() {
    for (let i = 0; i < 6; i++) {
        const cover = document.getElementById(`gem-slot-cover-${i}`);
        if (cover) {
            // 计算遮盖高度，基于当前槽位分数
            const maxScore = 50;
            const currentScore = gemSlots[i];
            const fillPercentage = Math.min(currentScore / maxScore, 1);
            cover.style.height = `${24 * (1 - fillPercentage)}px`;
        }
    }
}

function renderGemGlowDots(container, gemIndex, smallCount, bigCount) {
    for (let i = 0; i < smallCount; i++) {
        const dot = document.createElement('div');
        dot.className = 'gem-glow-dot';
        const angle = i / smallCount * 2 * Math.PI;
        const radius = 16;
        dot.style.width = '4px';
        dot.style.height = '4px';
        dot.style.background = GEM_COLORS[gemIndex];
        dot.style.left = `${14 + Math.sin(angle) * radius}px`;
        dot.style.top = `${14 - Math.cos(angle) * radius}px`;
        dot.style.filter = `blur(1.5px)`;
        dot.style.animationDuration = `3s`;
        container.appendChild(dot);
    }
    bigCount = Math.min(24, bigCount);
    for (let i = 0; i < bigCount; i++) {
        const dot = document.createElement('div');
        dot.className = 'gem-glow-dot';
        const angle = i / bigCount * 2 * Math.PI;
        const radius = 12;
        dot.style.width = '12px';
        dot.style.height = '12px';
        dot.style.background = GEM_COLORS[gemIndex];
        dot.style.left = `${12 + Math.sin(angle) * radius}px`;
        dot.style.top = `${12 - Math.cos(angle) * radius}px`;
        dot.style.filter = `blur(2.5px)`;
        dot.style.opacity = 0.7;
        dot.style.animationDuration = `4s`;
        container.appendChild(dot);
    }
}

function renderCardFrontGems(gemlist, lastReviewed) {
    let html = '<div class="gem-container">';
    gemlist.forEach((gemData, gemPosition) => {
        const gemIndex = gemData.index;
        const isNewGem = gemData.isNew;
        
        const gemClass = isNewGem ? 'gem-with-glow new-gem' : 'gem-with-glow';
        const gemStyle = isNewGem ? 'position:relative;width:32px;height:32px;opacity:0;animation:fadeInGem 0.8s ease-out forwards;' : 'position:relative;width:32px;height:32px;';
        
        html += `<div class="${gemClass}" style="${gemStyle}">
            <img src="${getGemPath(gemIndex)}">
            ${!isNewGem ? `<div class="gem-glow-dots" id="gem-glow-dots-${gemIndex}-${gemPosition}" style="position:absolute;left:0;top:0;width:32px;height:32px;z-index:1;"></div>` : ''}
        </div>`;
    });
    html += '</div>';
    return html;
}

// switch front/back
function toggleCardFace(speakflag) {
    if (currentCardIndex >= reviewCards.length) return;
    
    const card = reviewCards[currentCardIndex];
    
    if (isShowingAnswer) {
        // 渲染宝石和光点
        const card = reviewCards[currentCardIndex];
        if (card && card.gem && Array.isArray(card.gem)) {
            cardContent.innerHTML = renderCardFrontGems(card.gem, card.lastReviewed) + `<div style='width:100%;text-align:center;'>${card.front}</div>`;
            const interval = card.lastReviewed ? Math.max(0, card.nextReviewDate - card.lastReviewed - 1) : 0;
            hours = Math.floor(interval / (1000 * 60 * 60));
            days = Math.floor(interval / (1000 * 60 * 60 * 24));
            card.gem.forEach((gemData, gemPosition) => {
                const gemIndex = gemData.index;
                const isNewGem = gemData.isNew;
                
                if (!isNewGem) {
                    const dotsContainer = document.getElementById(`gem-glow-dots-${gemIndex}-${gemPosition}`);
                    if (dotsContainer) {
                        dotsContainer.innerHTML = '';
                        renderGemGlowDots(dotsContainer, gemIndex, 1 + Math.min(hours, 24), days);
                    }
                }
            });
        } else {
            cardContent.textContent = card.front;
        }
        renderGemSlots();
        cardContent.style.display = 'flex';
        cardContent.style.alignItems = 'center';
        cardContent.style.justifyContent = 'center';
        isShowingAnswer = false;
        if (speakflag){
            speakText(card.front, {
                rate: 0.7,
                pitch: 1.0,
                volume: 0.9,
                lang: 'en-US'
            }).catch(error => {
                console.error('Speech error:', error);
            });
        }
    } else {
        cardContent.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; right: 0; text-align: center; font-size: 0.8em; color: #666; padding: 10px; border-bottom: 1px solid #eee; background-color: rgba(255,255,255,0.9); border-radius: 10px 10px 0 0;">
                ${card.front}
            </div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; text-align: center; padding: 0 20px;">
                ${card.back}
            </div>
        `;
        cardContent.style.display = 'block';
        cardContent.style.alignItems = '';
        cardContent.style.justifyContent = '';
        isShowingAnswer = true;
    }
}

// 键盘事件处理函数
function handleKeyDown(e) {
    // 如果总结窗显示，只处理关闭操作
    const sessionSummary = document.getElementById('session-summary');
    if (sessionSummary && !sessionSummary.classList.contains('hidden')) {
        if (e.key.toLowerCase() === 'w' || e.key === 'Escape') {
            e.preventDefault();
            closeSessionSummary();
        }
        return;
    }

    // 如果在新建卡片，ctrl+1: 正面输入框, ctrl+2: 背面输入框, ctrl+s: 保存, esc: 返回列表
    if (createSection && !createSection.classList.contains('hidden')) {
        if (e.ctrlKey) {
            switch(e.key) {
                case '1':
                    e.preventDefault();
                    cardFrontInput.focus();
                    break;
                case '2':
                    e.preventDefault();
                    cardBackInput.focus();
                    break;
                case 's':
                case 'S':
                    e.preventDefault();
                    saveCard();
                    break;
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            showCardsList();
        }
        return;
    }

    // 如果在同步界面，u: upload, d: download, m: merge, esc: close
    if (settingsSection && !settingsSection.classList.contains('hidden')) {
        switch(e.key.toLowerCase()) {
            case 'u':
                e.preventDefault();
                uploadCardsToServer();
                break;
            case 'd':
                e.preventDefault();
                downloadCardsFromServer();
                break;
            case 'm':
                e.preventDefault();
                mergeCardsWithServer();
                break;
            case 's':
                e.preventDefault();
                speechEnabledSetting.checked = !speechEnabledSetting.checked;
                break;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            showCardsList();
        }
        return;
    }

    // 如果在列表界面，处理快捷操作
    if (cardsListSection && !cardsListSection.classList.contains('hidden')) {
        if (e.shiftKey) {
            switch(e.key.toLowerCase()) {
                case 'j':
                    e.preventDefault();
                    window.scrollBy(0, 1000);
                    break;
                case 'k':
                    e.preventDefault();
                    window.scrollBy(0, -1000);
                    break;
            }
        } else {
            switch(e.key.toLowerCase()) {
                case 'r':
                    e.preventDefault();
                    if (!startReviewButton.disabled) {
                        startReviewButton.click();
                    }
                    break;
                case 'n':
                    e.preventDefault();
                    showCreateSection();
                    break;
                case 'j':
                    e.preventDefault();
                    window.scrollBy(0, 100);
                    break;
                case 'k':
                    e.preventDefault();
                    window.scrollBy(0, -100);
                    break;
                case 's':
                    e.preventDefault();
                    showSettingsSection();
                    break;
            }
        }
        return;
    }
    
    // 如果在复习界面，处理复习操作
    if (reviewSection.classList.contains('hidden')) return;
    
    switch(e.key.toLowerCase()) {
        case 'h':
            e.preventDefault();
            cardContent.classList.add('swiped-left');
            updateCardStatus(false);
            setTimeout(nextCard, 300);
            break;
        case 'k':
            e.preventDefault();
            cardContent.classList.add('swiped-up');
            setTimeout(() => {
                toggleCardFace(true);
                cardContent.classList.remove('swiped-up');
                cardContent.style.transform = '';
                cardContent.style.backgroundColor = '';
                cardContent.style.color = '';
            }, 300);
            break;
        case 'l':
            e.preventDefault();
            cardContent.classList.add('swiped-right');
            updateCardStatus(true);
            setTimeout(nextCard, 300);
            break;
    }
}

let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
let isDragging = false;

// Device orientation for mobile tilt controls
let deviceOrientation = null;
let tiltThreshold = 60; // degrees
let lastTiltTime = 0;
let tiltCooldown = 1000; // ms
let isCalibrating = false;
let calibrationOffset = { beta: 0, gamma: 0 };

// Review session metrics
let sessionStartMs = 0;
let sessionTotalCount = 0;
let sessionUnknownCount = 0;

function handleStart(e) {
    startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    isDragging = true;
    cardContent.classList.add('dragging');
}

function handleMove(e) {
    if (!isDragging) return;
    
    currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    currentY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    const diffX = currentX - startX;
    const diffY = currentY - startY;

    if (Math.abs(diffX) > Math.abs(diffY)) {
        cardContent.style.transform = `translateX(${diffX}px) rotate(${diffX * 0.05}deg)`;

        if (diffX < -50) {
            cardContent.style.backgroundColor = '#e74c3c';
            cardContent.style.color = 'white';
        } else if (diffX > 50) {
            cardContent.style.backgroundColor = '#2ecc71';
            cardContent.style.color = 'white';
        } else {
            cardContent.style.backgroundColor = '';
            cardContent.style.color = '';
        }
    } else {
        if (diffY < -30) {
            cardContent.style.transform = `translateY(${diffY}px)`;
            cardContent.style.backgroundColor = '#3498db';
            cardContent.style.color = 'white';
        } else {
            cardContent.style.transform = '';
            cardContent.style.backgroundColor = '';
            cardContent.style.color = '';
        }
    }
}

function handleEnd() {
    if (!isDragging) return;
    
    isDragging = false;
    cardContent.classList.remove('dragging');
    
    const diffX = currentX - startX;
    const diffY = currentY - startY;

    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < -100) {
            cardContent.classList.add('swiped-left');
            updateCardStatus(false);
            setTimeout(nextCard, 300);
        } else if (diffX > 100) {
            cardContent.classList.add('swiped-right');
            updateCardStatus(true);
            setTimeout(nextCard, 300);
        } else {
            cardContent.style.transform = '';
            cardContent.style.backgroundColor = '';
            cardContent.style.color = '';
        }
    } else {
        if (diffY < -50) {
            cardContent.classList.add('swiped-up');
            setTimeout(() => {
                toggleCardFace(true);
                cardContent.classList.remove('swiped-up');
                cardContent.style.transform = '';
                cardContent.style.backgroundColor = '';
                cardContent.style.color = '';
            }, 300);
        } else {
            cardContent.style.transform = '';
            cardContent.style.backgroundColor = '';
            cardContent.style.color = '';
        }
    }
}

function setupSwipeEvents() {
    // 重置滑动状态变量
    startX = 0;
    startY = 0;
    currentX = 0;
    currentY = 0;
    isDragging = false;
    
    cardContent.addEventListener('touchstart', handleStart, { passive: true });
    cardContent.addEventListener('mousedown', handleStart);

    cardContent.addEventListener('touchmove', handleMove, { passive: true });
    cardContent.addEventListener('mousemove', handleMove);

    cardContent.addEventListener('touchend', handleEnd, { passive: true });
    cardContent.addEventListener('mouseup', handleEnd);
    cardContent.addEventListener('mouseleave', handleEnd);

    // 设置设备方向监听
    setupDeviceOrientation();
    
    // 设置倾斜控制UI事件
    setupTiltControls();

}

// 宝石光点飞行动画
function flyGemGlowToSlot(gemIndex, gemPosition, cb) {
    const gemSlotsDiv = document.getElementById('gem-slots');
    if (!gemSlotsDiv) return;
    const slot = gemSlotsDiv.children[gemIndex];
    if (!slot) return;
    const toRect = slot.getBoundingClientRect();
    
    // 获取已有的光点容器
    const dotsContainer = document.getElementById(`gem-glow-dots-${gemIndex}-${gemPosition}`);
    if (!dotsContainer) {
        cb();
        return;
    }
    // 获取所有已有的光点
    const existingDots = dotsContainer.querySelectorAll('.gem-glow-dot');
    if (existingDots.length === 0) return;
    
    let completedFlights = 0;
    const totalDots = existingDots.length;
    
    // 为每个光点创建飞行动画
    existingDots.forEach((dot, index) => {
        const dotRect = dot.getBoundingClientRect();
        dot.style.animationPlayState = 'paused';

        dot.style.position = 'fixed';
        dot.style.left = `${dotRect.left}px`;
        dot.style.top = `${dotRect.top}px`;
        dot.style.zIndex = 9999;
        dot.style.transition = 'all 0.7s cubic-bezier(.7,-0.2,.7,1.2)';

        document.body.appendChild(dot);

        setTimeout(() => {
            dot.style.left = `${toRect.left + toRect.width/2}px`;
            dot.style.top = `${toRect.top + toRect.height/2}px`;
            
        }, 10 + index * 50); // 每个光点延迟50ms，创造波浪效果

        setTimeout(() => {
            document.body.removeChild(dot);
            completedFlights++;
            
            // 所有光点都飞行完成后回调
            if (completedFlights === totalDots && cb) {
                cb();
            }
        }, 750 + index * 50);
    });
}

function handleGemScoreOnKnown(card) {
    if (!card.gem || !Array.isArray(card.gem)) return;

    const interval = card.lastReviewed ? Math.max(0, card.nextReviewDate - card.lastReviewed - 1) : 0;
    const hours = Math.floor(interval / (1000 * 60 * 60));
    const days = Math.floor(interval / (1000 * 60 * 60 * 24));
    
    let completedGems = 0;
    const totalGems = card.gem.length;
    
    card.gem.forEach((gemData, gemPosition) => {
        const gemIndex = gemData.index;
        const isNewGem = gemData.isNew;

        if (isNewGem) {
            completedGems++;
            if (completedGems === totalGems) {
                renderGemSlots();
                updateGemSlotCovers();
            }
            return;
        }
        
        flyGemGlowToSlot(gemIndex, gemPosition, () => {
            let addScore = Math.min(hours, 24) + 1 + days * 2;
            gemSlots[gemIndex] += addScore;
            gemTotal[gemIndex] += addScore;
            if (gemSlots[gemIndex] >= 50) {
                if (reviewCards[currentCardIndex]) {
                    if (!reviewCards[currentCardIndex].gem) reviewCards[currentCardIndex].gem = [];
                    gemlist = reviewCards[currentCardIndex].gem;
                    gemSlots[gemIndex] -= 50;
                    // 添加新宝石，标记为新增（无光点环绕且不计入得分）
                    gemlist.push({
                        index: gemIndex,
                        isNew: true,
                    });
                    gemlist = [...gemlist].sort((a, b) => {
                        return a.index - b.index;
                    });
                    reviewCards[currentCardIndex].gem = gemlist;
                    isShowingAnswer = true;
                    toggleCardFace(false);
                    saveCards();
                }
            }
            completedGems++;
            if (completedGems === totalGems) {
                renderGemSlots();
                updateGemSlotCovers();
            }
        });
    });
}

function updateCardStatus(known) {
    const card = reviewCards[currentCardIndex];
    // track metrics
    if (!known) sessionUnknownCount += 1;
    sessionTotalCount += 1;
    if(isShowingAnswer){
        toggleCardFace(false);
    }
    
    if (known) {
        handleGemScoreOnKnown(card);
        if (card.gem && Array.isArray(card.gem)) {
            card.gem = card.gem.map(gemData => {
                if (gemData.isNew) {
                    gemData.isNew = false;
                }
                return gemData;
            });
        }
        card.history.push({
            date: Date.now(),
            known: true,
        });
        card.nextReviewDate = Date.now() + 1000 * 60 * 60 * 6 * Math.pow(2, card.fimilarity);
        card.lastReviewed = Date.now() + 1;
        if(card.fimilarity >= 0) {
            card.fimilarity++;
        } else {card.fimilarity = 0;}
    } else {
        card.history.push({
            date: Date.now(),
            known: false,
        });
        if(card.fimilarity >= 1) {
            card.fimilarity = Math.floor(card.fimilarity / 2);
        } else if(card.fimilarity > -3) {
            card.fimilarity--;
        }
        const randomPosition = currentCardIndex + Math.floor(Math.random() * 6) + 5; 
        const insertPosition = Math.min(randomPosition, reviewCards.length);
        reviewCards.splice(insertPosition, 0, card);
    }
    saveCards();
}

function nextCard() {
    currentCardIndex++;
    showCurrentCard();
}

function finishReview() {
    showCardsList();
    
    // 移除滑动事件监听器
    cardContent.removeEventListener('touchstart', handleStart);
    cardContent.removeEventListener('mousedown', handleStart);
    cardContent.removeEventListener('touchmove', handleMove);
    cardContent.removeEventListener('mousemove', handleMove);
    cardContent.removeEventListener('touchend', handleEnd);
    cardContent.removeEventListener('mouseup', handleEnd);
    cardContent.removeEventListener('mouseleave', handleEnd);

    // 移除设备方向监听
    removeDeviceOrientation();

    renderCardsList();

    // show session summary overlay instead of alert
    showSessionSummary();
}

function msToHuman(ms) {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
}

function showSessionSummary() {
    const overlay = document.getElementById('session-summary');
    if (!overlay) return;
    const starsEl = document.getElementById('session-stars');
    const totalTimeEl = document.getElementById('session-total-time');
    const unknownEl = document.getElementById('session-unknown-count');
    const avgEl = document.getElementById('session-avg-time');
    const rewardsEl = document.getElementById('session-rewards');

    const endMs = Date.now();
    const totalMs = Math.max(0, endMs - sessionStartMs);
    const avgMs = totalMs / sessionTotalCount;

    let stars = 1;
    if (avgMs <= 3000) stars = 3; else if (avgMs <= 5000) stars = 2;
    if (sessionUnknownCount <= 5) stars += 2; else if (sessionUnknownCount <= 15) stars += 1;
    const originalIndex = Math.floor(Math.random() * 6);
    const starPath = getGemPath(originalIndex);
    const starHTML = `<img src="${starPath}" alt="gem">`.repeat(stars);

    if (starsEl) starsEl.innerHTML = starHTML;
    if (totalTimeEl) totalTimeEl.textContent = msToHuman(totalMs);
    if (unknownEl) unknownEl.textContent = String(sessionUnknownCount);
    if (avgEl) avgEl.textContent = `${(avgMs/1000).toFixed(2)}s`;

    // rewards based on stars: grant extra gem slot points
    // 3★: +6 each slot, 2★: +3, 1★: +1 distributed to random slot
    let rewardHTML = `<span style='margin-right: auto'>Rewards: </span>`;
    if (stars === 5) {
        
        for (let i = 0; i < 3; i++) {
            amount = 20 + Math.floor(Math.random() * 30);
            gemIndex = (originalIndex + Math.floor(Math.random()*(i + 1) + 0.5 * i * i + 0.5 * i)) % 6;
            gemSlots[gemIndex] += amount;
            rewardHTML += `<span style='color:${GEM_COLORS[gemIndex]}'>${amount}</span>
            <img src="${getGemPath(gemIndex)}" alt = "gem" style='height: 16px; width: 16px; align-self: center;'>`;
        }
    } else if (stars === 4) {
        for (let i = 0; i < 2; i++) {
            amount = 15 + Math.floor(Math.random() * 20);
            gemIndex = (originalIndex + Math.floor(Math.random()*(i + 1)) + i) % 6;
            gemSlots[gemIndex] += amount;
            rewardHTML += `<span style='color:${GEM_COLORS[gemIndex]}'>${amount}</span>
            <img src="${getGemPath(gemIndex)}" alt = "gem" style='height: 16px; width: 16px; align-self: center;'>`;
        }
    } else if (stars === 3) {
        for (let i = 0; i < 3; i++) {
            amount = 5 + Math.floor(Math.random() * 10);
            gemIndex = (originalIndex + Math.floor(Math.random()*(i + 1) + 0.5 * i * i + 0.5 * i)) % 6;
            gemSlots[gemIndex] += amount;
            rewardHTML += `<span style='color:${GEM_COLORS[gemIndex]}'>${amount}</span>
            <img src="${getGemPath(gemIndex)}" alt = "gem" style='height: 16px; width: 16px; align-self: center;'>`;
        }
    } else if (stars === 2) {
        for (let i = 0; i < 2; i++) {
            amount = 2 + Math.floor(Math.random() * 6);
            gemIndex = (originalIndex + Math.floor(Math.random()*(i + 1)) + i) % 6;
            gemSlots[gemIndex] += amount;
            rewardHTML += `<span style='color:${GEM_COLORS[gemIndex]}'>${amount}</span>
            <img src="${getGemPath(gemIndex)}" alt = "gem" style='height: 16px; width: 16px; align-self: center;'>`;
        }
    } else {
        for (let i = 0; i < 1; i++) {
            amount = 1 + Math.floor(Math.random() * 6);
            gemIndex = (originalIndex + Math.floor(Math.random()*(i + 1)) + i) % 6;
            gemSlots[gemIndex] += amount;
            rewardHTML += `<span style='color:${GEM_COLORS[gemIndex]}'>${amount}</span>
            <img src="${getGemPath(gemIndex)}" alt = "gem" style='height: 16px; width: 16px; align-self: center;'>`;
        }
    }
    saveCards();
    renderGemSlots();
    if (rewardsEl) rewardsEl.innerHTML = rewardHTML;

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay.classList.add('show');
    });

    // setTimeout(() => {
    //     overlay.classList.remove('show');
    //     setTimeout(() => {
    //         overlay.classList.add('hidden');
    //     }, 350);
    // }, 5000);
    
    // 添加点击关闭功能
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeSessionSummary();
        }
    });
}

function closeSessionSummary() {
    const overlay = document.getElementById('session-summary');
    if (!overlay) return;
    
    overlay.classList.remove('show');
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 350);
}

function setupDeviceOrientation() {
    // 检查设备是否支持方向传感器
    if (!window.DeviceOrientationEvent) {
        console.log('Device orientation not supported');
        return;
    }
    
    // 请求权限（iOS需要）
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permission => {
                if (permission === 'granted') {
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                }
            })
            .catch(err => {
                console.log('Device orientation permission denied:', err);
            });
    } else {
        // Android和其他设备直接添加监听
        window.addEventListener('deviceorientation', handleDeviceOrientation);
    }
}

function removeDeviceOrientation() {
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
}

function setupTiltControls() {
    const calibrateBtn = document.getElementById('calibrate-tilt');
    const thresholdSlider = document.getElementById('tilt-threshold-slider');
    const thresholdValue = document.getElementById('threshold-value');
    
    if (calibrateBtn) {
        calibrateBtn.addEventListener('click', startCalibration);
    }
    
    if (thresholdSlider) {
        thresholdSlider.value = tiltThreshold;
        thresholdSlider.addEventListener('input', (e) => {
            tiltThreshold = parseInt(e.target.value);
            if (thresholdValue) {
                thresholdValue.textContent = `${tiltThreshold}°`;
            }
        });
    }
    
    // 保存设置到localStorage
    const saveSettings = () => {
        localStorage.setItem('tiltThreshold', tiltThreshold.toString());
        localStorage.setItem('calibrationOffset', JSON.stringify(calibrationOffset));
    };
    
    // 加载设置
    const loadSettings = () => {
        const savedThreshold = localStorage.getItem('tiltThreshold');
        const savedCalibration = localStorage.getItem('calibrationOffset');
        
        if (savedThreshold) {
            tiltThreshold = parseInt(savedThreshold);
            if (thresholdSlider) thresholdSlider.value = tiltThreshold;
            if (thresholdValue) thresholdValue.textContent = `${tiltThreshold}°`;
        }
        
        if (savedCalibration) {
            try {
                calibrationOffset = JSON.parse(savedCalibration);
            } catch (e) {
                console.log('Failed to load calibration offset');
            }
        }
    };
    loadSettings();
    if (thresholdSlider) {
        thresholdSlider.addEventListener('change', saveSettings);
    }
}

function startCalibration() {
    const calibrateBtn = document.getElementById('calibrate-tilt');
    const tiltStatus = document.getElementById('tilt-status');
    
    if (!calibrateBtn || !tiltStatus) return;
    
    isCalibrating = true;
    calibrateBtn.textContent = 'Calibrating...';
    calibrateBtn.classList.add('calibrating');
    tiltStatus.textContent = 'Hold device in neutral position...';
    setTimeout(() => {
        completeCalibration();
    }, 3000);
}

function completeCalibration() {
    const calibrateBtn = document.getElementById('calibrate-tilt');
    const tiltStatus = document.getElementById('tilt-status');
    
    if (!calibrateBtn || !tiltStatus) return;
    
    isCalibrating = false;
    calibrateBtn.textContent = 'Calibrate Tilt';
    calibrateBtn.classList.remove('calibrating');
    tiltStatus.textContent = 'Calibrated!';
    localStorage.setItem('calibrationOffset', JSON.stringify(calibrationOffset));

    setTimeout(() => {
        if (tiltStatus) {
            tiltStatus.textContent = 'Ready';
        }
    }, 2000);
}

function updateCalibrationStatus(beta, gamma) {
    const tiltStatus = document.getElementById('tilt-status');
    if (!tiltStatus) return;
    
    // 在校准过程中，记录当前角度作为偏移量
    if (isCalibrating) {
        calibrationOffset.beta = beta;
        calibrationOffset.gamma = gamma;
        tiltStatus.textContent = `β: ${Math.round(beta)}° γ: ${Math.round(gamma)}°`;
    }
}

function handleDeviceOrientation(event) {
    if (reviewSection.classList.contains('hidden')) return;
    
    const now = Date.now();
    if (now - lastTiltTime < tiltCooldown) return;
    
    let beta = event.beta;
    let gamma = event.gamma;
    
    // 应用校准偏移
    beta -= calibrationOffset.beta;
    gamma -= calibrationOffset.gamma;

    if (isCalibrating) {
        updateCalibrationStatus(beta, gamma);
        return;
    }
    
    // 左右倾斜：向左倾斜表示忘记，向右倾斜表示记得
    if (Math.abs(gamma) > tiltThreshold) {
        lastTiltTime = now;
        
        if (gamma < -tiltThreshold) {
            // 向左倾斜 - 忘记
            cardContent.classList.add('swiped-left');
            updateCardStatus(false);
            setTimeout(nextCard, 300);
        } else if (gamma > tiltThreshold) {
            // 向右倾斜 - 记得
            cardContent.classList.add('swiped-right');
            updateCardStatus(true);
            setTimeout(nextCard, 300);
        }
        return;
    }
    
    // 前后倾斜：向后倾斜表示翻转
    if (beta > tiltThreshold / 2) {
        lastTiltTime = now;
        // 向后倾斜 - 翻转卡片
        cardContent.classList.add('swiped-up');
        setTimeout(() => {
            toggleCardFace(true);
            cardContent.classList.remove('swiped-up');
            cardContent.style.transform = '';
            cardContent.style.backgroundColor = '';
            cardContent.style.color = '';
        }, 300);
    }
}

initApp();