import React from 'react';
import { Box, Grid, GridItem, Heading, useColorModeValue } from '@chakra-ui/react';
import Chessboard from './components/Chessboard';
import ChatLog from './components/ChatLog';
import GameControls from './components/GameControls';
import { useGameStream } from './hooks/useGameStream';

export default function App() {
  const {
    board, turn, pgn, moveCount, result,
    whiteModel, blackModel, lastMove,
    chatLog, connected, gameActive,
    startGame, resetGame,
  } = useGameStream();

  const bgColor = useColorModeValue('gray.100', 'gray.900');

  return (
    <Box bg={bgColor} minH="100vh" p={4}>
      {/* Title */}
      <Heading size="md" mb={4} textAlign="center" color="gray.300">
        ♟ LLM Chess Arena
      </Heading>

      {/* Main layout: board left, chat right */}
      <Grid
        templateColumns={{ base: '1fr', lg: '1fr 1fr' }}
        gap={6}
        maxW="1400px"
        mx="auto"
      >
        {/* Left: Board + Controls */}
        <GridItem>
          <Box mb={4}>
            <GameControls
              turn={turn}
              moveCount={moveCount}
              result={result}
              whiteModel={whiteModel}
              blackModel={blackModel}
              connected={connected}
              gameActive={gameActive}
              pgn={pgn}
              onStartGame={startGame}
              onResetGame={resetGame}
            />
          </Box>
          <Box display="flex" justifyContent="center">
            <Chessboard board={board} lastMove={lastMove} />
          </Box>
        </GridItem>

        {/* Right: Chat log */}
        <GridItem h={{ base: '400px', lg: '700px' }}>
          <ChatLog chatLog={chatLog} />
        </GridItem>
      </Grid>
    </Box>
  );
}
