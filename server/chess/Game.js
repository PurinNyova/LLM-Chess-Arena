import { Board } from './Board.js';
import { MoveHistory } from './MoveHistory.js';
import { LLMClient } from './LLMClient.js';
import { Color, oppositeColor, colorName } from './Piece.js';

const SYSTEM_PROMPT_TEMPLATE =
  'You are playing chess as {{color}}. Respond ONLY with a JSON object containing two keys:\n' +
  '1. "move" — your move in standard algebraic notation (e.g. "e4", "Nf3", "bxd3", "O-O")\n' +
  '2. "dialogue" — a short, entertaining comment, trash talk, or commentary about the position or your move (1-2 sentences, show personality!)\n\n' +
  'Consider your every move carefully. When you move a piece, cross-check with the previous location to see if it is legal (trace the movement). ' +
  'Keep a mental image of all the pieces by using the move history.\n\n' +
  'Example response: {"move": "Nf3", "dialogue": "The knight rides forth! Let\'s see how you handle this."}\n' +
  'Respond with ONLY the JSON object, no extra text.';

/**
 * Manages a chess game between two LLM players.
 * Emits events via a callback so the SSE handler can push them to the client.
 */
export class Game {
  constructor(config, emit) {
    this.board = new Board();
    this.history = new MoveHistory();
    this.currentTurn = Color.WHITE;
    this.result = null;
    this.maxRetries = config.maxRetries || 3;
    this.emit = emit; // (eventType, data) => void

    // Human side support
    this.humanSide = config.humanSide || null; // 'WHITE', 'BLACK', or null
    this._humanMoveResolve = null; // resolver for human move promise

    this.whiteClient = this.humanSide === 'WHITE' ? null : new LLMClient(config.whiteApiUrl, config.whiteApiKey, config.whiteModel);
    this.blackClient = this.humanSide === 'BLACK' ? null : new LLMClient(config.blackApiUrl, config.blackApiKey, config.blackModel);

    this.whiteModel = this.humanSide === 'WHITE' ? 'Human' : config.whiteModel;
    this.blackModel = this.humanSide === 'BLACK' ? 'Human' : config.blackModel;

    this.aborted = false;

    // Time control
    const baseTimeMs = config.baseTime != null ? config.baseTime * 60 * 1000 : null; // null = unlimited
    this.timeWhite = baseTimeMs;
    this.timeBlack = baseTimeMs;
    this.increment = (config.increment || 0) * 1000; // seconds → ms
    this.unlimited = baseTimeMs == null;
    this.turnStartedAt = null;
    this.clockInterval = null;
  }

  /** Returns current state snapshot */
  getState() {
    return {
      board: this.board.toJSON(),
      turn: this.currentTurn,
      pgn: this.history.toPGN(),
      moveCount: this.history.getMoveCount(),
      result: this.result,
      whiteModel: this.whiteModel,
      blackModel: this.blackModel,
      captured: {
        white: this.board.capturedByWhite,
        black: this.board.capturedByBlack,
      },
      clock: this.unlimited ? null : {
        whiteTime: this.timeWhite,
        blackTime: this.timeBlack,
      },
      humanSide: this.humanSide,
    };
  }

  /** Runs the full game loop asynchronously */
  async play() {
    this.emit('status', { message: `Game started! White: ${this.whiteModel} vs Black: ${this.blackModel}` });
    this.emit('board', { squares: this.board.toJSON(), turn: this.currentTurn });

    // Start clock tick interval (every 1s) if time control is active
    if (!this.unlimited) {
      this._emitClock();
      this.clockInterval = setInterval(() => {
        if (this.result || this.aborted) {
          clearInterval(this.clockInterval);
          return;
        }
        // Deduct elapsed time from the active player for display purposes
        this._emitClock();
      }, 1000);
    }

    while (!this.result && !this.aborted) {
      await this._playTurn();
    }

    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }

