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

let cards = JSON.parse(localStorage.getItem('memoryCards')) || [];
let reviewCards = [];
let currentCardIndex = 0;
let isShowingAnswer = false;



function initApp() {
    renderCardsList();
    updateReviewButtonState();
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

    if (reviewCards.length < 3) {
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
        isShowingAnswer = false;
    } else {
        cardContent.textContent = card.back;
        isShowingAnswer = true;
    }
}

function setupSwipeEvents() {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;

    cardContent.addEventListener('touchstart', handleStart, { passive: true });
    cardContent.addEventListener('mousedown', handleStart);

    cardContent.addEventListener('touchmove', handleMove, { passive: true });
    cardContent.addEventListener('mousemove', handleMove);

    cardContent.addEventListener('touchend', handleEnd, { passive: true });
    cardContent.addEventListener('mouseup', handleEnd);
    cardContent.addEventListener('mouseleave', handleEnd);
    
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

    renderCardsList();

    alert('✅');
}

initApp();