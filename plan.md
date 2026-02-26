# LLM Chess Arena — Feature Plan

## Overview

Upgrade the LLM Chess Arena from a pure LLM-vs-LLM spectator app into a richer, interactive chess platform with human play, real-time evaluation, time controls, model discovery, and entertaining LLM dialogue.

---

## 1. Human-Playable Side (White or Black)

### Goal
Allow the user to choose one side (white **or** black) to play manually, while the other side remains an LLM.

### Changes

**Frontend — `GameControls.jsx` (Settings Modal)**
- Add a **"Player Mode"** selector in the game-start modal with three options:
  - `LLM vs LLM` (current default)
  - `Human (White) vs LLM (Black)`
  - `LLM (White) vs Human (Black)`
- When a human side is selected, hide the API URL / Key / Model fields for that side.
- Pass `humanSide: 'WHITE' | 'BLACK' | null` in the start-game request body.

**Frontend — `Chessboard.jsx`**
- Make the board interactive when it is the human player's turn:
  - Click-to-select a piece, then click a destination square to move.
  - Highlight legal destination squares for the selected piece.
  - Validate that only the human side can interact when it's their turn; lock the board otherwise.
- If the human plays black, render the board flipped (rank 1 at top).

**Frontend — `useGameStream.js`**
- Add a `submitMove(notation)` function that `POST`s to `/api/game/move`.
- Track `humanSide` in state; expose it to components.

**Backend — `server/index.js`**
- New endpoint: **`POST /api/game/move`** `{ move: "e4" }`
  - Validates a game is running and it's the human player's turn.
  - Delegates to `Game.applyHumanMove(moveStr)`.
  - Returns `{ ok: true, notation }` or `{ error }`.

**Backend — `Game.js`**
- Add `humanSide` field (from config).
- In `play()`, when `currentTurn === humanSide`, **pause the loop** and wait for a human move (use a `Promise` / resolver pattern instead of calling the LLM).
- Add `applyHumanMove(moveStr)` method that resolves the pending promise, applies the move, and resumes the game loop.
- If the human side is set, skip LLM client creation for that side.

---

## 2. Real-Time Chess Evaluation Bar

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

## 3. Captured Pieces Display

### Goal
Show which pieces each side has taken, styled like chess.com (small piece icons above/below the board with material advantage).

### Changes

**Backend — `Game.js` / `Board.js`**
- Track captured pieces in the `Board` class: maintain `capturedByWhite[]` and `capturedByBlack[]` arrays.
- When `applyMove` captures a piece, push it into the appropriate array.
- Include `captured: { white: [...], black: [...] }` in `getState()` and in the `board` SSE event.

**Frontend — new component `CapturedPieces.jsx`**
- Render two rows of small piece icons (using existing SVGs in `/pieces/`).
- Sort by piece value (Q > R > B > N > P).
- Show material-advantage delta (e.g., "+3") next to the side that is ahead.

