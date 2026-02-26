import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Game } from './chess/Game.js';
import { Board } from './chess/Board.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

// ── State ── per-session game storage
const games = new Map();      // token → Game
const sseClients = new Map(); // token → Set<res>
const modelCache = new Map(); // key: `${apiUrl}|${apiKey}` → { models, fetchedAt }
const rateLimitMap = new Map(); // token → timestamp of last Default API game start
const IDLE_CLEANUP_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MS = 20 * 60 * 1000;   // 20 minutes between Default API games
const BYPASS_PASSWORD = process.env.BYPASS_PASSWORD || '';

/** Get or create a token from the request query/header */
function getToken(req) {
  return req.query.token || req.headers['x-session-token'] || null;
}

/** Send an SSE event to all clients for a specific token */
function broadcastToToken(token, event, data) {
  const clients = sseClients.get(token);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

// ── Token endpoint ──
app.post('/api/token', (req, res) => {
  const token = crypto.randomUUID();
  res.json({ token });
});

// Periodic cleanup of finished/idle games
setInterval(() => {
  const now = Date.now();
  for (const [token, game] of games) {
    if (game.result && game._finishedAt && now - game._finishedAt > IDLE_CLEANUP_MS) {
      games.delete(token);
      sseClients.delete(token);
    }
  }
}, 5 * 60 * 1000); // check every 5 minutes

// ── SSE endpoint ──
app.get('/api/game/stream', (req, res) => {
  const token = getToken(req);
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately if a game exists for this token
  const game = games.get(token);
  if (game) {
    res.write(`event: state\ndata: ${JSON.stringify(game.getState())}\n\n`);
  }

  if (!sseClients.has(token)) {
    sseClients.set(token, new Set());
  }
  sseClients.get(token).add(res);

  req.on('close', () => {
    const clients = sseClients.get(token);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(token);
    }
  });
});

// ── Start a new game ──
app.post('/api/game/start', (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const existingGame = games.get(token);
  if (existingGame && !existingGame.result) {
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
    humanSide: req.body.humanSide || null, // 'WHITE', 'BLACK', or null
  };

  // Determine if either side uses the Default API (no custom API url/key sent)
  const whiteUsesPurinNyova = !req.body.whiteApiUrl && !req.body.whiteApiKey && config.humanSide !== 'WHITE';
  const blackUsesPurinNyova = !req.body.blackApiUrl && !req.body.blackApiKey && config.humanSide !== 'BLACK';
  const usesPurinNyovaApi = whiteUsesPurinNyova || blackUsesPurinNyova;

  // Bypass password check
  const bypassPassword = req.body.password || '';
  const bypassEnabled = BYPASS_PASSWORD && bypassPassword === BYPASS_PASSWORD;

  // Rate limiting for Default API (per token, 20 min cooldown)
  if (usesPurinNyovaApi && !bypassEnabled) {
    const lastGameTime = rateLimitMap.get(token);
    if (lastGameTime) {
      const elapsed = Date.now() - lastGameTime;
      if (elapsed < RATE_LIMIT_MS) {
        const remainingMs = RATE_LIMIT_MS - elapsed;
        const remainingMin = Math.ceil(remainingMs / 60000);
        return res.status(429).json({
          error: `Rate limited: you can start a new game using the Default API in ${remainingMin} minute${remainingMin !== 1 ? 's' : ''}. Use a bypass password or switch to Custom API.`,
          remainingMs,
          bypass: false,
        });
      }
    }
  }

  // Only require API keys for non-human sides
  if (!config.humanSide) {
    if (!config.whiteApiKey || !config.blackApiKey) {
      return res.status(400).json({ error: 'API keys are required. Set them in .env or send in request body.' });
    }
  } else if (config.humanSide === 'WHITE') {
    if (!config.blackApiKey) {
      return res.status(400).json({ error: 'API key for Black (LLM) is required.' });
    }
  } else if (config.humanSide === 'BLACK') {
    if (!config.whiteApiKey) {
      return res.status(400).json({ error: 'API key for White (LLM) is required.' });
    }
  }

  // Record rate limit timestamp if using Default API (and not bypassed)
  if (usesPurinNyovaApi && !bypassEnabled) {
    rateLimitMap.set(token, Date.now());
  }

  const game = new Game(config, (event, data) => {
    broadcastToToken(token, event, data);
  });
  games.set(token, game);

  res.json({ message: 'Game started', state: game.getState(), bypass: bypassEnabled });

  // Run the game loop asynchronously (don't await in the request handler)
  game.play().catch(err => {
    broadcastToToken(token, 'error', { message: `Game error: ${err.message}` });
  });
});

// ── Get current state ──
app.get('/api/game/state', (req, res) => {
  const token = getToken(req);
  const game = token ? games.get(token) : null;
  if (!game) {
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
  res.json(game.getState());
});

// ── Human move ──
app.post('/api/game/move', (req, res) => {
  const token = getToken(req);
  const game = token ? games.get(token) : null;
  if (!game || game.result) {
    return res.status(400).json({ error: 'No active game' });
  }
  const { move } = req.body;
  if (!move) {
    return res.status(400).json({ error: 'Move is required' });
  }
  const result = game.applyHumanMove(move);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// ── Get legal moves for a square ──
app.get('/api/game/legal-moves', (req, res) => {
  const token = getToken(req);
  const game = token ? games.get(token) : null;
  if (!game || game.result) {
    return res.json({ moves: [] });
  }
  const file = parseInt(req.query.file);
  const rank = parseInt(req.query.rank);
  if (isNaN(file) || isNaN(rank)) {
    return res.status(400).json({ error: 'file and rank are required' });
  }
  const moves = game.board.getLegalMoves(file, rank);
  res.json({ moves });
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

// ── Fetch models using server .env credentials (Default API preset) ──
app.post('/api/models/default', async (req, res) => {
  const apiUrl = process.env.WHITE_API_URL || process.env.BLACK_API_URL || '';
  const apiKey = process.env.WHITE_API_KEY || process.env.BLACK_API_KEY || '';
  if (!apiUrl || !apiKey) {
    return res.status(400).json({ error: 'Server .env API credentials are not configured' });
  }

  // Derive models endpoint
  let modelsUrl;
  try {
    const url = new URL(apiUrl);
    const pathParts = url.pathname.replace(/\/+$/, '').split('/');
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
    return res.status(400).json({ error: 'Invalid server API URL' });
  }

  const cacheKey = `default|${modelsUrl}|${apiKey}`;
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
  const token = getToken(req);
  const game = token ? games.get(token) : null;
  if (!game || game.result) {
    return res.status(400).json({ error: 'No active game to stop' });
  }
  game.stop();
  broadcastToToken(token, 'gameOver', { result: game.result, pgn: '' });
  res.json({ message: 'Game stopped' });
});

// ── Reset game ──
app.post('/api/game/reset', (req, res) => {
  const token = getToken(req);
  if (token) {
    const game = games.get(token);
    if (game && !game.result) game.stop();
    games.delete(token);
  }
  const board = new Board();
  broadcastToToken(token, 'status', { message: 'Game reset' });
  broadcastToToken(token, 'board', { squares: board.toJSON(), turn: 'WHITE' });
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
