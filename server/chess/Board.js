import { PieceType, Color, oppositeColor, pieceFromSymbol } from './Piece.js';

/**
 * Chess board state and move validation — ported from Board.java.
 * squares[file][rank], file 0=a, rank 0=1.
 */
export class Board {
  constructor() {
    // squares[file][rank] = { type, color } | null
    this.squares = Array.from({ length: 8 }, () => Array(8).fill(null));
    this.whiteCanCastleKingside = true;
    this.whiteCanCastleQueenside = true;
    this.blackCanCastleKingside = true;
    this.blackCanCastleQueenside = true;
    this.enPassantTarget = null; // { file, rank } | null
    this.halfMoveClock = 0;
    this.capturedByWhite = []; // pieces captured by white (i.e. black pieces taken)
    this.capturedByBlack = []; // pieces captured by black (i.e. white pieces taken)
    this._setupInitialPosition();
  }

  _setupInitialPosition() {
    for (let f = 0; f < 8; f++)
      for (let r = 0; r < 8; r++)
        this.squares[f][r] = null;

    const W = Color.WHITE, B = Color.BLACK;
    // White back rank
    this.squares[0][0] = { type: PieceType.ROOK, color: W };
    this.squares[1][0] = { type: PieceType.KNIGHT, color: W };
    this.squares[2][0] = { type: PieceType.BISHOP, color: W };
    this.squares[3][0] = { type: PieceType.QUEEN, color: W };
    this.squares[4][0] = { type: PieceType.KING, color: W };
    this.squares[5][0] = { type: PieceType.BISHOP, color: W };
    this.squares[6][0] = { type: PieceType.KNIGHT, color: W };
    this.squares[7][0] = { type: PieceType.ROOK, color: W };
    for (let f = 0; f < 8; f++) this.squares[f][1] = { type: PieceType.PAWN, color: W };

    // Black back rank
    this.squares[0][7] = { type: PieceType.ROOK, color: B };
    this.squares[1][7] = { type: PieceType.KNIGHT, color: B };
    this.squares[2][7] = { type: PieceType.BISHOP, color: B };
    this.squares[3][7] = { type: PieceType.QUEEN, color: B };
    this.squares[4][7] = { type: PieceType.KING, color: B };
    this.squares[5][7] = { type: PieceType.BISHOP, color: B };
    this.squares[6][7] = { type: PieceType.KNIGHT, color: B };
    this.squares[7][7] = { type: PieceType.ROOK, color: B };
    for (let f = 0; f < 8; f++) this.squares[f][6] = { type: PieceType.PAWN, color: B };
  }

  copy() {
    const b = new Board();
    for (let f = 0; f < 8; f++)
      for (let r = 0; r < 8; r++)
        b.squares[f][r] = this.squares[f][r]; // pieces are value-like plain objects
    b.whiteCanCastleKingside = this.whiteCanCastleKingside;
    b.whiteCanCastleQueenside = this.whiteCanCastleQueenside;
    b.blackCanCastleKingside = this.blackCanCastleKingside;
    b.blackCanCastleQueenside = this.blackCanCastleQueenside;
    b.enPassantTarget = this.enPassantTarget ? { ...this.enPassantTarget } : null;
    b.halfMoveClock = this.halfMoveClock;
    b.capturedByWhite = [...this.capturedByWhite];
    b.capturedByBlack = [...this.capturedByBlack];
    return b;
  }

  getPiece(file, rank) {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return this.squares[file][rank];
  }

  _setPiece(file, rank, piece) {
    this.squares[file][rank] = piece;
  }

  // ========== Move Parsing & Application ==========

