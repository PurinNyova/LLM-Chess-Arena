import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook that connects to the game SSE stream and manages game state.
 */
export function useGameStream() {
  const [board, setBoard] = useState(null);
  const [turn, setTurn] = useState('WHITE');
  const [pgn, setPgn] = useState('');
  const [moveCount, setMoveCount] = useState(0);
  const [result, setResult] = useState(null);
  const [whiteModel, setWhiteModel] = useState(null);
  const [blackModel, setBlackModel] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [chatLog, setChatLog] = useState([]);
  const [connected, setConnected] = useState(false);
  const [gameActive, setGameActive] = useState(false);

  const eventSourceRef = useRef(null);

  const addChatEntry = useCallback((entry) => {
    setChatLog(prev => [...prev, { ...entry, id: Date.now() + Math.random() }]);
  }, []);

  // Connect to SSE
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/game/stream');
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('state', (e) => {
      const data = JSON.parse(e.data);
      setBoard(data.board);
      setTurn(data.turn);
      setPgn(data.pgn);
      setMoveCount(data.moveCount);
      setResult(data.result);
      setWhiteModel(data.whiteModel);
      setBlackModel(data.blackModel);
    });

    es.addEventListener('board', (e) => {
      const data = JSON.parse(e.data);
      setBoard(data.squares);
      if (data.turn) setTurn(data.turn);
      if (data.lastMove) setLastMove(data.lastMove);
    });

    es.addEventListener('move', (e) => {
      const data = JSON.parse(e.data);
      setMoveCount(prev => prev + 1);
      addChatEntry({ type: 'move', ...data });
    });

    es.addEventListener('thinking', (e) => {
      const data = JSON.parse(e.data);
      // Update last thinking entry or add new one
      setChatLog(prev => {
        const last = prev[prev.length - 1];
        if (last && last.type === 'thinking' && last.color === data.color) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, text: data.accumulated };
          return updated;
        }
        return [...prev, { type: 'thinking', id: Date.now() + Math.random(), ...data }];
      });
    });

    es.addEventListener('chat', (e) => {
      const data = JSON.parse(e.data);
      // Remove the accumulated thinking entry since chat includes the full thinking
      setChatLog(prev => {
        const filtered = prev.filter(
          entry => !(entry.type === 'thinking' && entry.color === data.color)
        );
        return [...filtered, { type: 'chat', id: Date.now() + Math.random(), ...data }];
      });
    });

    es.addEventListener('error', (e) => {
      const data = JSON.parse(e.data);
      addChatEntry({ type: 'error', ...data });
    });

    es.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      addChatEntry({ type: 'status', ...data });
    });

    es.addEventListener('gameOver', (e) => {
      const data = JSON.parse(e.data);
      setResult(data.result);
      setPgn(data.pgn || '');
      setGameActive(false);
      addChatEntry({ type: 'gameOver', ...data });
    });
  }, [addChatEntry]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    // Fetch initial state
    fetch('/api/game/state')
      .then(r => r.json())
      .then(data => {
        setBoard(data.board);
        setTurn(data.turn);
        setPgn(data.pgn);
        setMoveCount(data.moveCount);
        setResult(data.result);
        if (data.whiteModel) setWhiteModel(data.whiteModel);
        if (data.blackModel) setBlackModel(data.blackModel);
      })
      .catch(() => {});

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [connect]);

  const startGame = useCallback(async (config = {}) => {
    setChatLog([]);
    setResult(null);
    setLastMove(null);
    setMoveCount(0);
    setPgn('');
    setGameActive(true);

    const res = await fetch('/api/game/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) {
      setGameActive(false);
      throw new Error(data.error || 'Failed to start game');
    }
    if (data.state) {
      setBoard(data.state.board);
      setTurn(data.state.turn);
      setWhiteModel(data.state.whiteModel);
      setBlackModel(data.state.blackModel);
    }
    return data;
  }, []);

  const resetGame = useCallback(async () => {
    await fetch('/api/game/reset', { method: 'POST' });
    setChatLog([]);
    setResult(null);
    setLastMove(null);
    setMoveCount(0);
    setPgn('');
    setGameActive(false);
    // Fetch fresh board
    const res = await fetch('/api/game/state');
    const data = await res.json();
    setBoard(data.board);
    setTurn(data.turn);
  }, []);

  return {
    board, turn, pgn, moveCount, result,
    whiteModel, blackModel, lastMove,
    chatLog, connected, gameActive,
    startGame, resetGame,
  };
}
