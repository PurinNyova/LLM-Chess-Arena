// Piece types and colors for the chess engine

export const PieceType = {
  KING: 'KING',
  QUEEN: 'QUEEN',
  ROOK: 'ROOK',
  BISHOP: 'BISHOP',
  KNIGHT: 'KNIGHT',
  PAWN: 'PAWN',
};

export const Color = {
  WHITE: 'WHITE',
  BLACK: 'BLACK',
};

export function oppositeColor(color) {
  return color === Color.WHITE ? Color.BLACK : Color.WHITE;
}

export function colorName(color) {
  return color === Color.WHITE ? 'White' : 'Black';
}

/** Returns the algebraic symbol for a piece type (K, Q, R, B, N, '' for pawn) */
export function pieceSymbol(type) {
  switch (type) {
    case PieceType.KING: return 'K';
    case PieceType.QUEEN: return 'Q';
    case PieceType.ROOK: return 'R';
    case PieceType.BISHOP: return 'B';
    case PieceType.KNIGHT: return 'N';
    default: return '';
  }
}

/** Returns PieceType from algebraic symbol character */
export function pieceFromSymbol(ch) {
  switch (ch.toUpperCase()) {
    case 'K': return PieceType.KING;
    case 'Q': return PieceType.QUEEN;
    case 'R': return PieceType.ROOK;
    case 'B': return PieceType.BISHOP;
    case 'N': return PieceType.KNIGHT;
    default: return PieceType.PAWN;
  }
}

/** Returns Unicode chess symbol for display */
export function pieceUnicode(type, color) {
  const map = {
    WHITE: {
      KING: '♔', QUEEN: '♕', ROOK: '♖', BISHOP: '♗', KNIGHT: '♘', PAWN: '♙',
    },
    BLACK: {
      KING: '♚', QUEEN: '♛', ROOK: '♜', BISHOP: '♝', KNIGHT: '♞', PAWN: '♟',
    },
  };
  return map[color]?.[type] || '?';
}

/** Display char: uppercase for white, lowercase for black */
export function displayChar(type, color) {
  const ch = { KING: 'K', QUEEN: 'Q', ROOK: 'R', BISHOP: 'B', KNIGHT: 'N', PAWN: 'P' }[type] || '?';
  return color === Color.WHITE ? ch : ch.toLowerCase();
}
