<p align="center">
  <img src="https://img.shields.io/badge/♟-LLM%20Chess%20Arena-blue?style=for-the-badge&labelColor=1a1a2e&color=16213e" alt="LLM Chess Arena" height="40"/>
</p>

<p align="center">
  <em>Watch AI models battle it out on the chessboard, or challenge them yourself.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 19"/>
  <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" alt="Express 5"/>
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 7"/>
  <img src="https://img.shields.io/badge/Chakra%20UI-2-319795?style=flat-square&logo=chakraui&logoColor=white" alt="Chakra UI"/>
  <img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js"/>
</p>

---

## 📖 About

**LLM Chess Arena** is a real-time web application that pits Large Language Models against each other in chess, or lets you play against them yourself. Connect any OpenAI-compatible API, pick your models, and watch the games unfold with live streaming moves, a chat log, chess clocks, and captured piece tracking.

---

## ✨ Features

| Feature | Description |
|---|---|
| **LLM vs LLM** | Fully automated games between any two OpenAI-compatible models |
| **Human vs LLM** | Play as White or Black against an AI opponent with drag-and-drop moves |
| **Chess Clocks** | Configurable base time + increment (Fischer) time controls, or unlimited play |
| **Chat Log** | See the raw LLM responses, errors, and game narration as they happen |
| **Multi-Session** | Token-based sessions, multiple users can play independently on the same server |
| **Model Discovery** | Auto-fetches available models from any OpenAI-compatible endpoint |
| **PGN Export** | Copy the full PGN of any completed game |
| **Dark Theme** | Sleek dark UI built with Chakra UI |

---

## 🖼️ Architecture

```
┌─────────────────────────┐       SSE        ┌──────────────────────┐
│    React Frontend       │ ◄──────────────► │   Express Backend    │
│  (Vite + Chakra UI)     │   REST API       │   (Node.js)          │
│                         │ ──────────────►  │                      │
│  • Chessboard           │                  │  • Game Engine       │
│  • Chat Log             │                  │  • Board / Piece     │
│  • Game Controls        │                  │  • Move Validation   │
│  • Chess Clock          │                  │  • LLM Client        │
│  • Captured Pieces      │                  │  • Session Manager   │
└─────────────────────────┘                  └──────────┬───────────┘
                                                        │
                                                        ▼
                                             ┌──────────────────────┐
                                             │  OpenAI-Compatible   │
                                             │  LLM API(s)          │
                                             └──────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- An API key for any **OpenAI-compatible** LLM endpoint

### Installation

```bash
# Clone the repository
git clone https://github.com/PurinNyova/LLM-Chess-Arena.git
cd LLM-Chess-Arena

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the project root (optional, you can also enter credentials in the UI):

```env
# Default API settings (used by the Default API preset)
WHITE_API_URL=https://api.openai.com/v1/chat/completions
WHITE_API_KEY=sk-your-api-key
WHITE_MODEL=gpt-4

BLACK_API_URL=https://api.openai.com/v1/chat/completions
BLACK_API_KEY=sk-your-api-key
BLACK_MODEL=gpt-4

MAX_RETRIES=3
PORT=3001

# bypass password to skip the provided API rate limit per session
BYPASS_PASSWORD=
```

### Running

```bash
# Start both frontend (Vite dev server) and backend concurrently
npm run dev
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:3001` |

The Vite dev server automatically proxies `/api` requests to the backend.

### Production Build

```bash
# Build the frontend
npm run build

# Start the server (serves the built frontend + API)
node server/index.js
```

---

## Usage

1. **Open the app** in your browser at `http://localhost:5173`
2. **Click the settings icon** to configure the game
3. **Choose an API provider**, use the Default API preset (server `.env` credentials) or enter custom API URL/key
4. **Select models** for White and Black from the auto-discovered model list
5. **Set time controls** (optional), base time in minutes and increment in seconds
6. **Choose play mode**, LLM vs LLM (spectate) or Human vs LLM (play as White or Black)
7. **Start the game** and watch the action unfold!

---

## Project Structure

```
LLM-Chess-Arena/
├── public/pieces/         # SVG chess piece assets
├── server/
│   ├── index.js           # Express server, REST API, SSE streaming
│   └── chess/
│       ├── Board.js       # Board state, move validation, legal move generation
│       ├── Game.js        # Game loop, LLM turn orchestration, time control
│       ├── LLMClient.js   # Streaming HTTP client for OpenAI-compatible APIs
│       ├── MoveHistory.js # PGN generation and move tracking
│       └── Piece.js       # Piece types, colors, movement rules
├── src/
│   ├── App.jsx            # Root layout, board, chat, controls
│   ├── main.jsx           # React entry point
│   ├── theme.js           # Chakra UI dark theme config
│   ├── components/
│   │   ├── Chessboard.jsx     # Interactive board with drag-and-drop
│   │   ├── ChatLog.jsx        # Real-time LLM response stream
│   │   ├── ChessClock.jsx     # Fischer time control display
│   │   ├── CapturedPieces.jsx # Taken pieces + material advantage
│   │   └── GameControls.jsx   # Start/stop/reset, settings modal
│   └── hooks/
│       └── useGameStream.js   # SSE client, game state management
├── .env                   # API keys and config (not committed)
├── package.json
├── vite.config.js
└── plan.md                # Feature roadmap
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/token` | Generate a new session token |
| `GET` | `/api/game/stream?token=` | SSE stream for real-time game events |
| `POST` | `/api/game/start?token=` | Start a new game |
| `GET` | `/api/game/state?token=` | Get current game state |
| `POST` | `/api/game/move?token=` | Submit a human move |
| `GET` | `/api/game/legal-moves?token=&file=&rank=` | Get legal moves for a square |
| `POST` | `/api/game/stop?token=` | Stop the current game |
| `POST` | `/api/game/reset?token=` | Reset the game |
| `POST` | `/api/models` | Fetch models from a custom API endpoint |
| `POST` | `/api/models/default` | Fetch models using server `.env` credentials |

---

## 🛠️ Tech Stack

- **Frontend:** React 19, Chakra UI 2, Framer Motion, Vite 7
- **Backend:** Node.js, Express 5, Server-Sent Events
- **LLM Integration:** OpenAI-compatible chat completions API (streaming)
- **Chess Engine:** Custom-built board, piece, and move validation logic (no external chess library)

---

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0**, see the [LICENSE](LICENSE) file for details.

---