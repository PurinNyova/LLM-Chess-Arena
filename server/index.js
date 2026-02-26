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
const modelCache = new Map(); // key: `${apiUrl}|${apiKey}` → { models, fetchedAt }

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
    baseTime: req.body.baseTime != null ? parseFloat(req.body.baseTime) : null, // minutes or null for unlimited
    increment: req.body.increment != null ? parseFloat(req.body.increment) : 0, // seconds
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

// ── Fetch available models ──
app.post('/api/models', async (req, res) => {
  const { apiUrl, apiKey } = req.body;
  if (!apiUrl || !apiKey) {
    return res.status(400).json({ error: 'apiUrl and apiKey are required' });
  }

  // Derive models endpoint from chat completions URL
  let modelsUrl;
  try {
    const url = new URL(apiUrl);
    // Strip /chat/completions or similar suffix, append /models
    const pathParts = url.pathname.replace(/\/+$/, '').split('/');
    // Remove trailing path segments like /chat/completions
    while (pathParts.length > 0) {
      const last = pathParts[pathParts.length - 1];
      if (['chat', 'completions'].includes(last)) {
        pathParts.pop();
      } else {
        break;
      }
    }
    pathParts.push('models');
    url.pathname = pathParts.join('/');
    modelsUrl = url.toString();
  } catch {
    return res.status(400).json({ error: 'Invalid API URL' });
  }

  // Check cache (5 minute TTL)
  const cacheKey = `${modelsUrl}|${apiKey}`;
  const cached = modelCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
    return res.json({ models: cached.models });
  }

  try {
    const response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Models API returned ${response.status}: ${errText}` });
    }
    const data = await response.json();
    const models = (data.data || []).map(m => ({ id: m.id, name: m.id })).sort((a, b) => a.id.localeCompare(b.id));

    modelCache.set(cacheKey, { models, fetchedAt: Date.now() });
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch models: ${err.message}` });
  }
});

// ── Stop game ──
app.post('/api/game/stop', (req, res) => {
  if (!currentGame || currentGame.result) {
    return res.status(400).json({ error: 'No active game to stop' });
  }
  currentGame.stop();
  broadcast('gameOver', { result: currentGame.result, pgn: '' });
  res.json({ message: 'Game stopped' });
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
