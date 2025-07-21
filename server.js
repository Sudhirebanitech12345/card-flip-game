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
    const url = `https://card-flip-game-5z6b.onrender.com/mobile?session=${gameState.sessionId}`;
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
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 20px;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    color: white;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                h1 { 
                    color: white; 
                    margin-bottom: 20px;
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                }
                .qr-container { 
                    margin: 20px auto; 
                    max-width: 300px;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 20px;
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                .instructions { 
                    margin: 20px 0; 
                    max-width: 500px;
                    line-height: 1.6;
                }
                .connection-status { 
                    margin-top: 20px; 
                    font-weight: bold;
                    padding: 10px;
                    border-radius: 5px;
                    background: rgba(255, 255, 255, 0.1);
                }
                .connected { 
                    color: #2ed573;
                    background: rgba(46, 213, 115, 0.2);
                }
                .btn {
                    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 25px;
                    font-size: 1.1em;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
                    margin-top: 20px;
                    text-decoration: none;
                    display: inline-block;
                }
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 7px 20px rgba(0, 0, 0, 0.3);
                }
                .qr-code-img {
                    width: 200px;
                    height: 200px;
                    margin: 0 auto;
                    display: block;
                }
            </style>
        </head>
        <body>
            <h1>Fashion Memory Game</h1>
            <div class="instructions">
                Find and flip cards in sequence from 1 to 12 to reveal fashion items and special offers!<br>
                +10 points for each correct card!<br>
                Wrong selection hides all cards!
            </div>
            
            <div class="qr-container">
                <h3>Connect Mobile Controller</h3>
                <img class="qr-code-img" src="${qrCode}" alt="QR Code">
                <div class="connection-status" id="connectionStatus">Scan QR code to connect mobile</div>
                <a href="/game" class="btn">Play on Desktop</a>
            </div>
            
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                socket.on('mobile-connected', () => {
                    document.getElementById('connectionStatus').textContent = 'Mobile connected!';
                    document.getElementById('connectionStatus').className = 'connection-status connected';
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
        startTime: gameState.startTime,
        sessionId: gameState.sessionId
    });
    
    // Handle mobile connection
    socket.on('mobile-connect', ({sessionId}) => {
        if (sessionId === gameState.sessionId) {
            io.emit('mobile-connected');
        }
    });
    
    // Handle card flip from mobile or desktop
    socket.on('flip-card', ({index, currentSequence, sessionId}) => {
        if (sessionId !== gameState.sessionId || currentSequence !== gameState.currentSequence) return;
        
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
            startTime: gameState.startTime,
            sessionId: gameState.sessionId
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
            startTime: gameState.startTime,
            sessionId: gameState.sessionId
        });
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        gameState.connectedClients--;
    });
});

// Initialize first game
initializeGame();

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});