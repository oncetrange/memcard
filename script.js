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

let userStatus, loginButton, registerButton, logoutButton, syncButton;
let loginSection, registerSection, syncSection;
let loginSubmit, loginCancel, registerSubmit, registerCancel;
let uploadCards, downloadCards, mergeCards, syncCancel;

function initAuthElements() {
    userStatus = document.getElementById('user-status');
    loginButton = document.getElementById('login-button');
    registerButton = document.getElementById('register-button');
    logoutButton = document.getElementById('logout-button');
    syncButton = document.getElementById('sync-button');
    loginSection = document.getElementById('login-section');
    registerSection = document.getElementById('register-section');
    syncSection = document.getElementById('sync-section');
    loginSubmit = document.getElementById('login-submit');
    loginCancel = document.getElementById('login-cancel');
    registerSubmit = document.getElementById('register-submit');
    registerCancel = document.getElementById('register-cancel');
    uploadCards = document.getElementById('upload-cards');
    downloadCards = document.getElementById('download-cards');
    mergeCards = document.getElementById('merge-cards');
    syncCancel = document.getElementById('sync-cancel');
}


let cards = JSON.parse(localStorage.getItem('memoryCards')) || [];
let reviewCards = [];
let currentCardIndex = 0;
let isShowingAnswer = false;
let currentUser = null;
let authToken = localStorage.getItem('authToken') || null;
let editingCardId = null;

const API_BASE_URL = 'https://117.72.179.137:3000/api'

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

    hideAllSections();
    document.getElementById('create-section').classList.remove('hidden');
    document.getElementById('cards-list').classList.remove('hidden');
}


function cancelEdit() {
    editingCardId = null;
    document.getElementById('edit-card-front').value = '';
    document.getElementById('edit-card-back').value = '';
    
    hideAllSections();
    document.getElementById('create-section').classList.remove('hidden');
    document.getElementById('cards-list').classList.remove('hidden');
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
            if (syncButton) syncButton.classList.add('hidden');
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
        hideAllSections();
        createSection.classList.remove('hidden');
        cardsListSection.classList.remove('hidden');
        
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
        const response = await fetch(`${API_BASE_URL}/cards`, {
            method: 'POST',
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cards)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed!');
        }
        
        alert('Successfully uploaded!');
        return true;
    } catch (error) {
        alert(error.message);
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
        
        const serverCards = await response.json();
        
        if (confirm('Download will cover local cards, continue?')) {
            cards = serverCards;
            saveCards();
            renderCardsList();
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
        
        const serverCards = await response.json();
        
        const mergedCards = [...cards];
        const localCardIds = new Set(cards.map(card => card.id));
        
        for (const serverCard of serverCards) {
            if (!localCardIds.has(serverCard.id)) {
                mergedCards.push(serverCard);
            }
        }
        
        cards = mergedCards;
        saveCards();
        renderCardsList();
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
    if (!userStatus || !loginButton || !registerButton || !logoutButton || !syncButton) {
        return;
    }
    
    if (currentUser && authToken) {
        userStatus.textContent = `${currentUser}`;
        loginButton.classList.add('hidden');
        registerButton.classList.add('hidden');
        logoutButton.classList.remove('hidden');
        syncButton.classList.remove('hidden');
    } else {
        userStatus.textContent = 'offline';
        loginButton.classList.remove('hidden');
        registerButton.classList.remove('hidden');
        logoutButton.classList.add('hidden');
        syncButton.classList.add('hidden');
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

function showSyncSection() {
    hideAllSections();
    if (syncSection) syncSection.classList.remove('hidden');
}

function hideAllSections() {
    if (createSection) createSection.classList.add('hidden');
    if (cardsListSection) cardsListSection.classList.add('hidden');
    if (reviewSection) reviewSection.classList.add('hidden');
    if (loginSection) loginSection.classList.add('hidden');
    if (registerSection) registerSection.classList.add('hidden');
    if (syncSection) syncSection.classList.add('hidden');
    if (document.getElementById('edit-section')) document.getElementById('edit-section').classList.add('hidden');
}

function initApp() {
    initAuthElements();

    renderCardsList();
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
    
    if (syncButton) {
        syncButton.addEventListener('click', showSyncSection);
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
            hideAllSections();
            createSection.classList.remove('hidden');
            cardsListSection.classList.remove('hidden');
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
            hideAllSections();
            createSection.classList.remove('hidden');
            cardsListSection.classList.remove('hidden');
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
            if (await uploadCardsToServer()) {
                hideAllSections();
                createSection.classList.remove('hidden');
                cardsListSection.classList.remove('hidden');
            }
        });
    }
    
    if (downloadCards) {
        downloadCards.addEventListener('click', async () => {
            if (await downloadCardsFromServer()) {
                hideAllSections();
                createSection.classList.remove('hidden');
                cardsListSection.classList.remove('hidden');
            }
        });
    }
    
    if (mergeCards) {
        mergeCards.addEventListener('click', async () => {
            if (await mergeCardsWithServer()) {
                hideAllSections();
                createSection.classList.remove('hidden');
                cardsListSection.classList.remove('hidden');
            }
        });
    }
    
    if (syncCancel) {
        syncCancel.addEventListener('click', () => {
            hideAllSections();
            createSection.classList.remove('hidden');
            cardsListSection.classList.remove('hidden');
        });
    }
    
    // 编辑相关按钮事件监听器
    const saveEditButton = document.getElementById('save-edit');
    const cancelEditButton = document.getElementById('cancel-edit');
    
    if (saveEditButton) {
        saveEditButton.addEventListener('click', saveEdit);
    }
    
    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', cancelEdit);
    }
}

