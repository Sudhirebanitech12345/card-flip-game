const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let gameState = {
    cards: [],
    currentSequence: 1,
    flippedCards: [],
    gameWon: false,
    score: 0,
    startTime: null,
    sessionId: null,
    connectedClients: 0
};

// Fashion items and their offers
const fashionItems = [
    { emoji: '👕', offer: "T-Shirt: 30% OFF" },
    { emoji: '🧢', offer: "Cap: Buy 1 Get 1 Free" },
    { emoji: '👖', offer: "Jeans: Limited Edition" },
    { emoji: '👟', offer: "Sneakers: Flash Sale" },
    { emoji: '🕶️', offer: "Sunglasses: 50% OFF" },
    { emoji: '👔', offer: "Shirt: Premium Collection" },
    { emoji: '🧥', offer: "Jacket: Winter Special" },
    { emoji: '👗', offer: "Dress: New Arrival" },
    { emoji: '🩳', offer: "Shorts: Summer Deal" },
    { emoji: '👠', offer: "Heels: Luxury Line" },
    { emoji: '🎒', offer: "Backpack: Student Discount" },
    { emoji: '🧦', offer: "Socks: 3 for 2" }
];

// Initialize game
function initializeGame() {
    gameState.cards = Array.from({length: 12}, (_, i) => ({
        number: i + 1,
        item: fashionItems[i].emoji,
        offer: fashionItems[i].offer
    }));
    
    // Shuffle cards
    for (let i = gameState.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.cards[i], gameState.cards[j]] = [gameState.cards[j], gameState.cards[i]];
    }
    
    gameState.currentSequence = 1;
    gameState.flippedCards = [];
    gameState.gameWon = false;
    gameState.score = 0;
    gameState.startTime = Date.now();
    gameState.sessionId = uuidv4();
}

// Generate QR Code
async function generateQRCode() {
    const url = `https://https://card-flip-game-5z6b.onrender.com/mobile?session=${gameState.sessionId}`;
    return await qrcode.toDataURL(url);
}

// Routes
app.get('/', async (req, res) => {
    initializeGame();
    const qrCode = await generateQRCode();
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fashion Memory Game</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                h1 { color: #333; }
                .qr-container { margin: 20px auto; max-width: 300px; }
                .instructions { margin: 20px 0; }
                .connection-status { margin-top: 20px; font-weight: bold; }
                .connected { color: green; }
            </style>
        </head>
        <body>
            <h1>Fashion Memory Game</h1>
            <div class="instructions">
                Scan this QR code with your mobile device to connect:
            </div>
            <div class="qr-container">
                <img src="${qrCode}" alt="QR Code">
            </div>
            <div class="instructions">
                Or <a href="/game">click here</a> to play on desktop.
            </div>
            <div class="connection-status" id="connectionStatus">Waiting for mobile connection...</div>
            
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                socket.on('mobile-connected', () => {
                    document.getElementById('connectionStatus').textContent = 'Mobile connected!';
                    document.getElementById('connectionStatus').className = 'connection-status connected';
                    window.location.href = '/game';
                });
            </script>
        </body>
        </html>
    `);
});

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/mobile', (req, res) => {
    if (req.query.session === gameState.sessionId) {
        res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
    } else {
        res.status(403).send('Invalid session. Please scan the QR code again from the main game.');
    }
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected');
    gameState.connectedClients++;
    
    // Send initial game state
    socket.emit('game-state', {
        currentSequence: gameState.currentSequence,
        flippedCards: gameState.flippedCards,
        gameWon: gameState.gameWon,
        score: gameState.score,
        startTime: gameState.startTime
    });
    
    // Handle mobile connection
    socket.on('mobile-connect', () => {
        io.emit('mobile-connected');
    });
    
    // Handle card flip from mobile or desktop
    socket.on('flip-card', ({index, currentSequence}) => {
        if (currentSequence !== gameState.currentSequence) return;
        
        const cardNumber = gameState.cards[index].number;
        
        if (cardNumber === gameState.currentSequence) {
            gameState.flippedCards.push(index);
            gameState.currentSequence++;
            gameState.score += 10;
            
            if (gameState.currentSequence > 12) {
                gameState.gameWon = true;
            }
        } else {
            // Wrong card - reset all
            gameState.currentSequence = 1;
            gameState.flippedCards = [];
        }
        
        // Broadcast updated state to all clients
        io.emit('game-state', {
            currentSequence: gameState.currentSequence,
            flippedCards: gameState.flippedCards,
            gameWon: gameState.gameWon,
            score: gameState.score,
            startTime: gameState.startTime
        });
    });
    
    // Handle new game request
    socket.on('new-game', () => {
        initializeGame();
        io.emit('game-state', {
            currentSequence: gameState.currentSequence,
            flippedCards: gameState.flippedCards,
            gameWon: gameState.gameWon,
            score: gameState.score,
            startTime: gameState.startTime
        });
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        gameState.connectedClients--;
    });
});

// Initialize first game
initializeGame();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});