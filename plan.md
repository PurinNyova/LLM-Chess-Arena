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