saveCardButton.addEventListener('click', () => {
    const front = cardFrontInput.value.trim();
    const back = cardBackInput.value.trim();
    
    if (front && back) {
        const newCard = {
            id: Date.now(),
            front,
            back,
            lastReviewed: null,
            history: [],
            fimilarity: 0,
            nextReviewDate: Date.now(),
        };
        
        cards.push(newCard);
        saveCards();
        renderCardsList();
        updateReviewButtonState();

        cardFrontInput.value = '';
        cardBackInput.value = '';
        cardFrontInput.focus();
    } else {
        alert('please enter the front and back content');
    }
});

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
        cardElement.innerHTML = `
            <div class="card-item-content">
                <div class="card-item-front">${card.front}</div>
                <div class="card-item-back">${card.back}</div>
                <div class="card-item-stats">
                    ${lastReviewedText} | ${nextReviewText}
                </div>
            </div>
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
    
    const card = reviewCards[currentCardIndex];
    cardContent.textContent = card.front;
    cardContent.style.display = 'flex';
    cardContent.style.alignItems = 'center';
    cardContent.style.justifyContent = 'center';
    cardContent.classList.remove('swiped-left', 'swiped-right', 'swiped-up', 'dragging');
    cardContent.style.transform = '';
    cardContent.style.backgroundColor = '';
    cardContent.style.color = '';
    
    isShowingAnswer = false;
}

// switch front/back
function toggleCardFace() {
    if (currentCardIndex >= reviewCards.length) return;
    
    const card = reviewCards[currentCardIndex];
    
    if (isShowingAnswer) {
        cardContent.textContent = card.front;
        cardContent.style.display = 'flex';
        cardContent.style.alignItems = 'center';
        cardContent.style.justifyContent = 'center';
        isShowingAnswer = false;
    } else {
        // 显示背面时，在顶端中间显示正面内容
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
                toggleCardFace();
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

// 滑动事件处理函数
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
let isDragging = false;

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
                toggleCardFace();
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
    
    // 添加键盘事件监听器
    document.addEventListener('keydown', handleKeyDown);
}

function updateCardStatus(known) {
    const card = reviewCards[currentCardIndex];
    card.lastReviewed = Date.now();
    
    if (known) {
        card.history.push({
            date: Date.now(),
            known: true,
        });
        card.nextReviewDate = Date.now() + 1000 * 60 * 60 * 6 * Math.pow(2, card.fimilarity);
        if(card.fimilarity >= 0) {
            card.fimilarity++;
        } else {card.fimilarity = 0;}
    } else {
        card.history.push({
            date: Date.now(),
            known: false,
        });
        if(card.fimilarity > 0) {
            card.fimilarity /= 2;
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
    createSection.classList.remove('hidden');
    cardsListSection.classList.remove('hidden');
    reviewSection.classList.add('hidden');

    // 移除键盘事件监听器
    document.removeEventListener('keydown', handleKeyDown);
    
    // 移除滑动事件监听器
    cardContent.removeEventListener('touchstart', handleStart);
    cardContent.removeEventListener('mousedown', handleStart);
    cardContent.removeEventListener('touchmove', handleMove);
    cardContent.removeEventListener('mousemove', handleMove);
    cardContent.removeEventListener('touchend', handleEnd);
    cardContent.removeEventListener('mouseup', handleEnd);
    cardContent.removeEventListener('mouseleave', handleEnd);

    renderCardsList();

    alert('✅');
}

initApp();