    this._finishedAt = Date.now();
    this.emit('gameOver', { result: this.result, pgn: this.history.toPGN() });
  }

  _emitClock() {
    if (this.unlimited) return;
    // Calculate live time remaining for active player
    let whiteTime = this.timeWhite;
    let blackTime = this.timeBlack;
    if (this.turnStartedAt) {
      const elapsed = Date.now() - this.turnStartedAt;
      if (this.currentTurn === Color.WHITE) {
        whiteTime = Math.max(0, whiteTime - elapsed);
      } else {
        blackTime = Math.max(0, blackTime - elapsed);
      }
    }
    this.emit('clock', { whiteTime, blackTime });
  }

  async _playTurn() {
    const color = this.currentTurn;
    const isHumanTurn = this.humanSide === color;
    const client = color === Color.WHITE ? this.whiteClient : this.blackClient;
    const model = color === Color.WHITE ? this.whiteModel : this.blackModel;
    const pgn = this.history.toPGN();
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{{color}}', colorName(color));
    const userMessage = pgn || 'Game starts now. Your move.';
    const moveNumber = Math.floor(this.history.getMoveCount() / 2) + 1;

    this.emit('status', {
      message: isHumanTurn
        ? `Your turn (${colorName(color)}) — Move ${moveNumber}`
        : `${colorName(color)}'s turn (${model}) — Move ${moveNumber}`,
    });

    // Start timing this turn
    this.turnStartedAt = Date.now();

    let moveStr = null;
    let appliedMove = null;

    if (isHumanTurn) {
      // Wait for human move via promise
      moveStr = await new Promise((resolve) => {
        this._humanMoveResolve = resolve;
      });
      this._humanMoveResolve = null;

      if (this.aborted) return;

      // Try to apply
      appliedMove = this.board.applyMove(moveStr, color);
      if (!appliedMove) {
        // This shouldn't normally happen since we validate in the endpoint,
        // but handle gracefully
        this.emit('error', { color, model, message: `Invalid move "${moveStr}"`, attempt: 1, maxRetries: 1 });
        return; // Will loop again and wait for another move
      }
    } else {
      // LLM turn (existing logic)
      let lastIllegalMove = null; // Track last illegal move for retry injection
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.aborted) return;
      try {
        let thinkingBuf = '';

        // Build user message, injecting illegal move warning on retries
        let turnMessage = userMessage;
        if (lastIllegalMove) {
          turnMessage += `\n\nIMPORTANT: Your last move "${lastIllegalMove}" was ILLEGAL. That move is not valid in the current position. Please carefully analyze the board and provide a different, legal move.`;
        }

        // Call LLM with streaming
        const rawResponse = await client.chat(systemPrompt, turnMessage, (type, text) => {
          if (type === 'thinking') {
            thinkingBuf += text;
            this.emit('thinking', { color, model, text, accumulated: thinkingBuf });
          }
        });

        const parsed = this._parseResponse(rawResponse);
        moveStr = parsed.move;

        this.emit('chat', {
          color,
          model,
          raw: rawResponse,
          move: moveStr,
          dialogue: parsed.dialogue,
          thinking: thinkingBuf || null,
          attempt,
          moveNumber,
        });

        // Try to apply
        appliedMove = this.board.applyMove(moveStr, color);

        if (appliedMove) {
          break;
        } else {
          lastIllegalMove = moveStr;
          this.emit('error', {
            color,
            model,
            message: `Invalid move "${moveStr}"`,
            attempt,
            maxRetries: this.maxRetries,
          });
        }
      } catch (err) {
        this.emit('error', {
          color,
          model,
          message: err.message,
          attempt,
          maxRetries: this.maxRetries,
        });

        // Refund 2 minutes on fetch/network errors
        if (!this.unlimited && (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('econnrefused') || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('enotfound') || err.message.toLowerCase().includes('timeout'))) {
          const REFUND_MS = 2 * 60 * 1000; // 2 minutes
          if (color === Color.WHITE) {
            this.timeWhite += REFUND_MS;
          } else {
            this.timeBlack += REFUND_MS;
          }
          this._emitClock();
          this.emit('status', { message: `2 minutes refunded to ${colorName(color)} due to API error` });
        }

        if (attempt === this.maxRetries) break;
      }
    }

    if (!appliedMove) {
      this.result = `${colorName(oppositeColor(color))} wins by forfeit (${colorName(color)} failed to make a legal move)`;
      return;
    }
    } // end else (LLM turn)

    // Deduct time and add increment
    if (!this.unlimited && this.turnStartedAt) {
      const elapsed = Date.now() - this.turnStartedAt;
      if (color === Color.WHITE) {
        this.timeWhite = Math.max(0, this.timeWhite - elapsed) + this.increment;
        if (this.timeWhite <= 0) {
          this.timeWhite = 0;
          this.result = `${colorName(oppositeColor(color))} wins on time`;
          this._emitClock();
          return;
        }
      } else {
        this.timeBlack = Math.max(0, this.timeBlack - elapsed) + this.increment;
        if (this.timeBlack <= 0) {
          this.timeBlack = 0;
          this.result = `${colorName(oppositeColor(color))} wins on time`;
          this._emitClock();
          return;
        }
      }
      this.turnStartedAt = null;
      this._emitClock();
    }

    this.history.addMove(appliedMove.notation);

    this.emit('move', {
      color,
      model,
      notation: appliedMove.notation,
      from: appliedMove.from,
      to: appliedMove.to,
      moveNumber,
    });

    this.emit('board', {
      squares: this.board.toJSON(),
      turn: oppositeColor(color),
      lastMove: { from: appliedMove.from, to: appliedMove.to },
      captured: {
        white: this.board.capturedByWhite,
        black: this.board.capturedByBlack,
      },
    });

    // Check game-over conditions
    const opponent = oppositeColor(color);

    if (this.board.isCheckmate(opponent)) {
      this.result = `${colorName(color)} wins by checkmate!`;
      return;
    }
    if (this.board.isStalemate(opponent)) {
      this.result = 'Draw by stalemate';
      return;
    }
    if (this.board.isFiftyMoveDraw()) {
      this.result = 'Draw by 50-move rule';
      return;
    }
    if (this.board.isInCheck(opponent)) {
      this.emit('status', { message: `${colorName(opponent)} is in check!` });
    }
    if (this.history.getMoveCount() >= 300) {
      this.result = 'Draw by excessive length (150+ moves)';
      return;
    }

    this.currentTurn = opponent;
  }

  /**
   * Parse the LLM response, trying JSON first, then falling back to regex.
   * Returns { move: string, dialogue: string | null }
   */
  _parseResponse(response) {
    // Strip any <think>...</think> blocks that may have leaked through
    let clean = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Try JSON parse first
    try {
      // Extract JSON object from the response (in case there's extra text around it)
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.move) {
          return {
            move: parsed.move.trim(),
            dialogue: parsed.dialogue || null,
          };
        }
      }
    } catch {
      // JSON parsing failed, fall back to text extraction
    }

    // Fallback: treat as plain text move (legacy behavior)
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.slice(1, -1).trim();
    }
    const parts = clean.split(/\s+/);
    if (parts.length > 1) {
      for (const part of parts) {
        const candidate = part.replace(/[.!?]$/, '');
        if (this._looksLikeMove(candidate)) return { move: candidate, dialogue: null };
      }
      clean = parts[parts.length - 1];
    }
    clean = clean.replace(/[.!?]+$/, '');
    return { move: clean, dialogue: null };
  }

  _looksLikeMove(s) {
    if (!s) return false;
    if (['O-O', 'O-O-O', '0-0', '0-0-0'].includes(s)) return true;
    return /^[KQRBNa-h][a-h1-8x=+#]*$/.test(s);
  }

  /** Immediately stop the game */
  stop() {
    this.aborted = true;
    if (!this.result) {
      this.result = 'Game stopped by user';
    }
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    // Resolve any pending human move promise
    if (this._humanMoveResolve) {
      this._humanMoveResolve(null);
      this._humanMoveResolve = null;
    }
  }

  /**
   * Called by the human move endpoint to submit a move.
   * Returns the applied move or null if invalid.
   */
  applyHumanMove(moveStr) {
    if (!this.humanSide || this.currentTurn !== this.humanSide) {
      return { error: 'Not your turn' };
    }
    // Validate the move on a copy first
    const testBoard = this.board.copy();
    const testMove = testBoard.applyMove(moveStr, this.currentTurn);
    if (!testMove) {
      return { error: `Invalid move: ${moveStr}` };
    }
    // Resolve the pending promise — the game loop will apply the move
    if (this._humanMoveResolve) {
      this._humanMoveResolve(moveStr);
      return { ok: true, notation: testMove.notation };
    }
    return { error: 'No pending move request' };
  }
}
