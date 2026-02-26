import React, { useRef, useEffect, useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Badge,
  Collapse,
  IconButton,
  HStack,
  Divider,
  useColorModeValue,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';

function ThinkingBlock({ text }) {
  const [isOpen, setIsOpen] = useState(false);
  const bg = useColorModeValue('gray.50', 'gray.700');

  if (!text) return null;

  return (
    <Box mt={1}>
      <HStack
        spacing={1}
        cursor="pointer"
        onClick={() => setIsOpen(!isOpen)}
        _hover={{ opacity: 0.8 }}
      >
        <Badge colorScheme="purple" fontSize="2xs">THINKING</Badge>
        <IconButton
          icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          size="xs"
          variant="ghost"
          aria-label="Toggle thinking"
        />
      </HStack>
      <Collapse in={isOpen}>
        <Box
          bg={bg}
          p={2}
          borderRadius="md"
          fontSize="xs"
          fontFamily="mono"
          whiteSpace="pre-wrap"
          maxH="200px"
          overflowY="auto"
          mt={1}
        >
          {text}
        </Box>
      </Collapse>
    </Box>
  );
}

function ChatEntry({ entry }) {
  const whiteBg = useColorModeValue('white', 'gray.800');
  const blackBg = useColorModeValue('gray.100', 'gray.700');

  if (entry.type === 'status') {
    return (
      <Box px={3} py={1}>
        <Text fontSize="xs" color="gray.500" fontStyle="italic" textAlign="center">
          {entry.message}
        </Text>
      </Box>
    );
  }

  if (entry.type === 'gameOver') {
    return (
      <Box px={3} py={2} bg="green.800" borderRadius="md" mx={2}>
        <Text fontSize="sm" fontWeight="bold" color="white" textAlign="center">
          🏁 {entry.result}
        </Text>
      </Box>
    );
  }

  if (entry.type === 'error') {
    return (
      <Box px={3} py={1} mx={2} bg="red.900" borderRadius="md">
        <HStack>
          <Badge colorScheme="red" fontSize="2xs">ERROR</Badge>
          <Text fontSize="xs" color="red.200">
            {entry.message} (attempt {entry.attempt}/{entry.maxRetries})
          </Text>
        </HStack>
      </Box>
    );
  }

  if (entry.type === 'thinking') {
    // Streaming thinking — show inline
    const isWhite = entry.color === 'WHITE';
    return (
      <Box
        px={3} py={2} mx={2}
        bg={isWhite ? whiteBg : blackBg}
        borderRadius="md"
        borderLeft="3px solid"
        borderLeftColor={isWhite ? 'white' : 'gray.500'}
      >
        <HStack mb={1}>
          <Badge colorScheme={isWhite ? 'yellow' : 'gray'} fontSize="2xs">
            {isWhite ? '♔' : '♚'} {entry.model}
          </Badge>
          <Badge colorScheme="purple" fontSize="2xs">THINKING...</Badge>
        </HStack>
        <Box fontSize="xs" fontFamily="mono" whiteSpace="pre-wrap" color="gray.400" maxH="100px" overflowY="auto">
          {entry.text}
        </Box>
      </Box>
    );
  }

  if (entry.type === 'chat') {
    const isWhite = entry.color === 'WHITE';
    return (
      <Box
        px={3}
        py={2}
        mx={2}
        ml={isWhite ? 2 : 'auto'}
        mr={isWhite ? 'auto' : 2}
        maxW="85%"
        bg={isWhite ? whiteBg : blackBg}
        borderRadius="lg"
        borderTopLeftRadius={isWhite ? 'sm' : 'lg'}
        borderTopRightRadius={isWhite ? 'lg' : 'sm'}
        boxShadow="sm"
      >
        <HStack mb={1} justify="space-between">
          <HStack>
            <Badge colorScheme={isWhite ? 'yellow' : 'gray'} fontSize="2xs">
              {isWhite ? '♔' : '♚'} {entry.model}
            </Badge>
            <Text fontSize="2xs" color="gray.500">
              Move {entry.moveNumber}{entry.attempt > 1 ? ` (attempt ${entry.attempt})` : ''}
            </Text>
          </HStack>
        </HStack>

        {entry.dialogue && (
          <Text fontSize="sm" mb={2} fontStyle="italic" color={isWhite ? 'gray.300' : 'gray.200'}>
            "{entry.dialogue}"
          </Text>
        )}

        <Badge colorScheme="green" fontSize="sm" fontFamily="mono" px={2} py={0.5} borderRadius="md">
          {entry.move}
        </Badge>

        <ThinkingBlock text={entry.thinking} />
      </Box>
    );
  }

  return null;
}

export default function ChatLog({ chatLog }) {
  const bottomRef = useRef(null);
  const containerBg = useColorModeValue('gray.50', 'gray.900');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  return (
    <Box
      h="100%"
      bg={containerBg}
      borderRadius="lg"
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      <Box
        px={4}
        py={2}
        borderBottom="1px solid"
        borderColor="whiteAlpha.200"
      >
        <Text fontSize="sm" fontWeight="bold" color="gray.300">
          LLM Chat Log
        </Text>
      </Box>

      <VStack
        flex="1"
        overflowY="auto"
        spacing={2}
        py={2}
        align="stretch"
        sx={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { bg: 'gray.600', borderRadius: 'full' },
        }}
      >
        {chatLog.length === 0 && (
          <Text fontSize="sm" color="gray.500" textAlign="center" mt={8}>
            Start a game to see the LLM conversation here.
          </Text>
        )}
        {chatLog.map(entry => (
          <ChatEntry key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </VStack>
    </Box>
  );
}
