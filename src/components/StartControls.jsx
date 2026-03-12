import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Button,
  VStack,
  HStack,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  Divider,
  Spinner,
  useToast,
} from '@chakra-ui/react';

export default function StartControls({ isOpen, onClose, onStartGame }) {
  const toast = useToast();

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
    bypassPassword: '',
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

  // Fetch models for the Default API preset (server .env credentials)
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

      // Bypass password (only sent when using Default API)
      if (config.bypassPassword.trim()) {
        body.password = config.bypassPassword.trim();
      }

      const data = await onStartGame(body);

      // Show bypass status
      if (data && data.bypass === false) {
        toast({
          title: 'Rate limit active',
          description: 'Bypass not enabled — 20 min cooldown between games.',
          status: 'info',
          duration: 5000,
          isClosable: true,
        });
      }

      onClose();
    } catch (err) {
      const isRateLimit = err.message.includes('Rate limited');
      toast({
        title: isRateLimit ? '⏳ Rate Limited' : 'Failed to start game',
        description: err.message,
        status: isRateLimit ? 'warning' : 'error',
        duration: isRateLimit ? 8000 : 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent bg="gray.800">
        <ModalHeader>Game Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="xs" color="gray.400" mb={4}>
            Select "Default API" to use server credentials, or "Custom" for your own.
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
                    <option value="purinnyova">Default API</option>
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
                    <option value="purinnyova">Default API</option>
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

          {(config.whiteProvider === 'purinnyova' || config.blackProvider === 'purinnyova') && (
            <>
              <Divider my={3} />
              <Text fontWeight="bold" mb={2}>🔑 Default API Limit Bypass</Text>
              <FormControl>
                <FormLabel fontSize="xs">Bypass Password (optional)</FormLabel>
                <Input
                  size="sm"
                  type="password"
                  placeholder="Enter bypass password..."
                  value={config.bypassPassword}
                  onChange={e => setConfig(c => ({ ...c, bypassPassword: e.target.value }))}
                />
                <Text fontSize="2xs" color="gray.500" mt={1}>
                  Without bypass, you can only start 1 game every 20 minutes using the Default API.
                </Text>
              </FormControl>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
          <Button colorScheme="green" onClick={handleStart}>
            Start Game
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
