import { useState, useEffect, useCallback, useRef } from 'react';

/** Generate or retrieve a persistent session token */
function getSessionToken() {
  let token = localStorage.getItem('chess-session-token');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('chess-session-token', token);
  }
  return token;
}

/**
 * Custom hook that connects to the game SSE stream and manages game state.
 */
export function useGameStream() {
  const tokenRef = useRef(getSessionToken());
  const token = tokenRef.current;
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
  const [captured, setCaptured] = useState({ white: [], black: [] });
  const [clock, setClock] = useState(null); // { whiteTime, blackTime } or null
  const [humanSide, setHumanSide] = useState(null); // 'WHITE', 'BLACK', or null

  const eventSourceRef = useRef(null);

  const addChatEntry = useCallback((entry) => {
    setChatLog(prev => [...prev, { ...entry, id: Date.now() + Math.random() }]);
  }, []);

  // Connect to SSE
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/game/stream?token=${encodeURIComponent(token)}`);
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
      if (data.captured) setCaptured(data.captured);
      if (data.clock !== undefined) setClock(data.clock);
      if (data.humanSide !== undefined) setHumanSide(data.humanSide);
    });

    es.addEventListener('board', (e) => {
      const data = JSON.parse(e.data);
      setBoard(data.squares);
      if (data.turn) setTurn(data.turn);
      if (data.lastMove) setLastMove(data.lastMove);
      if (data.captured) setCaptured(data.captured);
    });

    es.addEventListener('clock', (e) => {
      const data = JSON.parse(e.data);
      setClock(data);
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
  }, [addChatEntry, token]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    // Fetch initial state
    fetch(`/api/game/state?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        setBoard(data.board);
        setTurn(data.turn);
        setPgn(data.pgn);
        setMoveCount(data.moveCount);
        setResult(data.result);
        if (data.whiteModel) setWhiteModel(data.whiteModel);
        if (data.blackModel) setBlackModel(data.blackModel);
        if (data.captured) setCaptured(data.captured);
        if (data.clock !== undefined) setClock(data.clock);
        if (data.humanSide !== undefined) setHumanSide(data.humanSide);
        // Restore gameActive if a game is in progress
        if (data.whiteModel && !data.result) setGameActive(true);
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
    setCaptured({ white: [], black: [] });
    setClock(null);
    setHumanSide(config.humanSide || null);

    const res = await fetch(`/api/game/start?token=${encodeURIComponent(token)}`, {
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
  }, [token]);

  const resetGame = useCallback(async () => {
    await fetch(`/api/game/reset?token=${encodeURIComponent(token)}`, { method: 'POST' });
    setChatLog([]);
    setResult(null);
    setLastMove(null);
    setMoveCount(0);
    setPgn('');
    setGameActive(false);
    // Fetch fresh board
    const res = await fetch(`/api/game/state?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    setBoard(data.board);
    setTurn(data.turn);
  }, [token]);

  const stopGame = useCallback(async () => {
    const res = await fetch(`/api/game/stop?token=${encodeURIComponent(token)}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      setGameActive(false);
    }
    return data;
  }, [token]);

  const submitMove = useCallback(async (move) => {
    const res = await fetch(`/api/game/move?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid move');
    }
    return data;
  }, [token]);

  return {
    board, turn, pgn, moveCount, result,
    whiteModel, blackModel, lastMove,
    chatLog, connected, gameActive, captured, clock, humanSide,
    startGame, resetGame, stopGame, submitMove,
    sessionToken: token,
  };
}
