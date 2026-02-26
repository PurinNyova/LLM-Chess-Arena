import React, { useState, useCallback } from 'react';
import { Box, Image } from '@chakra-ui/react';

// Map piece color+type to SVG filenames in /pieces/
const PIECE_IMAGES = {
  WHITE: { KING: 'wK', QUEEN: 'wQ', ROOK: 'wR', BISHOP: 'wB', KNIGHT: 'wN', PAWN: 'wP' },
  BLACK: { KING: 'bK', QUEEN: 'bQ', ROOK: 'bR', BISHOP: 'bB', KNIGHT: 'bN', PAWN: 'bP' },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

// chess.com-style colors
const COLORS = {
  light: '#EBECD0',
  dark: '#779556',
  highlightLight: '#F5F682',
  highlightDark: '#BBCC44',
  coordLight: '#779556',   // dark color on light squares
  coordDark: '#EBECD0',    // light color on dark squares
  selectedLight: '#BACA2B',
  selectedDark: '#8FA424',
  legalDot: 'rgba(0,0,0,0.2)',
  legalCapture: 'rgba(0,0,0,0.2)',
};

/**
 * Renders the 8x8 chessboard styled like chess.com with embedded coordinates.
 * board: 2D array [row][col], row 0 = rank 8, row 7 = rank 1
 * lastMove: { from: { file, rank }, to: { file, rank } } | null
 * isHumanTurn: whether the human can interact
 * humanColor: 'WHITE' or 'BLACK' — used to determine board orientation
 * onSubmitMove: (notation: string) => void
 * flipped: whether to flip the board (for black player)
 */
export default function Chessboard({ board, lastMove, isHumanTurn, humanColor, onSubmitMove, flipped, sessionToken }) {
  const [selectedSquare, setSelectedSquare] = useState(null); // { row, col } in display coords
  const [legalMoves, setLegalMoves] = useState([]); // [{ file, rank }]

  if (!board) return null;

  // Determine display order
  const rowOrder = flipped ? [...Array(8).keys()] : [...Array(8).keys()]; // 0..7
  const colOrder = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const displayRanks = flipped ? ['1', '2', '3', '4', '5', '6', '7', '8'] : RANKS;
  const displayFiles = flipped ? [...FILES].reverse() : FILES;

  // Convert display row/col to board file/rank
  const toFileRank = (displayRow, displayCol) => {
    const actualRow = flipped ? (7 - displayRow) : displayRow;
    const actualCol = flipped ? (7 - displayCol) : displayCol;
    const file = actualCol;
    const rank = 7 - actualRow;
    return { file, rank };
  };

  const highlights = new Set();
  if (lastMove) {
    // Convert file/rank to display row/col
    const fromRow = flipped ? lastMove.from.rank : (7 - lastMove.from.rank);
    const fromCol = flipped ? (7 - lastMove.from.file) : lastMove.from.file;
    const toRow = flipped ? lastMove.to.rank : (7 - lastMove.to.rank);
    const toCol = flipped ? (7 - lastMove.to.file) : lastMove.to.file;
    highlights.add(`${fromRow},${fromCol}`);
    highlights.add(`${toRow},${toCol}`);
  }

  const selectedKey = selectedSquare ? `${selectedSquare.row},${selectedSquare.col}` : null;

  // Legal move lookup set (in display coords)
  const legalMoveSet = new Set();
  for (const m of legalMoves) {
    const row = flipped ? m.rank : (7 - m.rank);
    const col = flipped ? (7 - m.file) : m.file;
    legalMoveSet.add(`${row},${col}`);
  }

  const handleSquareClick = async (displayRow, displayCol) => {
    if (!isHumanTurn) return;

    const { file, rank } = toFileRank(displayRow, displayCol);
    const actualRow = flipped ? (7 - displayRow) : displayRow;
    const actualCol = flipped ? (7 - displayCol) : displayCol;
    const piece = board[actualRow]?.[actualCol];

    // If clicking on a legal move destination, submit the move
    if (selectedSquare && legalMoveSet.has(`${displayRow},${displayCol}`)) {
      const { file: fromFile, rank: fromRank } = toFileRank(selectedSquare.row, selectedSquare.col);
      const fromActualRow = flipped ? (7 - selectedSquare.row) : selectedSquare.row;
      const fromActualCol = flipped ? (7 - selectedSquare.col) : selectedSquare.col;
      const fromPiece = board[fromActualRow]?.[fromActualCol];

      // Build algebraic notation
      const notation = buildNotation(fromPiece, fromFile, fromRank, file, rank, board, actualRow, actualCol, flipped);

      setSelectedSquare(null);
      setLegalMoves([]);

      try {
        await onSubmitMove(notation);
      } catch (err) {
        console.error('Move failed:', err.message);
      }
      return;
    }

    // Check if clicking on own piece
    if (piece && piece.color === humanColor) {
      setSelectedSquare({ row: displayRow, col: displayCol });
      // Fetch legal moves
      try {
        const res = await fetch(`/api/game/legal-moves?file=${file}&rank=${rank}&token=${encodeURIComponent(sessionToken || '')}`);
        const data = await res.json();
        setLegalMoves(data.moves || []);
      } catch {
        setLegalMoves([]);
      }
      return;
    }

    // Clicking empty square or opponent piece (not a legal dest) → deselect
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  const squareSize = { base: '44px', md: '60px', lg: '72px' };
  const coordSize = { base: '9px', md: '11px', lg: '12px' };

  return (
    <Box
      borderRadius="4px"
      overflow="hidden"
      boxShadow="0 2px 12px rgba(0,0,0,0.4)"
      display="inline-block"
    >
      {board.map((_, displayRowIdx) => (
        <Box key={displayRowIdx} display="flex">
          {board[0].map((_, displayColIdx) => {
            const actualRow = flipped ? (7 - displayRowIdx) : displayRowIdx;
            const actualCol = flipped ? (7 - displayColIdx) : displayColIdx;
            const piece = board[actualRow]?.[actualCol];

            const isLight = (actualRow + actualCol) % 2 === 0;
            const key = `${displayRowIdx},${displayColIdx}`;
            const isHighlighted = highlights.has(key);
            const isSelected = selectedKey === key;
            const isLegalDest = legalMoveSet.has(key);
            const hasPieceOnLegalDest = isLegalDest && piece;

            let bg;
            if (isSelected) {
              bg = isLight ? COLORS.selectedLight : COLORS.selectedDark;
            } else if (isHighlighted) {
              bg = isLight ? COLORS.highlightLight : COLORS.highlightDark;
            } else {
              bg = isLight ? COLORS.light : COLORS.dark;
            }

            const coordColor = isLight ? COLORS.coordLight : COLORS.coordDark;

            // Rank number on left column
            const showRank = displayColIdx === 0;
            // File letter on bottom row
            const showFile = displayRowIdx === 7;

            const pieceKey = piece ? PIECE_IMAGES[piece.color]?.[piece.type] : null;
            const clickable = isHumanTurn && (
              (piece && piece.color === humanColor) || isLegalDest
            );

            return (
              <Box
                key={displayColIdx}
                bg={bg}
                w={squareSize}
                h={squareSize}
                position="relative"
                display="flex"
                alignItems="center"
                justifyContent="center"
                userSelect="none"
                cursor={clickable ? 'pointer' : 'default'}
                onClick={() => handleSquareClick(displayRowIdx, displayColIdx)}
              >
                {/* Rank label */}
                {showRank && (
                  <Box
                    position="absolute"
                    top="2px"
                    left="3px"
                    fontSize={coordSize}
                    fontWeight="700"
                    lineHeight="1"
                    color={coordColor}
                    fontFamily="'Segoe UI', system-ui, sans-serif"
                    zIndex="1"
                  >
                    {displayRanks[displayRowIdx]}
                  </Box>
                )}

                {/* File label */}
                {showFile && (
                  <Box
                    position="absolute"
                    bottom="1px"
                    right="3px"
                    fontSize={coordSize}
                    fontWeight="700"
                    lineHeight="1"
                    color={coordColor}
                    fontFamily="'Segoe UI', system-ui, sans-serif"
                    zIndex="1"
                  >
                    {displayFiles[displayColIdx]}
                  </Box>
                )}

                {/* Legal move dot (empty square) */}
                {isLegalDest && !piece && (
                  <Box
                    position="absolute"
                    w="26%"
                    h="26%"
                    borderRadius="50%"
                    bg={COLORS.legalDot}
                    zIndex="2"
                  />
                )}

                {/* Legal capture ring (square with opponent piece) */}
                {hasPieceOnLegalDest && (
                  <Box
                    position="absolute"
                    w="100%"
                    h="100%"
                    borderRadius="50%"
                    border="5px solid"
                    borderColor={COLORS.legalCapture}
                    zIndex="2"
                  />
                )}

                {/* Piece image */}
                {pieceKey && (
                  <Image
                    src={`/pieces/${pieceKey}.svg`}
                    alt={pieceKey}
                    w={{ base: '36px', md: '50px', lg: '62px' }}
                    h={{ base: '36px', md: '50px', lg: '62px' }}
                    draggable={false}
                    pointerEvents="none"
                    filter="drop-shadow(0 1px 2px rgba(0,0,0,0.3))"
                  />
                )}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Build algebraic notation from move details.
 * This is a simplified builder — the server will validate and correct.
 */
function buildNotation(piece, fromFile, fromRank, toFile, toRank, board, toDisplayRow, toDisplayCol, flipped) {
  if (!piece) return '';

  const fileChar = (f) => String.fromCharCode(97 + f);

  // Castling detection
  if (piece.type === 'KING' && Math.abs(toFile - fromFile) === 2) {
    return toFile > fromFile ? 'O-O' : 'O-O-O';
  }

  const actualRow = flipped ? (7 - toDisplayRow) : toDisplayRow;
  const actualCol = flipped ? (7 - toDisplayCol) : toDisplayCol;
  const destPiece = board[actualRow]?.[actualCol];
  const isCapture = !!destPiece;

  let notation = '';

  if (piece.type === 'PAWN') {
    if (isCapture || fromFile !== toFile) {
      notation = `${fileChar(fromFile)}x${fileChar(toFile)}${toRank + 1}`;
    } else {
      notation = `${fileChar(toFile)}${toRank + 1}`;
    }
    // Auto-promote to queen
    if ((piece.color === 'WHITE' && toRank === 7) || (piece.color === 'BLACK' && toRank === 0)) {
      notation += '=Q';
    }
  } else {
    const pieceSymbol = { KING: 'K', QUEEN: 'Q', ROOK: 'R', BISHOP: 'B', KNIGHT: 'N' }[piece.type] || '';
    const capture = isCapture ? 'x' : '';
    // Add file disambiguation for now — the server parser handles ambiguity
    notation = `${pieceSymbol}${fileChar(fromFile)}${capture}${fileChar(toFile)}${toRank + 1}`;
  }

  return notation;
}