**Frontend — `App.jsx`**
- Place `<CapturedPieces side="black" .../>` above the board and `<CapturedPieces side="white" .../>` below (from white's perspective).

---

## 4. Time Control (Chess Clock)

### Goal
Add configurable time controls (e.g., 5+3, 10+0) with a ticking clock for each side. Running out of time = loss.

### Changes

**Backend — `Game.js`**
- Add `timeWhite`, `timeBlack` (in ms), and `increment` fields.
- Record `turnStartedAt` when a turn begins; on move completion, deduct elapsed time and add increment.
- Broadcast a **`clock`** SSE event after each move: `{ whiteTime: ms, blackTime: ms }`.
- If time reaches 0, set `result = "X wins on time"`.
- Optionally broadcast periodic clock ticks (every 1 s) so the UI clock is smooth.

**Frontend — `GameControls.jsx` (Settings Modal)**
- Add time-control fields: **Base time** (minutes) and **Increment** (seconds).
- Default: 10+0 (or "unlimited" checkbox).

**Frontend — new component `ChessClock.jsx`**
- Two countdown displays (MM:SS or SS.s when < 60 s).
- Active side's clock ticks down locally (client-side `setInterval`) for smooth display, synced on each `clock` event.
- Highlight the active clock; dim the inactive one.
- Flash/red when time < 30 s.

**Frontend — `App.jsx`**
- Render `<ChessClock>` near the board (above/below alongside captured pieces).

---

## 5. Model Selection Dropdown (Live from API)

### Goal
Replace the free-text model input with a dropdown populated by hitting the provider's `/v1/models` endpoint.

### Changes

**Backend — `server/index.js`**
- New endpoint: **`POST /api/models`** `{ apiUrl, apiKey }`
  - Derives the models endpoint from the chat-completions URL (strip `/chat/completions`, append `/models`).
  - Fetches the model list and returns `{ models: [{ id, name }] }`.
  - Caches results for 5 minutes per `(apiUrl, apiKey)` pair.

**Frontend — `GameControls.jsx`**
- Replace the Model `<Input>` with a **`<Select>`** dropdown.
- When the user fills in API URL + API Key, fire a request to `/api/models` to populate the dropdown.
- Show a loading spinner while fetching; fall back to free-text input on error.
- Debounce the fetch (500 ms after last keystroke in URL/Key fields).

---

## 6. "Stop Game Now" Button

### Goal
Allow the user to immediately terminate a running game (not just reset).

### Changes

**Backend — `server/index.js`**
- New endpoint: **`POST /api/game/stop`**
  - Sets `currentGame.result = "Game stopped by user"` and sets an abort flag.
  - Responds `{ message: "Game stopped" }`.

**Backend — `Game.js`**
- Add `this.aborted = false` flag.
- In the `play()` loop and inside `_playTurn()`, check `this.aborted` before each LLM call; if true, break out.
- Add `stop()` method that sets `this.aborted = true` and resolves any pending human-move promise.

**Frontend — `GameControls.jsx`**
- Add a red **"Stop Game"** button visible only while `gameActive && !result`.
- On click → `POST /api/game/stop`, then update UI.

**Frontend — `useGameStream.js`**
- Add `stopGame()` function.

---

## 7. LLM JSON Response: `dialogue` + `move`

### Goal
Instruct the LLM to reply in JSON with two keys — `"move"` (algebraic notation) and `"dialogue"` (entertaining trash talk / commentary). This adds personality and entertainment value.

### Changes

**Backend — `Game.js`**
- Update `SYSTEM_PROMPT_TEMPLATE` to:
  ```
  You are playing chess as {{color}}. Respond ONLY with a JSON object with exactly two keys:
  - "move": your move in standard algebraic notation (e.g. "Nf3", "e4", "O-O")
  - "dialogue": a short, entertaining comment about the game, your move, or your opponent (1-2 sentences, stay in character as a witty chess player)
  
  Example response: {"move": "Bxd3", "dialogue": "Your bishop was looking lonely. I gave it company."}
  
  Consider your every move carefully. When you move a piece, cross-check with its previous location to verify legality. Keep a mental image of all pieces using the move history.
  ```

- Update `_cleanMoveResponse(rawResponse)` → new method `_parseResponse(rawResponse)`:
  - Try `JSON.parse(rawResponse)` first.
  - Extract `{ move, dialogue }`.
  - If JSON parsing fails, fall back to the existing regex-based extraction (treat entire response as the move, dialogue = null).
  - Return `{ move: string, dialogue: string | null }`.

- In `_playTurn()`, use `_parseResponse()` instead of `_cleanMoveResponse()`:
  - `moveStr = parsed.move`
  - Include `dialogue` in the `chat` and `move` SSE events.

**Backend — `MoveHistory.js`**
- No changes needed — it already stores just the notation string.

---

## 8. Update Move Capture & Chat Display for Dialogue

### Goal
Modify how moves and chat are displayed to showcase the LLM's dialogue alongside the move.

### Changes

**Backend — `Game.js` (SSE events)**
- The `move` event now includes: `{ color, model, notation, from, to, moveNumber, dialogue }`.
- The `chat` event now includes: `{ color, model, raw, move, dialogue, thinking, attempt, moveNumber }`.

**Frontend — `ChatLog.jsx`**
- For `chat` entries, display the **dialogue** prominently in a speech-bubble style.
- Show the move notation in a smaller badge/tag below the dialogue.
- If `dialogue` is null (JSON parse failed), fall back to showing `raw` as before.
- Style white's dialogue with a left-aligned light bubble, black's with a right-aligned dark bubble (chat-app aesthetic).

**Frontend — `useGameStream.js`**
- The `move` event handler already spreads `data` into the chat entry — `dialogue` will be automatically included.
- No structural changes; just ensure `dialogue` is available in state.

**Frontend — move list / PGN area**
- Optionally show dialogue as hover tooltips on moves in the PGN display.

---

## Implementation Order (Recommended)

| Phase | Feature | Complexity | Dependencies |
|-------|---------|-----------|-------------|
| 1 | **Stop Game Now** (§6) | Low | None |
| 2 | **JSON dialogue + move** (§7) + **Chat display update** (§8) | Medium | None |
| 3 | **Captured Pieces Display** (§3) | Medium | Board.js tracking |
| 4 | **Model Selection Dropdown** (§5) | Medium | API endpoint |
| 5 | **Time Control** (§4) | Medium-High | Game loop changes |
| 6 | **Human-Playable Side** (§1) | High | Game loop, Board UI |
| 7 | **Real-Time Evaluation** (§2) | High | Stockfish integration |

---

## File Change Summary

| File | Sections Affected |
|------|-------------------|
| `server/index.js` | §1, §2, §4, §5, §6 — new endpoints |
| `server/chess/Game.js` | §1, §4, §6, §7, §8 — game loop, prompts, parsing |
| `server/chess/Board.js` | §3 — captured piece tracking |
| `server/chess/LLMClient.js` | No changes expected |
| `server/chess/MoveHistory.js` | No changes expected |
| `src/App.jsx` | §2, §3, §4 — new component layout |
| `src/components/Chessboard.jsx` | §1 — interactive play, board flip |
| `src/components/GameControls.jsx` | §1, §4, §5, §6 — modal fields, buttons |
| `src/components/ChatLog.jsx` | §8 — dialogue display |
| `src/hooks/useGameStream.js` | §1, §2, §3, §4, §6 — new state, events, actions |
| `src/components/EvalBar.jsx` | §2 — **new file** |
| `src/components/CapturedPieces.jsx` | §3 — **new file** |
| `src/components/ChessClock.jsx` | §4 — **new file** |
| `package.json` | §2 — stockfish dependency |
