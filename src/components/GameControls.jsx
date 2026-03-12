import React, { useCallback } from 'react';
import {
  Box,
  Button,
  HStack,
  Text,
  Badge,
  useToast,
  useDisclosure,
} from '@chakra-ui/react';
import { DownloadIcon } from '@chakra-ui/icons';
import StartControls from './StartControls';

export default function GameControls({
  turn,
  moveCount,
  result,
  whiteModel,
  blackModel,
  connected,
  gameActive,
  pgn,
  onStartGame,
  onResetGame,
  onStopGame,
}) {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const handleReset = async () => {
    await onResetGame();
    toast({ title: 'Game reset', status: 'info', duration: 2000 });
  };

  const moveNumber = Math.floor(moveCount / 2) + 1;

  /**
   * Build a chess.com-style PGN string with headers and export as .pgn file.
   */
  const exportPGN = useCallback(() => {
    // Determine Result tag
    let resultTag = '*';
    if (result) {
      const r = result.toLowerCase();
      if (r.includes('white wins') || (r.includes('white') && r.includes('checkmate') && !r.includes('black'))) {
        resultTag = '1-0';
      } else if (r.includes('black wins') || (r.includes('black') && r.includes('checkmate') && !r.includes('white'))) {
        resultTag = '0-1';
      } else if (r.includes('draw') || r.includes('stalemate')) {
        resultTag = '1/2-1/2';
      } else if (r.includes('forfeit')) {
        resultTag = (r.includes('white wins') || r.includes('black failed')) ? '1-0' : '0-1';
      }
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const headers = [
      `[Event "LLM Chess Arena"]`,
      `[Site "LLM Chess Arena"]`,
      `[Date "${dateStr}"]`,
      `[Round "?"]`,
      `[White "${whiteModel || 'Unknown'}"]`,
      `[Black "${blackModel || 'Unknown'}"]`,
      `[Result "${resultTag}"]`,
      `[UTCDate "${dateStr}"]`,
      `[UTCTime "${timeStr}"]`,
      `[Variant "Standard"]`,
      `[TimeControl "-"]`,
      `[ECO "?"]`,
      `[Termination "${result || 'Unknown'}"]`,
    ];

    // Wrap move text at ~80 chars per line (chess.com style)
    const moveText = pgn ? `${pgn} ${resultTag}` : resultTag;
    const words = moveText.split(' ');
    let lines = [];
    let currentLine = '';
    for (const word of words) {
      if (currentLine.length + word.length + 1 > 80 && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }
    if (currentLine) lines.push(currentLine);

    const pgnContent = headers.join('\n') + '\n\n' + lines.join('\n') + '\n';

    // Download as file
    const blob = new Blob([pgnContent], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(whiteModel || 'White').replace(/[^a-zA-Z0-9-_.]/g, '_')}_vs_${(blackModel || 'Black').replace(/[^a-zA-Z0-9-_.]/g, '_')}_${dateStr.replace(/\./g, '-')}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: 'PGN exported', status: 'success', duration: 2000 });
  }, [pgn, result, whiteModel, blackModel, toast]);

  return (
    <Box>
      {/* Status bar */}
      <HStack justify="space-between" mb={3} wrap="wrap" gap={2}>
        <HStack spacing={2}>
          <Badge colorScheme={connected ? 'green' : 'red'} variant="subtle">
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          {gameActive && !result && (
            <Badge colorScheme={turn === 'WHITE' ? 'yellow' : 'gray'} fontSize="sm">
              {turn === 'WHITE' ? '♔' : '♚'} {turn === 'WHITE' ? 'White' : 'Black'} to move
            </Badge>
          )}
          {result && (
            <Badge colorScheme="green" fontSize="sm">
              {result}
            </Badge>
          )}
        </HStack>

        <HStack spacing={2}>
          {moveCount > 0 && (
            <Text fontSize="xs" color="gray.400">
              Move {moveNumber} · {moveCount} half-moves
            </Text>
          )}
        </HStack>
      </HStack>

      {/* Player info */}
      {(whiteModel || blackModel) && (
        <HStack justify="space-between" mb={3} fontSize="xs" color="gray.400">
          <Text>♔ {whiteModel || '—'}</Text>
          <Text>vs</Text>
          <Text>♚ {blackModel || '—'}</Text>
        </HStack>
      )}

      {/* Action buttons */}
      <HStack spacing={2}>
        <Button
          colorScheme="green"
          size="sm"
          onClick={onOpen}
          isDisabled={gameActive && !result}
        >
          {result ? 'New Game' : 'Start Game'}
        </Button>
        {gameActive && !result && (
          <Button
            colorScheme="red"
            size="sm"
            onClick={async () => {
              await onStopGame();
              toast({ title: 'Game stopped', status: 'warning', duration: 2000 });
            }}
          >
            Stop Game
          </Button>
        )}
        <Button
          colorScheme="red"
          variant="outline"
          size="sm"
          onClick={handleReset}
          isDisabled={!gameActive && !result}
        >
          Reset
        </Button>
        {result && pgn && (
          <Button
            colorScheme="blue"
            size="sm"
            leftIcon={<DownloadIcon />}
            onClick={exportPGN}
          >
            Export PGN
          </Button>
        )}
      </HStack>

      {/* PGN display */}
      {pgn && (
        <Box mt={3} p={2} bg="whiteAlpha.50" borderRadius="md" maxH="80px" overflowY="auto">
          <Text fontSize="2xs" color="gray.500" mb={1} fontWeight="bold">PGN</Text>
          <Text fontSize="xs" fontFamily="mono" color="gray.300" whiteSpace="pre-wrap">
            {pgn}
          </Text>
        </Box>
      )}

      {/* Settings Modal */}
      <StartControls isOpen={isOpen} onClose={onClose} onStartGame={onStartGame} />
    </Box>
  );
}
