import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Game } from './chess/Game.js';
import { Board } from './chess/Board.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

// ── State ──
let currentGame = null;
let sseClients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(payload));
}

// ── SSE endpoint ──
app.get('/api/game/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  if (currentGame) {
    res.write(`event: state\ndata: ${JSON.stringify(currentGame.getState())}\n\n`);
  }

  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// ── Start a new game ──
app.post('/api/game/start', (req, res) => {
  if (currentGame && !currentGame.result) {
    return res.status(409).json({ error: 'A game is already in progress' });
  }

  const config = {
    whiteApiUrl: req.body.whiteApiUrl || process.env.WHITE_API_URL || 'https://api.openai.com/v1/chat/completions',
    whiteApiKey: req.body.whiteApiKey || process.env.WHITE_API_KEY || '',
    whiteModel: req.body.whiteModel || process.env.WHITE_MODEL || 'gpt-4',
    blackApiUrl: req.body.blackApiUrl || process.env.BLACK_API_URL || 'https://api.openai.com/v1/chat/completions',
    blackApiKey: req.body.blackApiKey || process.env.BLACK_API_KEY || '',
    blackModel: req.body.blackModel || process.env.BLACK_MODEL || 'gpt-4',
    maxRetries: parseInt(req.body.maxRetries || process.env.MAX_RETRIES || '3', 10),
  };

  if (!config.whiteApiKey || !config.blackApiKey) {
    return res.status(400).json({ error: 'API keys are required. Set them in .env or send in request body.' });
  }

  currentGame = new Game(config, (event, data) => {
    broadcast(event, data);
  });

  res.json({ message: 'Game started', state: currentGame.getState() });

  // Run the game loop asynchronously (don't await in the request handler)
  currentGame.play().catch(err => {
    broadcast('error', { message: `Game error: ${err.message}` });
  });
});

// ── Get current state ──
app.get('/api/game/state', (req, res) => {
  if (!currentGame) {
    // Return initial empty board state
    const board = new Board();
    return res.json({
      board: board.toJSON(),
      turn: 'WHITE',
      pgn: '',
      moveCount: 0,
      result: null,
      whiteModel: null,
      blackModel: null,
    });
  }
  res.json(currentGame.getState());
});

// ── Reset game ──
app.post('/api/game/reset', (req, res) => {
  currentGame = null;
  broadcast('status', { message: 'Game reset' });
  const board = new Board();
  broadcast('board', { squares: board.toJSON(), turn: 'WHITE' });
  res.json({ message: 'Game reset' });
});

// ── Serve static in production ──
const distPath = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Chess server running on http://localhost:${PORT}`);
});