  /**
   * Parses algebraic notation and applies if legal.
   * Returns { from, to, pieceType, promotion, capture, castleKS, castleQS, notation } or null.
   */
  applyMove(notation, color) {
    if (!notation) return null;
    const clean = notation.trim().replace(/[+#!?]/g, '');
    const move = this._parseAndResolve(clean, color);
    if (!move) return null;

    // Verify doesn't leave own king in check
    const test = this.copy();
    test._executeMove(move);
    if (test.isInCheck(color)) return null;

    this._executeMove(move);
    return move;
  }

  _executeMove(move) {
    if (move.castleKS) {
      this._executeCastle(true, move.from.rank === 0 ? Color.WHITE : Color.BLACK);
      return;
    }
    if (move.castleQS) {
      this._executeCastle(false, move.from.rank === 0 ? Color.WHITE : Color.BLACK);
      return;
    }

    const piece = this.getPiece(move.from.file, move.from.rank);
    if (!piece) return;
    const color = piece.color;

    // En passant capture
    if (piece.type === PieceType.PAWN && this.enPassantTarget &&
        move.to.file === this.enPassantTarget.file && move.to.rank === this.enPassantTarget.rank) {
      const capRank = color === Color.WHITE ? move.to.rank - 1 : move.to.rank + 1;
      const capturedPiece = this.getPiece(move.to.file, capRank);
      if (capturedPiece) {
        if (color === Color.WHITE) this.capturedByWhite.push(capturedPiece.type);
        else this.capturedByBlack.push(capturedPiece.type);
      }
      this._setPiece(move.to.file, capRank, null);
    } else {
      // Normal capture
      const destPiece = this.getPiece(move.to.file, move.to.rank);
      if (destPiece) {
        if (color === Color.WHITE) this.capturedByWhite.push(destPiece.type);
        else this.capturedByBlack.push(destPiece.type);
      }
    }

    // Update en passant target
    if (piece.type === PieceType.PAWN && Math.abs(move.to.rank - move.from.rank) === 2) {
      const epRank = Math.floor((move.from.rank + move.to.rank) / 2);
      this.enPassantTarget = { file: move.from.file, rank: epRank };
    } else {
      this.enPassantTarget = null;
    }

    // Half-move clock
    if (piece.type === PieceType.PAWN || move.capture) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    this._updateCastlingRights(move, color);

    // Move the piece
    this._setPiece(move.from.file, move.from.rank, null);
    if (move.promotion) {
      this._setPiece(move.to.file, move.to.rank, { type: move.promotion, color });
    } else {
      this._setPiece(move.to.file, move.to.rank, piece);
    }
  }

  _executeCastle(kingside, color) {
    const rank = color === Color.WHITE ? 0 : 7;
    if (kingside) {
      const king = this.getPiece(4, rank);
      const rook = this.getPiece(7, rank);
      this._setPiece(4, rank, null);
      this._setPiece(7, rank, null);
      this._setPiece(6, rank, king);
      this._setPiece(5, rank, rook);
    } else {
      const king = this.getPiece(4, rank);
      const rook = this.getPiece(0, rank);
      this._setPiece(4, rank, null);
      this._setPiece(0, rank, null);
      this._setPiece(2, rank, king);
      this._setPiece(3, rank, rook);
    }
    this.enPassantTarget = null;
    if (color === Color.WHITE) {
      this.whiteCanCastleKingside = false;
      this.whiteCanCastleQueenside = false;
    } else {
      this.blackCanCastleKingside = false;
      this.blackCanCastleQueenside = false;
    }
  }

  _updateCastlingRights(move, color) {
    if (move.pieceType === PieceType.KING) {
      if (color === Color.WHITE) {
        this.whiteCanCastleKingside = false;
        this.whiteCanCastleQueenside = false;
      } else {
        this.blackCanCastleKingside = false;
        this.blackCanCastleQueenside = false;
      }
    }
    const { from, to } = move;
    if (from.file === 0 && from.rank === 0) this.whiteCanCastleQueenside = false;
    if (from.file === 7 && from.rank === 0) this.whiteCanCastleKingside = false;
    if (from.file === 0 && from.rank === 7) this.blackCanCastleQueenside = false;
    if (from.file === 7 && from.rank === 7) this.blackCanCastleKingside = false;
    if (to.file === 0 && to.rank === 0) this.whiteCanCastleQueenside = false;
    if (to.file === 7 && to.rank === 0) this.whiteCanCastleKingside = false;
    if (to.file === 0 && to.rank === 7) this.blackCanCastleQueenside = false;
    if (to.file === 7 && to.rank === 7) this.blackCanCastleKingside = false;
  }

  // ========== Move Parsing ==========

  _parseAndResolve(notation, color) {
    if (notation === 'O-O' || notation === '0-0') return this._resolveCastle(true, color);
    if (notation === 'O-O-O' || notation === '0-0-0') return this._resolveCastle(false, color);

    let rest;
    let pieceType;
    const first = notation.charAt(0);
    if (first >= 'A' && first <= 'Z' && 'KQRBN'.includes(first)) {
      pieceType = pieceFromSymbol(first);
      rest = notation.substring(1);
    } else {
      pieceType = PieceType.PAWN;
      rest = notation;
    }

    // Promotion
    let promotion = null;
    if (rest.includes('=')) {
      const eqIdx = rest.indexOf('=');
      if (eqIdx + 1 < rest.length) {
        promotion = pieceFromSymbol(rest.charAt(eqIdx + 1));
      }
      rest = rest.substring(0, eqIdx);
    }

    // Capture
    const capture = rest.includes('x');
    rest = rest.replace(/x/g, '');

    if (rest.length < 2) return null;
    const destStr = rest.substring(rest.length - 2);
    const dest = Board._fromAlgebraic(destStr);
    if (!dest) return null;

    const disambig = rest.substring(0, rest.length - 2);
    const source = this._resolveSource(pieceType, color, dest, capture, disambig);
    if (!source) return null;

    return {
      from: source, to: dest, pieceType, promotion, capture,
      castleKS: false, castleQS: false, notation,
    };
  }

  _resolveCastle(kingside, color) {
    const rank = color === Color.WHITE ? 0 : 7;
    const king = this.getPiece(4, rank);
    if (!king || king.type !== PieceType.KING || king.color !== color) return null;

    if (kingside) {
      if (color === Color.WHITE && !this.whiteCanCastleKingside) return null;
      if (color === Color.BLACK && !this.blackCanCastleKingside) return null;
      if (this.getPiece(5, rank) || this.getPiece(6, rank)) return null;
      const rook = this.getPiece(7, rank);
      if (!rook || rook.type !== PieceType.ROOK || rook.color !== color) return null;
      if (this.isInCheck(color)) return null;
      if (this._isSquareAttacked({ file: 5, rank }, oppositeColor(color))) return null;
      if (this._isSquareAttacked({ file: 6, rank }, oppositeColor(color))) return null;
      return {
        from: { file: 4, rank }, to: { file: 6, rank },
        pieceType: PieceType.KING, promotion: null, capture: false,
        castleKS: true, castleQS: false, notation: 'O-O',
      };
    } else {
      if (color === Color.WHITE && !this.whiteCanCastleQueenside) return null;
      if (color === Color.BLACK && !this.blackCanCastleQueenside) return null;
      if (this.getPiece(1, rank) || this.getPiece(2, rank) || this.getPiece(3, rank)) return null;
      const rook = this.getPiece(0, rank);
      if (!rook || rook.type !== PieceType.ROOK || rook.color !== color) return null;
      if (this.isInCheck(color)) return null;
      if (this._isSquareAttacked({ file: 3, rank }, oppositeColor(color))) return null;
      if (this._isSquareAttacked({ file: 2, rank }, oppositeColor(color))) return null;
      return {
        from: { file: 4, rank }, to: { file: 2, rank },
        pieceType: PieceType.KING, promotion: null, capture: false,
        castleKS: false, castleQS: true, notation: 'O-O-O',
      };
    }
  }

  _resolveSource(pieceType, color, dest, capture, disambig) {
    const candidates = [];
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const p = this.squares[f][r];
        if (!p || p.type !== pieceType || p.color !== color) continue;
        const from = { file: f, rank: r };
        if (this._canPieceReach(pieceType, color, from, dest, capture)) {
          candidates.push(from);
        }
      }
    }

    let filtered = candidates;
    if (disambig.length > 0) {
      filtered = candidates.filter(sq => {
        for (const c of disambig) {
          if (c >= 'a' && c <= 'h') { if (sq.file !== (c.charCodeAt(0) - 97)) return false; }
          else if (c >= '1' && c <= '8') { if (sq.rank !== (c.charCodeAt(0) - 49)) return false; }
        }
        return true;
      });
    }

    // Filter by legality (doesn't leave king in check)
    const legal = filtered.filter(from => {
      const test = this.copy();
      const testMove = {
        from, to: dest, pieceType, promotion: null, capture,
        castleKS: false, castleQS: false, notation: '',
      };
      test._executeMove(testMove);
      return !test.isInCheck(color);
    });

    return legal.length === 1 ? legal[0] : null;
  }

