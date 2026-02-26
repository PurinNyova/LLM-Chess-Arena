/**
 * Tracks move history and produces PGN-formatted output.
 */
export class MoveHistory {
  constructor() {
    this.moves = [];
  }

  addMove(notation) {
    this.moves.push(notation);
  }

  getMoveCount() {
    return this.moves.length;
  }

  toPGN() {
    if (this.moves.length === 0) return '';
    let sb = '';
    for (let i = 0; i < this.moves.length; i++) {
      if (i % 2 === 0) {
        if (i > 0) sb += ' ';
        sb += `${Math.floor(i / 2) + 1}. `;
      } else {
        sb += ' ';
      }
      sb += this.moves[i];
    }
    return sb;
  }

  getLastMove() {
    if (this.moves.length === 0) return null;
    return this.moves[this.moves.length - 1];
  }
}
