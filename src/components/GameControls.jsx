import React, { useState } from 'react';
import {
  Box,
  Button,
  HStack,
  VStack,
  Text,
  Badge,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
  Input,
  Divider,
} from '@chakra-ui/react';

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
}) {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [config, setConfig] = useState({
    whiteApiUrl: '',
    whiteApiKey: '',
    whiteModel: '',
    blackApiUrl: '',
    blackApiKey: '',
    blackModel: '',
  });

  const handleStart = async () => {
    try {
      // Only send non-empty fields (server will use .env fallbacks)
      const body = {};
      for (const [k, v] of Object.entries(config)) {
        if (v.trim()) body[k] = v.trim();
      }
      await onStartGame(body);
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to start game',
        description: err.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleReset = async () => {
    await onResetGame();
    toast({ title: 'Game reset', status: 'info', duration: 2000 });
  };

  const moveNumber = Math.floor(moveCount / 2) + 1;

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
        <Button
          colorScheme="red"
          variant="outline"
          size="sm"
          onClick={handleReset}
          isDisabled={!gameActive && !result}
        >
          Reset
        </Button>
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
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader>Game Settings</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="xs" color="gray.400" mb={4}>
              Leave fields empty to use values from the server's .env file.
            </Text>

            <Text fontWeight="bold" mb={2}>♔ White Player</Text>
            <VStack spacing={2} mb={4}>
              <FormControl size="sm">
                <FormLabel fontSize="xs">API URL</FormLabel>
                <Input
                  size="sm"
                  placeholder="https://api.openai.com/v1/chat/completions"
                  value={config.whiteApiUrl}
                  onChange={e => setConfig(c => ({ ...c, whiteApiUrl: e.target.value }))}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs">API Key</FormLabel>
                <Input
                  size="sm"
                  type="password"
                  placeholder="sk-..."
                  value={config.whiteApiKey}
                  onChange={e => setConfig(c => ({ ...c, whiteApiKey: e.target.value }))}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs">Model</FormLabel>
                <Input
                  size="sm"
                  placeholder="gpt-4"
                  value={config.whiteModel}
                  onChange={e => setConfig(c => ({ ...c, whiteModel: e.target.value }))}
                />
              </FormControl>
            </VStack>

            <Divider my={3} />

            <Text fontWeight="bold" mb={2}>♚ Black Player</Text>
            <VStack spacing={2}>
              <FormControl>
                <FormLabel fontSize="xs">API URL</FormLabel>
                <Input
                  size="sm"
                  placeholder="https://api.openai.com/v1/chat/completions"
                  value={config.blackApiUrl}
                  onChange={e => setConfig(c => ({ ...c, blackApiUrl: e.target.value }))}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs">API Key</FormLabel>
                <Input
                  size="sm"
                  type="password"
                  placeholder="sk-..."
                  value={config.blackApiKey}
                  onChange={e => setConfig(c => ({ ...c, blackApiKey: e.target.value }))}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs">Model</FormLabel>
                <Input
                  size="sm"
                  placeholder="gpt-4"
                  value={config.blackModel}
                  onChange={e => setConfig(c => ({ ...c, blackModel: e.target.value }))}
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
            <Button colorScheme="green" onClick={handleStart}>
              Start Game
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
