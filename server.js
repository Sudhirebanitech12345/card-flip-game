const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

// Serve static files (index.html, mobile.html, etc.) from public folder
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session storage
const sessions = {};

// Utility to remove circular references before sending game state
function getCleanGameState(game) {
    return {
        sessionId: game.sessionId,
        currentSequence: game.currentSequence,
        flippedCards: game.flippedCards,
        gameWon: game.gameWon,
        score: game.score,
        startTime: game.startTime
    };
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Host creates a new game
    socket.on('new-game', () => {
        const sessionId = uuidv4();

        sessions[sessionId] = {
            sessionId,
            currentSequence: 1,
            flippedCards: [],
            gameWon: false,
            score: 0,
            startTime: Date.now(),
            hostSocket: socket,
            mobileSocket: null
        };

        socket.sessionId = sessionId;

        // Send clean state back to host
        socket.emit('game-state', getCleanGameState(sessions[sessionId]));
    });

    // Mobile joins with a session
    socket.on('mobile-connect', ({ sessionId }) => {
        const game = sessions[sessionId];
        if (!game) return;

        game.mobileSocket = socket;
        socket.sessionId = sessionId;

        // Notify both parties
        game.hostSocket?.emit('mobile-connected');
        socket.emit('mobile-connected');

        // Send game state to mobile
        socket.emit('game-state', getCleanGameState(game));
    });

    // Flip card from host or mobile
    socket.on('flip-card', ({ index, currentSequence, sessionId }) => {
        const game = sessions[sessionId];
        if (!game) return;

        if (index === game.currentSequence - 1) {
            game.flippedCards.push(index);
            game.currentSequence++;
            game.score += 10;

            if (game.currentSequence > 12) {
                game.gameWon = true;
            }
        } else {
            game.flippedCards = [];
            game.currentSequence = 1;
        }

        // Broadcast updated state to both devices
        const cleanState = getCleanGameState(game);
        game.hostSocket?.emit('game-state', cleanState);
        game.mobileSocket?.emit('game-state', cleanState);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        const sessionId = socket.sessionId;
        if (!sessionId || !sessions[sessionId]) return;

        const game = sessions[sessionId];

        if (game.hostSocket === socket) game.hostSocket = null;
        if (game.mobileSocket === socket) game.mobileSocket = null;

        // Clean up session if both disconnected
        if (!game.hostSocket && !game.mobileSocket) {
            delete sessions[sessionId];
            console.log(`Session ${sessionId} removed`);
        }
    });
});

// Handle mobile.html route separately
app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
