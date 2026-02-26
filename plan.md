# LLM Chess Arena — Feature Plan

## Overview

Upgrade the LLM Chess Arena from a pure LLM-vs-LLM spectator app into a richer, interactive chess platform with human play, real-time evaluation, time controls, model discovery, and entertaining LLM dialogue.

---

## 1. Real-Time Chess Evaluation Bar

### Goal
Show a live evaluation bar (like chess.com / Lichess) that updates after every move.

### Changes

**Backend — `server/index.js`**
- Install and integrate **Stockfish WASM** (`stockfish.wasm` npm package) or spawn a local Stockfish binary.
- New endpoint: **`GET /api/eval?fen=...`** (or compute inline after each move).
- After each move in `Game.js`, compute a Stockfish evaluation (depth ~18) on the resulting FEN.
- Broadcast an **`eval`** SSE event: `{ cp: number, mate: number | null, bestMove: string, depth: number }`.

**Frontend — new component `EvalBar.jsx`**
- Vertical bar beside the board (or horizontal above/below).
- White-side fill proportional to the centipawn evaluation (clamped to ±10 pawns for display).
- Show numeric eval (e.g., `+1.3` or `M5`).

**Frontend — `useGameStream.js`**
- Listen for the `eval` SSE event; store `{ cp, mate, bestMove, depth }` in state.

**Frontend — `App.jsx`**
- Render `<EvalBar>` next to `<Chessboard>`.

---

## 2. LLM JSON Response: `dialogue` + `move`

### Goal
Instruct the LLM to reply in JSON with two keys — `"move"` (algebraic notation) and `"dialogue"` (entertaining trash talk / commentary). This adds personality and entertainment value.

### Changes

**Backend — `Game.js`**
- Update `SYSTEM_PROMPT_TEMPLATE` to request JSON with `"move"` and `"dialogue"` keys.
- Update `_cleanMoveResponse(rawResponse)` → new method `_parseResponse(rawResponse)`:
  - Try `JSON.parse(rawResponse)` first.
  - Extract `{ move, dialogue }`.
  - If JSON parsing fails, fall back to regex-based extraction.
  - Return `{ move: string, dialogue: string | null }`.
- In `_playTurn()`, use `_parseResponse()` and include `dialogue` in SSE events.

---

## 3. Update Move Capture & Chat Display for Dialogue

### Goal
Modify how moves and chat are displayed to showcase the LLM's dialogue alongside the move.

### Changes

**Frontend — `ChatLog.jsx`**
- Display the **dialogue** prominently in a speech-bubble style.
- Show the move notation in a smaller badge/tag below the dialogue.
- Style white's dialogue with a left-aligned light bubble, black's with a right-aligned dark bubble.

---

## 4. Multi-Game Session Support

### Goal
Allow multiple users to play simultaneously, each with their own independent game. Users are identified by a token generated on first visit (no sign-up required).

### Changes

**Backend — `server/index.js`**
- Replace the single global `currentGame` with a `Map<token, Game>` to hold one game per user.
- Generate a UUID token on first visit; return it in a response header or JSON.
- All game endpoints (`/api/game/start`, `/api/game/stop`, `/api/game/reset`, `/api/game/move`, `/api/game/legal-moves`, `/api/game/state`, `/api/game/stream`) must accept a `token` (via query param or header) and look up the corresponding game.
- SSE streams become per-token: each client subscribes with their token, and only receives events for their own game.
- Add cleanup logic: remove games that have been idle for a long time (e.g., 1 hour after game over).

**Frontend — `useGameStream.js`**
- On first load, check `localStorage` for an existing token. If none, generate client-side (UUID v4).
- Pass the token to all API calls (query param `?token=...`) and to the SSE endpoint.
- If a game is already running for this token on reconnect, restore its state automatically.

**Frontend — no UI changes needed**
- The user experience is transparent: visiting the page "just works". Token management is invisible.

---

## 5. PurinNyova API Preset

### Goal
Add a quick-select dropdown in the game start modal to choose between "PurinNyova API" (uses server `.env` credentials) and "Custom" (user enters their own URL/key/model).

### Changes

**Frontend — `GameControls.jsx` (Settings Modal)**
- Add an **API Provider** dropdown at the top of each player's config section:
  - **PurinNyova API** — hides the API URL and API Key fields; only shows the Model dropdown (fetched using the server's `.env` credentials).
  - **Custom** — shows API URL, API Key, and Model fields as currently.
- When "PurinNyova API" is selected, the start-game request sends empty `apiUrl` and `apiKey` so the server falls back to `.env` values.

**Backend — `server/index.js`**
- New endpoint: **`POST /api/models/default`** — fetches models using the server's `.env` API URL and Key, so the frontend can populate the model dropdown for the PurinNyova API preset without exposing credentials.

---

## 6. Error Fetch-Failed Time Refund

### Goal
When an LLM API call fails with a "fetch failed" error, refund 2 minutes of time to the affected player's clock, preventing unfair time loss due to network/API issues.

### Changes

**Backend — `Game.js`**
- In `_playTurn()`, when a fetch/network error occurs during the LLM call, add 120,000 ms (2 minutes) to the current player's clock.
- Emit a `clock` event after the refund so the UI updates immediately.
- Emit a `status` event noting the time refund (e.g., "2 minutes refunded to White due to API error").
- Apply in all modes: LLM-vs-LLM, Human-vs-LLM (when the LLM side errors).

---

## Implementation Order (Recommended)

| Phase | Feature | Complexity | Dependencies |
|-------|---------|-----------|-------------|
| 1 | **Multi-Game Sessions** (§4) | Medium-High | Server architecture |
| 2 | **PurinNyova API Preset** (§5) | Low | §4 (tokens) |
| 3 | **Error Time Refund** (§6) | Low | None |
| 4 | **JSON dialogue + move** (§2) + **Chat display** (§3) | Medium | None |
| 5 | **Real-Time Evaluation** (§1) | High | Stockfish integration |
