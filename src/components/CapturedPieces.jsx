import React from 'react';
import { Box, HStack, Image, Text } from '@chakra-ui/react';

const PIECE_VALUES = { QUEEN: 9, ROOK: 5, BISHOP: 3, KNIGHT: 3, PAWN: 1 };
const PIECE_ORDER = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT', 'PAWN'];

const PIECE_IMAGES = {
  WHITE: { QUEEN: 'wQ', ROOK: 'wR', BISHOP: 'wB', KNIGHT: 'wN', PAWN: 'wP' },
  BLACK: { QUEEN: 'bQ', ROOK: 'bR', BISHOP: 'bB', KNIGHT: 'bN', PAWN: 'bP' },
};

function materialValue(pieces) {
  return pieces.reduce((sum, p) => sum + (PIECE_VALUES[p] || 0), 0);
}

/**
 * Displays captured pieces for one side, sorted by value.
 * `side` is the color of the captured pieces (e.g. "black" means pieces captured FROM black BY white).
 * `pieces` is an array of piece type strings like ["PAWN", "KNIGHT"].
 * `advantage` is the material advantage number to show (positive means this side is ahead).
 */
export default function CapturedPieces({ side, pieces, advantage }) {
  if (!pieces || pieces.length === 0) return <Box h="24px" />;

  // Sort by piece value descending
  const sorted = [...pieces].sort((a, b) => {
    const idxA = PIECE_ORDER.indexOf(a);
    const idxB = PIECE_ORDER.indexOf(b);
    return idxA - idxB;
  });

  const color = side === 'white' ? 'WHITE' : 'BLACK';

  return (
    <HStack spacing={0} minH="24px" align="center" flexWrap="wrap">
      {sorted.map((piece, i) => {
        const key = PIECE_IMAGES[color]?.[piece];
        if (!key) return null;
        return (
          <Image
            key={i}
            src={`/pieces/${key}.svg`}
            alt={key}
            w="20px"
            h="20px"
            ml={i > 0 ? '-4px' : '0'}
            filter="drop-shadow(0 1px 1px rgba(0,0,0,0.3))"
            opacity={0.85}
          />
        );
      })}
      {advantage > 0 && (
        <Text fontSize="xs" color="gray.400" ml={1} fontWeight="bold">
          +{advantage}
        </Text>
      )}
    </HStack>
  );
}

export { materialValue };