  _canPieceReach(type, color, from, to, capture) {
    const df = to.file - from.file;
    const dr = to.rank - from.rank;
    const absDF = Math.abs(df);
    const absDR = Math.abs(dr);

    const destPiece = this.getPiece(to.file, to.rank);
    if (destPiece && destPiece.color === color) return false;

    switch (type) {
      case PieceType.PAWN: return this._canPawnReach(color, from, to, capture);
      case PieceType.KNIGHT: return (absDF === 1 && absDR === 2) || (absDF === 2 && absDR === 1);
      case PieceType.BISHOP: return absDF === absDR && absDF > 0 && this._isPathClear(from, to);
      case PieceType.ROOK: return (df === 0 || dr === 0) && (absDF + absDR > 0) && this._isPathClear(from, to);
      case PieceType.QUEEN:
        return ((absDF === absDR && absDF > 0) || ((df === 0 || dr === 0) && (absDF + absDR > 0)))
          && this._isPathClear(from, to);
      case PieceType.KING: return absDF <= 1 && absDR <= 1 && (absDF + absDR > 0);
      default: return false;
    }
  }

  _canPawnReach(color, from, to) {
    const dir = color === Color.WHITE ? 1 : -1;
    const df = to.file - from.file;
    const dr = to.rank - from.rank;
    const startRank = color === Color.WHITE ? 1 : 6;

    if (df === 0 && dr === dir && !this.getPiece(to.file, to.rank)) return true;
    if (df === 0 && dr === 2 * dir && from.rank === startRank) {
      const midRank = from.rank + dir;
      return !this.getPiece(from.file, midRank) && !this.getPiece(to.file, to.rank);
    }
    if (Math.abs(df) === 1 && dr === dir) {
      const dp = this.getPiece(to.file, to.rank);
      if (dp && dp.color !== color) return true;
      if (this.enPassantTarget && to.file === this.enPassantTarget.file && to.rank === this.enPassantTarget.rank) return true;
    }
    return false;
  }

