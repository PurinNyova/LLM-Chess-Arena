import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Select,
  Divider,
  Icon,
  Spinner,
} from '@chakra-ui/react';
import { DownloadIcon } from '@chakra-ui/icons';

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

  const [config, setConfig] = useState({
    whiteApiUrl: '',
    whiteApiKey: '',
    whiteModel: '',
    blackApiUrl: '',
    blackApiKey: '',
    blackModel: '',
    baseTime: '10',
    increment: '0',
    unlimited: true,
    playerMode: 'llm_vs_llm', // 'llm_vs_llm', 'human_white', 'human_black'
    whiteProvider: 'purinnyova', // 'purinnyova' or 'custom'
    blackProvider: 'purinnyova',
  });

  // Model list fetching
  const [whiteModels, setWhiteModels] = useState([]);
  const [blackModels, setBlackModels] = useState([]);
  const [defaultModels, setDefaultModels] = useState([]);
  const [whiteModelsLoading, setWhiteModelsLoading] = useState(false);
  const [blackModelsLoading, setBlackModelsLoading] = useState(false);
  const [defaultModelsLoading, setDefaultModelsLoading] = useState(false);
  const [whiteModelsFailed, setWhiteModelsFailed] = useState(false);
  const [blackModelsFailed, setBlackModelsFailed] = useState(false);
  const [defaultModelsFailed, setDefaultModelsFailed] = useState(false);
  const whiteDebounce = useRef(null);
  const blackDebounce = useRef(null);
  const defaultModelsFetched = useRef(false);

  const fetchModels = useCallback(async (apiUrl, apiKey, side) => {
    const setModels = side === 'white' ? setWhiteModels : setBlackModels;
    const setLoading = side === 'white' ? setWhiteModelsLoading : setBlackModelsLoading;
    const setFailed = side === 'white' ? setWhiteModelsFailed : setBlackModelsFailed;

    if (!apiUrl || !apiKey) {
      setModels([]);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiUrl, apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.models) {
        setModels(data.models);
        setFailed(false);
      } else {
        setModels([]);
        setFailed(true);
      }
    } catch {
      setModels([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch models for the PurinNyova API preset (server .env credentials)
  const fetchDefaultModels = useCallback(async () => {
    if (defaultModelsFetched.current) return;
    defaultModelsFetched.current = true;
    setDefaultModelsLoading(true);
    setDefaultModelsFailed(false);
    try {
      const res = await fetch('/api/models/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (res.ok && data.models) {
        setDefaultModels(data.models);
        setDefaultModelsFailed(false);
      } else {
        setDefaultModels([]);
        setDefaultModelsFailed(true);
      }
    } catch {
      setDefaultModels([]);
      setDefaultModelsFailed(true);
    } finally {
      setDefaultModelsLoading(false);
    }
  }, []);

  // Fetch default models when modal opens
  useEffect(() => {
    if (isOpen) fetchDefaultModels();
  }, [isOpen, fetchDefaultModels]);

  // Debounced model fetching for white
  useEffect(() => {
    clearTimeout(whiteDebounce.current);
    whiteDebounce.current = setTimeout(() => {
      fetchModels(config.whiteApiUrl, config.whiteApiKey, 'white');
    }, 500);
    return () => clearTimeout(whiteDebounce.current);
  }, [config.whiteApiUrl, config.whiteApiKey, fetchModels]);

  // Debounced model fetching for black
  useEffect(() => {
    clearTimeout(blackDebounce.current);
    blackDebounce.current = setTimeout(() => {
      fetchModels(config.blackApiUrl, config.blackApiKey, 'black');
    }, 500);
    return () => clearTimeout(blackDebounce.current);
  }, [config.blackApiUrl, config.blackApiKey, fetchModels]);

  const handleStart = async () => {
    try {
      const body = {};

      // White side config — only send custom API fields when provider is 'custom'
      if (config.playerMode !== 'human_white') {
        if (config.whiteProvider === 'custom') {
          if (config.whiteApiUrl.trim()) body.whiteApiUrl = config.whiteApiUrl.trim();
          if (config.whiteApiKey.trim()) body.whiteApiKey = config.whiteApiKey.trim();
        }
        // Always send model (from either provider mode)
        if (config.whiteModel.trim()) body.whiteModel = config.whiteModel.trim();
      }

      // Black side config
      if (config.playerMode !== 'human_black') {
        if (config.blackProvider === 'custom') {
          if (config.blackApiUrl.trim()) body.blackApiUrl = config.blackApiUrl.trim();
          if (config.blackApiKey.trim()) body.blackApiKey = config.blackApiKey.trim();
        }
        if (config.blackModel.trim()) body.blackModel = config.blackModel.trim();
      }

      // Time control
      if (!config.unlimited) {
        body.baseTime = parseFloat(config.baseTime) || 10;
        body.increment = parseFloat(config.increment) || 0;
      }
      // Player mode / human side
      if (config.playerMode === 'human_white') {
        body.humanSide = 'WHITE';
      } else if (config.playerMode === 'human_black') {
        body.humanSide = 'BLACK';
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
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader>Game Settings</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="xs" color="gray.400" mb={4}>
              Select "PurinNyova API" to use server credentials, or "Custom" for your own.
            </Text>

            <FormControl mb={4}>
              <FormLabel fontSize="xs" fontWeight="bold">Player Mode</FormLabel>
              <Select
                size="sm"
                value={config.playerMode}
                onChange={e => setConfig(c => ({ ...c, playerMode: e.target.value }))}
              >
                <option value="llm_vs_llm">LLM vs LLM</option>
                <option value="human_white">Human (White) vs LLM (Black)</option>
                <option value="human_black">LLM (White) vs Human (Black)</option>
              </Select>
            </FormControl>

            <Divider my={3} />

            {config.playerMode !== 'human_white' && (
              <>
                <Text fontWeight="bold" mb={2}>♔ White Player</Text>
            <VStack spacing={2} mb={4}>
              <FormControl size="sm">
                <FormLabel fontSize="xs">API Provider</FormLabel>
                <Select
                  size="sm"
                  value={config.whiteProvider}
                  onChange={e => setConfig(c => ({ ...c, whiteProvider: e.target.value }))}
                >
                  <option value="purinnyova">PurinNyova API</option>
                  <option value="custom">Custom</option>
                </Select>
              </FormControl>
              {config.whiteProvider === 'custom' && (
                <>
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
                </>
              )}
              <FormControl>
                <FormLabel fontSize="xs">
                  Model {config.whiteProvider === 'purinnyova' ? (defaultModelsLoading && <Spinner size="xs" ml={1} />) : (whiteModelsLoading && <Spinner size="xs" ml={1} />)}
                </FormLabel>
                {config.whiteProvider === 'purinnyova' ? (
                  defaultModels.length > 0 && !defaultModelsFailed ? (
                    <Select
                      size="sm"
                      placeholder="Select a model"
                      value={config.whiteModel}
                      onChange={e => setConfig(c => ({ ...c, whiteModel: e.target.value }))}
                    >
                      {defaultModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      size="sm"
                      placeholder="gpt-4"
                      value={config.whiteModel}
                      onChange={e => setConfig(c => ({ ...c, whiteModel: e.target.value }))}
                    />
                  )
                ) : (
                  whiteModels.length > 0 && !whiteModelsFailed ? (
                  <Select
                    size="sm"
                    placeholder="Select a model"
                    value={config.whiteModel}
                    onChange={e => setConfig(c => ({ ...c, whiteModel: e.target.value }))}
                  >
                    {whiteModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    size="sm"
                    placeholder="gpt-4"
                    value={config.whiteModel}
                    onChange={e => setConfig(c => ({ ...c, whiteModel: e.target.value }))}
                  />
                )
                )}
              </FormControl>
            </VStack>
              </>
            )}

            <Divider my={3} />

            {config.playerMode !== 'human_black' && (
              <>
                <Text fontWeight="bold" mb={2}>♚ Black Player</Text>
            <VStack spacing={2}>
              <FormControl size="sm">
                <FormLabel fontSize="xs">API Provider</FormLabel>
                <Select
                  size="sm"
                  value={config.blackProvider}
                  onChange={e => setConfig(c => ({ ...c, blackProvider: e.target.value }))}
                >
                  <option value="purinnyova">PurinNyova API</option>
                  <option value="custom">Custom</option>
                </Select>
              </FormControl>
              {config.blackProvider === 'custom' && (
                <>
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
                </>
              )}
              <FormControl>
                <FormLabel fontSize="xs">
                  Model {config.blackProvider === 'purinnyova' ? (defaultModelsLoading && <Spinner size="xs" ml={1} />) : (blackModelsLoading && <Spinner size="xs" ml={1} />)}
                </FormLabel>
                {config.blackProvider === 'purinnyova' ? (
                  defaultModels.length > 0 && !defaultModelsFailed ? (
                    <Select
                      size="sm"
                      placeholder="Select a model"
                      value={config.blackModel}
                      onChange={e => setConfig(c => ({ ...c, blackModel: e.target.value }))}
                    >
                      {defaultModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      size="sm"
                      placeholder="gpt-4"
                      value={config.blackModel}
                      onChange={e => setConfig(c => ({ ...c, blackModel: e.target.value }))}
                    />
                  )
                ) : (
                  blackModels.length > 0 && !blackModelsFailed ? (
                  <Select
                    size="sm"
                    placeholder="Select a model"
                    value={config.blackModel}
                    onChange={e => setConfig(c => ({ ...c, blackModel: e.target.value }))}
                  >
                    {blackModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    size="sm"
                    placeholder="gpt-4"
                    value={config.blackModel}
                    onChange={e => setConfig(c => ({ ...c, blackModel: e.target.value }))}
                  />
                )
                )}
              </FormControl>
            </VStack>
              </>
            )}

            <Divider my={3} />

            <Text fontWeight="bold" mb={2}>⏱ Time Control</Text>
            <VStack spacing={2}>
              <FormControl display="flex" alignItems="center">
                <input
                  type="checkbox"
                  checked={config.unlimited}
                  onChange={e => setConfig(c => ({ ...c, unlimited: e.target.checked }))}
                  style={{ marginRight: '8px' }}
                />
                <FormLabel fontSize="xs" mb={0}>Unlimited time</FormLabel>
              </FormControl>
              {!config.unlimited && (
                <HStack spacing={2} w="100%">
                  <FormControl>
                    <FormLabel fontSize="xs">Base time (min)</FormLabel>
                    <Input
                      size="sm"
                      type="number"
                      min="1"
                      value={config.baseTime}
                      onChange={e => setConfig(c => ({ ...c, baseTime: e.target.value }))}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="xs">Increment (sec)</FormLabel>
                    <Input
                      size="sm"
                      type="number"
                      min="0"
                      value={config.increment}
                      onChange={e => setConfig(c => ({ ...c, increment: e.target.value }))}
                    />
                  </FormControl>
                </HStack>
              )}
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
