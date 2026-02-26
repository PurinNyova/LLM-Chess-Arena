import React from 'react';
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
};

/**
 * Renders the 8x8 chessboard styled like chess.com with embedded coordinates.
 * board: 2D array [row][col], row 0 = rank 8, row 7 = rank 1
 * lastMove: { from: { file, rank }, to: { file, rank } } | null
 */
export default function Chessboard({ board, lastMove }) {
  if (!board) return null;

  const highlights = new Set();
  if (lastMove) {
    highlights.add(`${7 - lastMove.from.rank},${lastMove.from.file}`);
    highlights.add(`${7 - lastMove.to.rank},${lastMove.to.file}`);
  }

  const squareSize = { base: '44px', md: '60px', lg: '72px' };
  const coordSize = { base: '9px', md: '11px', lg: '12px' };

  return (
    <Box
      borderRadius="4px"
      overflow="hidden"
      boxShadow="0 2px 12px rgba(0,0,0,0.4)"
      display="inline-block"
    >
      {board.map((row, rowIdx) => (
        <Box key={rowIdx} display="flex">
          {row.map((piece, colIdx) => {
            const isLight = (rowIdx + colIdx) % 2 === 0;
            const isHighlighted = highlights.has(`${rowIdx},${colIdx}`);

            let bg;
            if (isHighlighted) {
              bg = isLight ? COLORS.highlightLight : COLORS.highlightDark;
            } else {
              bg = isLight ? COLORS.light : COLORS.dark;
            }

            const coordColor = isLight ? COLORS.coordLight : COLORS.coordDark;

            // Rank number on left column (file a)
            const showRank = colIdx === 0;
            // File letter on bottom row (rank 1)
            const showFile = rowIdx === 7;

            const pieceKey = piece ? PIECE_IMAGES[piece.color]?.[piece.type] : null;

            return (
              <Box
                key={colIdx}
                bg={bg}
                w={squareSize}
                h={squareSize}
                position="relative"
                display="flex"
                alignItems="center"
                justifyContent="center"
                userSelect="none"
                cursor="default"
              >
                {/* Rank label (top-left of leftmost squares) */}
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
                    {RANKS[rowIdx]}
                  </Box>
                )}

                {/* File label (bottom-right of bottom squares) */}
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
                    {FILES[colIdx]}
                  </Box>
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