  _isPathClear(from, to) {
    const df = Math.sign(to.file - from.file);
    const dr = Math.sign(to.rank - from.rank);
    let f = from.file + df, r = from.rank + dr;
    while (f !== to.file || r !== to.rank) {
      if (this.squares[f][r]) return false;
      f += df;
      r += dr;
    }
    return true;
  }

  // ========== Check / Checkmate / Stalemate ==========

  isInCheck(color) {
    const king = this._findKing(color);
    if (!king) return false;
    return this._isSquareAttacked(king, oppositeColor(color));
  }

  _isSquareAttacked(target, attackerColor) {
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const p = this.squares[f][r];
        if (!p || p.color !== attackerColor) continue;
        if (this._canPieceAttack(p.type, attackerColor, { file: f, rank: r }, target)) return true;
      }
    }
    return false;
  }

  _canPieceAttack(type, color, from, to) {
    const df = to.file - from.file;
    const dr = to.rank - from.rank;
    const absDF = Math.abs(df);
    const absDR = Math.abs(dr);

    switch (type) {
      case PieceType.PAWN: {
        const dir = color === Color.WHITE ? 1 : -1;
        return absDF === 1 && dr === dir;
      }
      case PieceType.KNIGHT: return (absDF === 1 && absDR === 2) || (absDF === 2 && absDR === 1);
      case PieceType.BISHOP: return absDF === absDR && absDF > 0 && this._isPathClear(from, to);
      case PieceType.ROOK: return (df === 0 || dr === 0) && (absDF + absDR > 0) && this._isPathClear(from, to);
      case PieceType.QUEEN:
        return ((absDF === absDR && absDF > 0) || ((df === 0 || dr === 0) && (absDF + absDR > 0)))
          && this._isPathClear(from, to);
      case PieceType.KING: return absDF <= 1 && absDR <= 1 && (absDF + absDR > 0);
      default: return false;
    }
  }

  _findKing(color) {
    for (let f = 0; f < 8; f++)
      for (let r = 0; r < 8; r++) {
        const p = this.squares[f][r];
        if (p && p.type === PieceType.KING && p.color === color) return { file: f, rank: r };
      }
    return null;
  }

  isCheckmate(color) {
    return this.isInCheck(color) && !this._hasAnyLegalMove(color);
  }

  isStalemate(color) {
    return !this.isInCheck(color) && !this._hasAnyLegalMove(color);
  }

  _hasAnyLegalMove(color) {
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const p = this.squares[f][r];
        if (!p || p.color !== color) continue;
        const from = { file: f, rank: r };
        const targets = this._generateTargets(p.type, color, from);
        for (const to of targets) {
          const ep = this.enPassantTarget;
          const cap = !!this.getPiece(to.file, to.rank) ||
            (p.type === PieceType.PAWN && ep && to.file === ep.file && to.rank === ep.rank);
          if (this._canPieceReach(p.type, color, from, to, cap)) {
            const test = this.copy();
            test._executeMove({
              from, to, pieceType: p.type, promotion: null, capture: cap,
              castleKS: false, castleQS: false, notation: '',
            });
            if (!test.isInCheck(color)) return true;
          }
        }
      }
    }
    if (this._resolveCastle(true, color)) return true;
    if (this._resolveCastle(false, color)) return true;
    return false;
  }

  _generateTargets(type, color, from) {
    const targets = [];
    const f = from.file, r = from.rank;

    const addIf = (ff, rr) => { if (ff >= 0 && ff <= 7 && rr >= 0 && rr <= 7) targets.push({ file: ff, rank: rr }); };

    switch (type) {
      case PieceType.PAWN: {
        const dir = color === Color.WHITE ? 1 : -1;
        const startRank = color === Color.WHITE ? 1 : 6;
        addIf(f, r + dir);
        if (r === startRank) addIf(f, r + 2 * dir);
        addIf(f - 1, r + dir);
        addIf(f + 1, r + dir);
        break;
      }
      case PieceType.KNIGHT:
        for (const [df, dr] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
          addIf(f + df, r + dr);
        break;
      case PieceType.BISHOP:
        this._addSliding(targets, f, r, [[1,1],[1,-1],[-1,1],[-1,-1]]);
        break;
      case PieceType.ROOK:
        this._addSliding(targets, f, r, [[1,0],[-1,0],[0,1],[0,-1]]);
        break;
      case PieceType.QUEEN:
        this._addSliding(targets, f, r, [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
        break;
      case PieceType.KING:
        for (let df = -1; df <= 1; df++)
          for (let dr = -1; dr <= 1; dr++)
            if (df !== 0 || dr !== 0) addIf(f + df, r + dr);
        break;
    }
    return targets;
  }

  _addSliding(targets, f, r, directions) {
    for (const [df, dr] of directions) {
      let cf = f + df, cr = r + dr;
      while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
        targets.push({ file: cf, rank: cr });
        cf += df;
        cr += dr;
      }
    }
  }

  isFiftyMoveDraw() {
    return this.halfMoveClock >= 100;
  }

  /**
   * Returns all legal destination squares for a piece at (file, rank).
   * Used by the frontend for human-playable mode.
   */
  getLegalMoves(file, rank) {
    const piece = this.getPiece(file, rank);
    if (!piece) return [];

    const color = piece.color;
    const from = { file, rank };
    const targets = this._generateTargets(piece.type, color, from);
    const legalDests = [];

    for (const to of targets) {
      const ep = this.enPassantTarget;
      const cap = !!this.getPiece(to.file, to.rank) ||
        (piece.type === PieceType.PAWN && ep && to.file === ep.file && to.rank === ep.rank);
      if (this._canPieceReach(piece.type, color, from, to, cap)) {
        const test = this.copy();
        test._executeMove({
          from, to, pieceType: piece.type, promotion: null, capture: cap,
          castleKS: false, castleQS: false, notation: '',
        });
        if (!test.isInCheck(color)) {
          legalDests.push(to);
        }
      }
    }

    // Check castling for king
    if (piece.type === PieceType.KING) {
      const ks = this._resolveCastle(true, color);
      if (ks) legalDests.push(ks.to);
      const qs = this._resolveCastle(false, color);
      if (qs) legalDests.push(qs.to);
    }

    return legalDests;
  }

  /** Returns a serializable snapshot of the board for the frontend */
  toJSON() {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        const p = this.squares[f][r];
        row.push(p ? { type: p.type, color: p.color } : null);
      }
      rows.push(row);
    }
    return rows; // rows[0] = rank 8, rows[7] = rank 1
  }

  // Utility
  static _fromAlgebraic(s) {
    if (!s || s.length < 2) return null;
    const file = s.charCodeAt(0) - 97; // 'a'
    const rank = s.charCodeAt(1) - 49; // '1'
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return { file, rank };
  }
}
