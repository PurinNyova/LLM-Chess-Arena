import React, { useState, useEffect, useRef } from 'react';
import { Box, HStack, Text } from '@chakra-ui/react';

function formatTime(ms) {
  if (ms == null) return '--:--';
  const totalSecs = Math.max(0, Math.ceil(ms / 1000));
  if (totalSecs < 60) {
    // Show SS.s when under 60s
    const tenths = Math.max(0, Math.floor(ms / 100));
    const secs = Math.floor(tenths / 10);
    const frac = tenths % 10;
    return `${secs}.${frac}`;
  }
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Chess clock display showing two countdown timers.
 * `clock`: { whiteTime: ms, blackTime: ms } | null
 * `turn`: 'WHITE' | 'BLACK'
 * `gameActive`: boolean
 * `result`: game result or null
 */
export default function ChessClock({ clock, turn, gameActive, result }) {
  if (!clock) return null;

  const [localWhite, setLocalWhite] = useState(clock.whiteTime);
  const [localBlack, setLocalBlack] = useState(clock.blackTime);
  const intervalRef = useRef(null);
  const lastSyncRef = useRef(Date.now());

  // Sync from server clock events
  useEffect(() => {
    setLocalWhite(clock.whiteTime);
    setLocalBlack(clock.blackTime);
    lastSyncRef.current = Date.now();
  }, [clock.whiteTime, clock.blackTime]);

  // Local tick for smooth countdown
  useEffect(() => {
    if (!gameActive || result) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastSyncRef.current;
      if (turn === 'WHITE') {
        setLocalWhite(Math.max(0, clock.whiteTime - elapsed));
      } else {
        setLocalBlack(Math.max(0, clock.blackTime - elapsed));
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [gameActive, result, turn, clock.whiteTime, clock.blackTime]);

  const isWhiteActive = gameActive && !result && turn === 'WHITE';
  const isBlackActive = gameActive && !result && turn === 'BLACK';
  const whiteUrgent = localWhite < 30000 && localWhite > 0;
  const blackUrgent = localBlack < 30000 && localBlack > 0;

  return (
    <HStack spacing={4} justify="center" w="100%">
      <ClockFace
        label="♔ White"
        time={localWhite}
        isActive={isWhiteActive}
        isUrgent={whiteUrgent}
      />
      <ClockFace
        label="♚ Black"
        time={localBlack}
        isActive={isBlackActive}
        isUrgent={blackUrgent}
      />
    </HStack>
  );
}

function ClockFace({ label, time, isActive, isUrgent }) {
  return (
    <Box
      bg={isActive ? (isUrgent ? 'red.700' : 'green.700') : 'gray.700'}
      px={4}
      py={2}
      borderRadius="md"
      minW="120px"
      textAlign="center"
      opacity={isActive ? 1 : 0.6}
      transition="all 0.2s"
      boxShadow={isActive ? '0 0 8px rgba(72,187,120,0.4)' : 'none'}
    >
      <Text fontSize="2xs" color="gray.300" fontWeight="bold">
        {label}
      </Text>
      <Text
        fontSize="xl"
        fontFamily="mono"
        fontWeight="bold"
        color={isUrgent && isActive ? 'red.200' : 'white'}
        animation={isUrgent && isActive ? 'pulse 1s infinite' : 'none'}
      >
        {formatTime(time)}
      </Text>
    </Box>
  );
}
