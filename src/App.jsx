import React from 'react';
import { Box, Grid, GridItem, Heading, useColorModeValue } from '@chakra-ui/react';
import Chessboard from './components/Chessboard';
import ChatLog from './components/ChatLog';
import GameControls from './components/GameControls';
import CapturedPieces, { materialValue } from './components/CapturedPieces';
import { useGameStream } from './hooks/useGameStream';

export default function App() {
  const {
    board, turn, pgn, moveCount, result,
    whiteModel, blackModel, lastMove,
    chatLog, connected, gameActive, captured,
    startGame, resetGame, stopGame,
  } = useGameStream();

  const bgColor = useColorModeValue('gray.100', 'gray.900');

  // Material advantage calculation
  const whiteMat = materialValue(captured.white); // value of black pieces captured by white
  const blackMat = materialValue(captured.black); // value of white pieces captured by black
  const whiteAdvantage = whiteMat - blackMat;

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
              onStopGame={stopGame}
            />
          </Box>
          <Box display="flex" flexDirection="column" alignItems="center">
            {/* Captured pieces by black (white pieces taken) - shown above board */}
            <Box w="100%" maxW="576px" px={1} mb={1}>
              <CapturedPieces
                side="white"
                pieces={captured.black}
                advantage={whiteAdvantage < 0 ? -whiteAdvantage : 0}
              />
            </Box>
            <Chessboard board={board} lastMove={lastMove} />
            {/* Captured pieces by white (black pieces taken) - shown below board */}
            <Box w="100%" maxW="576px" px={1} mt={1}>
              <CapturedPieces
                side="black"
                pieces={captured.white}
                advantage={whiteAdvantage > 0 ? whiteAdvantage : 0}
              />
            </Box>
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
