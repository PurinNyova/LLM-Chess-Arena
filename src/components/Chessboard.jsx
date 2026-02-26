import React from 'react';
import { Grid, GridItem, Box } from '@chakra-ui/react';

const PIECE_UNICODE = {
  WHITE: { KING: '♔', QUEEN: '♕', ROOK: '♖', BISHOP: '♗', KNIGHT: '♘', PAWN: '♙' },
  BLACK: { KING: '♚', QUEEN: '♛', ROOK: '♜', BISHOP: '♝', KNIGHT: '♞', PAWN: '♟' },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

/**
 * Renders the 8x8 chessboard with pieces.
 * board: 2D array [row][col], row 0 = rank 8, row 7 = rank 1
 * lastMove: { from: { file, rank }, to: { file, rank } } | null
 */
export default function Chessboard({ board, lastMove }) {
  if (!board) return null;

  // Convert lastMove to row/col highlights
  const highlights = new Set();
  if (lastMove) {
    // from: file/rank => row = 7 - rank, col = file
    highlights.add(`${7 - lastMove.from.rank},${lastMove.from.file}`);
    highlights.add(`${7 - lastMove.to.rank},${lastMove.to.file}`);
  }

  return (
    <Box>
      {/* Top file labels */}
      <Grid templateColumns="28px repeat(8, 1fr)" mb="2px">
        <Box />
        {FILES.map(f => (
          <Box key={f} textAlign="center" fontSize="xs" color="gray.400" fontWeight="bold">
            {f}
          </Box>
        ))}
      </Grid>

      {/* Board rows */}
      {board.map((row, rowIdx) => (
        <Grid key={rowIdx} templateColumns="28px repeat(8, 1fr)">
          {/* Rank label */}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
            color="gray.400"
            fontWeight="bold"
          >
            {RANKS[rowIdx]}
          </Box>

          {/* Squares */}
          {row.map((piece, colIdx) => {
            const isLight = (rowIdx + colIdx) % 2 === 0;
            const isHighlighted = highlights.has(`${rowIdx},${colIdx}`);

            let bg;
            if (isHighlighted) {
              bg = isLight ? 'board.highlightLight' : 'board.highlightDark';
            } else {
              bg = isLight ? 'board.light' : 'board.dark';
            }

            return (
              <Box
                key={colIdx}
                bg={bg}
                w={{ base: '40px', md: '56px', lg: '64px' }}
                h={{ base: '40px', md: '56px', lg: '64px' }}
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize={{ base: '24px', md: '34px', lg: '40px' }}
                lineHeight="1"
                userSelect="none"
                cursor="default"
                transition="background 0.15s"
              >
                {piece ? PIECE_UNICODE[piece.color]?.[piece.type] || '' : ''}
              </Box>
            );
          })}
        </Grid>
      ))}

      {/* Bottom file labels */}
      <Grid templateColumns="28px repeat(8, 1fr)" mt="2px">
        <Box />
        {FILES.map(f => (
          <Box key={f} textAlign="center" fontSize="xs" color="gray.400" fontWeight="bold">
            {f}
          </Box>
        ))}
      </Grid>
    </Box>
  );
}
