import { Board } from './Board.js';
import { MoveHistory } from './MoveHistory.js';
import { LLMClient } from './LLMClient.js';
import { Color, oppositeColor, colorName } from './Piece.js';

const SYSTEM_PROMPT_TEMPLATE =
  'You are playing chess as {{color}}, your next response should just be your move ' +
  'in chess algebraic notation. consider your every move carefully, when you move a ' +
  'piece cross check with the previous location to see if it is legal (trace the ' +
  'movement). Keep a mental image of all the pieces by using the move history. ' +
  'example response "bxd3". don\'t say extra words nor explanations, just the move.';

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

    this.whiteClient = new LLMClient(config.whiteApiUrl, config.whiteApiKey, config.whiteModel);
    this.blackClient = new LLMClient(config.blackApiUrl, config.blackApiKey, config.blackModel);

    this.whiteModel = config.whiteModel;
    this.blackModel = config.blackModel;

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
    const client = color === Color.WHITE ? this.whiteClient : this.blackClient;
    const model = color === Color.WHITE ? this.whiteModel : this.blackModel;
    const pgn = this.history.toPGN();
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{{color}}', colorName(color));
    const userMessage = pgn || 'Game starts now. Your move.';
    const moveNumber = Math.floor(this.history.getMoveCount() / 2) + 1;

    this.emit('status', {
      message: `${colorName(color)}'s turn (${model}) — Move ${moveNumber}`,
    });

    // Start timing this turn
    this.turnStartedAt = Date.now();

    let moveStr = null;
    let appliedMove = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.aborted) return;
      try {
        let thinkingBuf = '';

        // Call LLM with streaming
        const rawResponse = await client.chat(systemPrompt, userMessage, (type, text) => {
          if (type === 'thinking') {
            thinkingBuf += text;
            this.emit('thinking', { color, model, text, accumulated: thinkingBuf });
          }
        });

        moveStr = this._cleanMoveResponse(rawResponse);

        this.emit('chat', {
          color,
          model,
          raw: rawResponse,
          move: moveStr,
          thinking: thinkingBuf || null,
          attempt,
          moveNumber,
        });

        // Try to apply
        appliedMove = this.board.applyMove(moveStr, color);

        if (appliedMove) {
          break;
        } else {
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
        if (attempt === this.maxRetries) break;
      }
    }

    if (!appliedMove) {
      this.result = `${colorName(oppositeColor(color))} wins by forfeit (${colorName(color)} failed to make a legal move)`;
      return;
    }

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

  _cleanMoveResponse(response) {
    // Strip any <think>...</think> blocks that may have leaked through
    let clean = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.slice(1, -1).trim();
    }
    const parts = clean.split(/\s+/);
    if (parts.length > 1) {
      for (const part of parts) {
        const candidate = part.replace(/[.!?]$/, '');
        if (this._looksLikeMove(candidate)) return candidate;
      }
      clean = parts[parts.length - 1];
    }
    clean = clean.replace(/[.!?]+$/, '');
    return clean;
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
  }
}
