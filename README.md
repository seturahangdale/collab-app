# CollabEdit — Real-Time Collaborative Text Editor

A full-stack collaborative editing platform where multiple users can write and edit documents simultaneously with live cursors, AI-powered writing assistance, version history, and real-time chat.

**Live Demo**: [collab-app-4cl5.onrender.com](https://collab-app-4cl5.onrender.com)

---

## Features

| Feature | Description |
|---------|-------------|
| Real-time Collaboration | Multiple users edit simultaneously with live colored cursors |
| AI Writing Assistant | Powered by Google Gemini — Improve, Fix Grammar, Summarize, Continue Writing |
| Version History | Auto-saved snapshots every 3 minutes, restore any version |
| Room Chat | Real-time messaging sidebar for collaborators |
| Dark / Light Mode | Theme toggle, persists across sessions |
| Focus Mode | Distraction-free fullscreen writing (Esc to exit) |
| PDF Export | Print or save as PDF with Ctrl+Shift+P |
| Markdown Preview | Live side-by-side preview with syntax highlighting |
| Share Links | One-click shareable room links |
| Download | Export in 13 language formats (.js, .py, .md, etc.) |
| Dashboard | Document list with word count, last edited, and author info |
| JWT Authentication | Secure login/register with 7-day tokens |

---

## Tech Stack

**Frontend**
- Vanilla JavaScript (no framework)
- Monaco Editor (the same editor powering VS Code)
- Socket.io Client — real-time bidirectional events
- Marked.js + Highlight.js — markdown rendering with syntax highlighting

**Backend**
- Node.js + Express.js
- Socket.io — WebSocket server for real-time collaboration
- MongoDB Atlas + Mongoose — document persistence and version history
- JSON Web Tokens (JWT) — authentication
- bcryptjs — password hashing
- Google Gemini API — AI writing assistance

**Deployment**
- Render (backend + static frontend)
- MongoDB Atlas (cloud database)

---

## Architecture

```
Browser (Monaco Editor + Socket.io Client)
    │
    ├── HTTP  →  Express REST API  →  MongoDB Atlas
    │             ├── /api/register, /api/login
    │             ├── /api/documents
    │             ├── /api/document/:id/versions
    │             ├── /api/document/:id/restore
    │             └── /api/ai-assist  →  Google Gemini API
    │
    └── WebSocket  →  Socket.io Server
                      ├── join-room
                      ├── text-change (live sync)
                      ├── cursor-move (live cursors)
                      ├── typing indicator
                      └── chat-message
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Google AI Studio API key

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/collab-app.git
cd collab-app
npm install
```

Create a `.env` file in the root:

```env
MONGO_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_secret_key
GEMINI_API_KEY=your_google_ai_studio_key
```

Start the server:

```bash
npm start
# Open http://localhost:3001
```

---

## Key Implementation Details

- **Real-time sync**: Every keystroke is emitted via Socket.io and applied to all connected clients in the same room
- **Cursor tracking**: Each user's cursor position is broadcast as a character offset and rendered as a Monaco decoration widget
- **Auto-save**: Document content is debounced (2s) and saved to MongoDB; a version snapshot is taken every 3 minutes
- **AI Proxy**: The Gemini API key is kept server-side; the client calls `/api/ai-assist` which proxies the request
- **Authentication**: JWT tokens are stored in localStorage and passed via Socket.io handshake auth for socket authentication

---

## Deployment (Render)

1. Push to GitHub
2. Create a new Web Service on [Render](https://render.com)
3. Set environment variables: `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY`
4. Build command: *(leave empty)*
5. Start command: `node server.js`

---

## Project Structure

```
collab-app/
├── server.js          # Express + Socket.io server
├── package.json
├── .env               # Local env vars (gitignored)
└── client/
    └── index.html     # Single-page frontend app
```
