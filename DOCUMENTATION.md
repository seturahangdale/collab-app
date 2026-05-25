# CollabEdit — Complete Project Documentation

**Live URL**: https://collab-app-4cl5.onrender.com  
**GitHub**: https://github.com/seturahangdale/collab-app  
**Developer**: Setu Rahangdale

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Backend — server.js](#5-backend--serverjs)
   - Database Schemas
   - REST API Endpoints
   - Socket.io Events
6. [Frontend — client/index.html](#6-frontend--clientindexhtml)
   - UI Sections
   - State Management
   - Key Functions
7. [Feature Deep-Dive](#7-feature-deep-dive)
8. [Security Implementation](#8-security-implementation)
9. [Deployment Guide](#9-deployment-guide)
10. [Environment Variables](#10-environment-variables)
11. [Known Limitations & Future Scope](#11-known-limitations--future-scope)

---

## 1. Project Overview

CollabEdit is a **real-time collaborative text editor** — similar to Google Docs but built from scratch. Multiple users can simultaneously edit the same document, see each other's live cursors, chat in real-time, use AI writing assistance, and access full version history.

### Core Problems Solved
| Problem | Solution |
|---------|----------|
| Multiple users editing same document | Socket.io WebSocket sync |
| Data persistence across sessions | MongoDB Atlas storage |
| User identity & security | JWT authentication |
| Writing assistance | Google Gemini AI API |
| Version control | Auto-snapshot every 3 minutes |

---

## 2. Tech Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | JavaScript runtime |
| Express.js | ^5.2.1 | HTTP server & REST API |
| Socket.io | ^4.8.3 | WebSocket real-time communication |
| Mongoose | ^9.6.2 | MongoDB ODM (schema + queries) |
| bcryptjs | ^3.0.3 | Password hashing |
| jsonwebtoken | ^9.0.3 | JWT token generation & verification |
| cors | ^2.8.6 | Cross-Origin Resource Sharing |
| dotenv | latest | Environment variable loading |

### Frontend
| Technology | Purpose |
|------------|---------|
| Vanilla JavaScript | No framework — pure JS |
| Monaco Editor v0.44 | VS Code's editor engine (syntax highlighting, cursors) |
| Socket.io Client | Real-time communication |
| Marked.js v4.3 | Markdown → HTML rendering |
| Highlight.js v11.9 | Code syntax highlighting in preview |
| Google Fonts (Inter) | Typography |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Render.com | Backend hosting (free tier) |
| MongoDB Atlas | Cloud database (free tier) |
| Google AI Studio | Gemini API key |

---

## 3. Project Structure

```
collab-app/
│
├── server.js              ← Entire backend (500+ lines)
│   ├── DNS config
│   ├── Express setup
│   ├── MongoDB connection
│   ├── Schemas (User, Document, Version)
│   ├── Auth middleware
│   ├── REST API routes
│   ├── AI endpoint
│   └── Socket.io events
│
├── package.json           ← Dependencies & npm scripts
├── package-lock.json      ← Locked dependency versions
├── .env                   ← Secret keys (NEVER commit to Git)
├── .gitignore             ← node_modules/ and .env excluded
├── README.md              ← GitHub landing page
├── DOCUMENTATION.md       ← This file
│
└── client/
    └── index.html         ← Entire frontend (1500+ lines)
        ├── <head> — CDN imports (Monaco, Socket.io, Marked, hljs)
        ├── <style> — All CSS (CSS variables, components, dark mode, mobile)
        ├── HTML structure — Login, Dashboard, Editor, Modals
        └── <script> — All JavaScript (state, socket, UI logic)
```

---

## 4. Architecture

### High-Level Flow
```
┌─────────────────────────────────────────────────────────┐
│                        BROWSER                          │
│  Monaco Editor + Socket.io Client + Vanilla JS          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (REST) + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                    RENDER SERVER                        │
│              Express.js + Socket.io Server              │
│                                                         │
│  /api/register  /api/login  /api/documents              │
│  /api/ai-assist  /api/ai-models                         │
│                                                         │
│  Socket Events:                                         │
│  join-room  text-change  cursor-move  typing            │
│  chat-message  disconnect                               │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
┌──────────▼──────────┐   ┌────────────▼─────────────────┐
│   MongoDB Atlas     │   │     Google Gemini API         │
│                     │   │                               │
│  users collection   │   │  gemini-3-flash-preview       │
│  documents          │   │  (generateContent endpoint)   │
│  └── versions[]     │   └──────────────────────────────┘
└─────────────────────┘
```

### Real-time Data Flow (User Types a Character)
```
User A types "H"
      │
      ▼
Monaco onDidChangeModelContent fires
      │
      ▼
socket.emit('text-change', { roomId, text: 'H' })
      │
      ▼
Server receives → rooms[roomId].documentText = 'H'
      │
      ├──► socket.to(roomId).emit('text-change', { text: 'H' })
      │         │
      │         ▼
      │    User B & C receive → editor.setValue('H')
      │
      └──► scheduleSave(roomId, 'H', username)
                │
                ▼ (after 2 seconds of no typing)
           MongoDB.findOneAndUpdate({ roomId }, { content: 'H' })
                │
                ▼
           socket.emit('doc-saved') → "Saved" indicator turns green
```

---

## 5. Backend — server.js

### Database Schemas

#### User Schema
```javascript
{
  username: String,   // unique, trimmed
  password: String,   // bcrypt hashed (10 rounds)
  createdAt: Date     // auto-set
}
```

#### Document Schema
```javascript
{
  roomId:       String,    // unique room identifier
  content:      String,    // current document text
  createdBy:    String,    // username of creator
  lastModified: Date,
  versions: [{             // array of snapshots
    content:  String,
    savedBy:  String,
    savedAt:  Date
  }]                       // max 20 versions (oldest auto-deleted)
}
```

---

### REST API Endpoints

#### POST /api/register
**Purpose**: Create new user account

**Request Body**:
```json
{ "username": "Setu", "password": "mypassword" }
```
**Validations**: username ≥ 2 chars, password ≥ 4 chars, username must be unique

**Response (200)**:
```json
{ "token": "eyJhbGc...", "username": "Setu" }
```

**Flow**: Validate → Check duplicate → bcrypt.hash(password, 10) → Save to MongoDB → jwt.sign() → Return token

---

#### POST /api/login
**Purpose**: Authenticate existing user

**Request Body**:
```json
{ "username": "Setu", "password": "mypassword" }
```

**Response (200)**:
```json
{ "token": "eyJhbGc...", "username": "Setu" }
```

**Flow**: Find user → bcrypt.compare(input, hash) → If match → jwt.sign() → Return token

---

#### GET /api/documents *(requires auth)*
**Purpose**: Get list of all documents for dashboard

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
[
  {
    "roomId": "clgproject",
    "preview": "First 120 characters of content...",
    "charCount": 450,
    "wordCount": 82,
    "createdBy": "Setu",
    "lastModified": "2026-05-25T17:30:00Z"
  }
]
```

---

#### GET /api/document/:roomId/versions *(requires auth)*
**Purpose**: Get version history of a document

**Response**: Array of last 20 versions (newest first)
```json
[
  { "content": "...", "savedBy": "Setu", "savedAt": "2026-05-25T..." },
  ...
]
```

---

#### POST /api/document/:roomId/restore *(requires auth)*
**Purpose**: Restore document to a previous version

**Request Body**: `{ "content": "restored text here" }`

**What it does**:
1. Updates document content in MongoDB
2. Saves the restored content as a NEW version (with restorer's name)
3. Broadcasts new content to all users in room via Socket.io
4. Emits `doc-saved` event

---

#### POST /api/ai-assist *(requires auth)*
**Purpose**: AI writing assistance via Google Gemini

**Request Body**:
```json
{ "text": "hello world", "action": "improve" }
```

**Actions**: `improve` | `grammar` | `summarize` | `continue`

**How it works**:
1. Builds a specific prompt based on action
2. Calls Gemini API server-side (API key never exposed to browser)
3. Returns AI response

**Prompts used**:
- `improve`: "Make it clearer, more engaging and professional. Return ONLY improved text."
- `grammar`: "Fix all grammar, spelling and punctuation. Return ONLY corrected text."
- `summarize`: "Summarize in 2-3 sentences. Return ONLY the summary."
- `continue`: "Continue writing 2-3 more sentences. Return ONLY the continuation."

---

#### GET /api/ai-models *(requires auth)*
**Purpose**: Debug endpoint — lists all available Gemini models that support generateContent

**Usage**: Visit `https://collab-app-4cl5.onrender.com/api/ai-models` after logging in

---

### Auth Middleware
```javascript
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```
Every protected route passes through this. Token is extracted from `Authorization: Bearer <token>` header.

---

### Socket.io Events

#### Server-side Auth (Middleware)
```javascript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const decoded = jwt.verify(token, JWT_SECRET);
  socket.username = decoded.username;
  next();
});
```
Every socket connection is authenticated before it can emit events.

---

#### Event: `join-room`
**Client sends**: `{ roomId: "clgproject" }`

**Server does**:
1. Leaves any previously joined rooms
2. Joins the Socket.io room
3. Adds user to `rooms[roomId].users` object
4. Loads document from MongoDB (or creates new one)
5. Emits back to this socket: `init-document`, `user-list`, `chat-history`
6. Emits to all others in room: `user-joined`

---

#### Event: `text-change`
**Client sends**: `{ roomId, text }` — on every keystroke

**Server does**:
1. Updates in-memory `rooms[roomId].documentText`
2. Broadcasts `text-change` to ALL others in room (not sender)
3. Calls `scheduleSave()` — debounced 2 second MongoDB save

---

#### Event: `cursor-move`
**Client sends**: `{ roomId, position }` — position is character offset (number)

**Server does**: Broadcasts `cursor-move` to others with `{ socketId, username, position }`

**Client renders**: Monaco decoration widget with colored label showing username

---

#### Event: `typing`
**Client sends**: `{ roomId }` — when user is actively typing

**Server does**: Broadcasts `typing` to others with `{ username, socketId }`

**Client**: Shows "Setu is typing..." in bottom bar for 2 seconds

---

#### Event: `chat-message`
**Client sends**: `{ roomId, text }` — max 500 characters

**Server does**:
1. Validates user is in room
2. Creates message object: `{ username, text, time }`
3. Stores in `room.messages[]` (max 100 messages in memory)
4. Broadcasts to ALL users in room (including sender)

---

#### Event: `disconnect`
**Server does**:
1. Removes user from `rooms[roomId].users`
2. Emits `user-left` to all in room
3. If room is empty, deletes it from memory

---

### In-memory Room Structure
```javascript
rooms = {
  "clgproject": {
    documentText: "Current content...",
    messages: [{ username, text, time }, ...],  // last 100
    users: {
      "socket-id-1": { username: "Setu", socketId: "socket-id-1" },
      "socket-id-2": { username: "Rahul", socketId: "socket-id-2" }
    }
  }
}
```
**Important**: This is RAM — lost when server restarts. MongoDB has the permanent copy.

---

## 6. Frontend — client/index.html

### UI Sections (HTML Structure)
```
#login-overlay          ← Full screen login/register
  .login-left           ← Form panel
  .login-right          ← Hero photo panel

#dashboard              ← Document list screen
  .db-header
  #doc-grid             ← Document cards grid

#new-room-modal         ← Create new document popup
#history-modal          ← Version history slide-in panel
#chat-panel             ← Real-time chat sidebar
#ai-modal               ← AI Writing Assistant panel

#app                    ← Main editor screen
  #topbar               ← Logo, buttons, avatars, status
  #main
    #ed-pane            ← Monaco editor
    #divider            ← Draggable resize bar
    #prev-pane          ← Markdown preview (hidden by default)
  #bottombar            ← Typing indicator, line/char/word count, save status

#focus-exit             ← "Press Esc" button (only in focus mode)
#print-content          ← Hidden div used for PDF printing
#toasts                 ← Toast notification container
```

---

### State Variables (JavaScript)
```javascript
let socket = null;          // Socket.io connection
let ed = null;              // Monaco editor instance
let currentRoom = '';       // Active room name
let suppressChg = false;    // Prevents echo when receiving remote text changes
let prevOpen = false;       // Preview pane open/closed
let isRegisterMode = false; // Login vs Register tab
let authToken = null;       // JWT token (from localStorage)
let authUsername = null;    // Current user's username
let chatOpen = false;       // Chat panel open/closed
let chatUnread = 0;         // Unread message count
```

---

### Key Functions

#### `launchEditor(roomId)`
The most important function — called after login.

```
1. showJoinSplash(roomId)    ← Animated "Joining #roomId" overlay
2. app.style.display = 'flex'  ← Show editor screen
3. require(['vs/editor/editor.main'], function() {
     a. Create Monaco editor instance
     b. Set up onDidChangeModelContent → emit text-change
     c. Set up onDidChangeCursorPosition → emit cursor-move
     d. Create socket = io(API_BASE, { auth: { token } })
     e. Set up all socket event listeners
   })
```

#### `scheduleSave()` (server-side)
```javascript
// Debounced — waits 2 seconds after last change
if (saveTimers[roomId]) clearTimeout(saveTimers[roomId]);
saveTimers[roomId] = setTimeout(async () => {
  // Save to MongoDB
  // If 3+ minutes since last version → create snapshot
}, 2000);
```

#### `updateCursor(socketId, offset)` 
Renders another user's cursor in Monaco:
```javascript
// Convert character offset to line:column
const pos = model.getPositionAt(offset);
// Create Monaco decoration (colored line)
ed.deltaDecorations([], [{
  range: new monaco.Range(pos.lineNumber, pos.column, ...),
  options: { beforeContentClassName: 'rc-socketid' }
}]);
// Add name label widget above cursor
ed.addContentWidget({ getDomNode: () => labelDiv, getPosition: () => pos });
```

---

### CSS Architecture

CSS Variables (design tokens):
```css
:root {
  --bg: #fafaf8;          /* Page background */
  --s1 to --s3:           /* Surface shades */
  --t1 to --t3:           /* Text shades */
  --accent: #d97706;      /* Amber orange — brand color */
  --accent-dim: rgba(217,119,6,.1);
  --r: 14px;              /* Border radius */
}

/* Dark mode overrides */
body.dark {
  --bg: #111110;
  --t1: #f5f4f0;
  /* ... */
}
```

---

## 7. Feature Deep-Dive

### Version History
- Auto-saves every **2 seconds** of inactivity to MongoDB
- Creates a **version snapshot** every **3 minutes** (if content changed)
- Stores **max 20 versions** per document (`$slice: -20` in MongoDB push)
- Restore triggers: update MongoDB + broadcast via Socket.io to all users

### Dark Mode
- Toggled by `body.dark` CSS class
- Preference stored in `localStorage` as `'collabedit_theme'`
- Monaco editor theme switches: `vs-dark` ↔ `vs`
- Persists across page refreshes and sessions

### Focus Mode
- Adds `body.focus` class
- CSS: `#topbar { transform: translateY(-100%) }` hides topbar
- CSS: `#bottombar { transform: translateY(100%) }` hides bottombar
- Exit: Press **Esc** key or click the exit button

### PDF Export
- Keyboard shortcut: **Ctrl+Shift+P**
- Copies editor text to `#print-content` hidden div
- `window.print()` triggers browser print dialog
- `@media print` CSS hides everything except `#print-content`

### Share Links
URL format: `https://collab-app-4cl5.onrender.com/?room=roomname`
- Room name extracted from URL: `new URLSearchParams(window.location.search).get('room')`
- If URL has room param → skip dashboard, go directly to editor

---

## 8. Security Implementation

| Concern | Implementation |
|---------|----------------|
| Password storage | bcrypt hash with salt rounds=10 |
| Authentication | JWT tokens, 7-day expiry |
| Socket auth | JWT verified on every WebSocket connection |
| API key exposure | Gemini key only on server, never sent to browser |
| Input validation | Username/password length checks, text length limits |
| XSS prevention | `esc()` function escapes HTML in all user-generated content |
| Environment secrets | `.env` file, gitignored — set as env vars on Render |

### The `esc()` Function (XSS Prevention)
```javascript
function esc(s) {
  return s.replace(/&/g,'&amp;')
          .replace(/</g,'&lt;')
          .replace(/>/g,'&gt;');
}
```
Used everywhere user text is displayed (chat messages, usernames, etc.)

---

## 9. Deployment Guide

### Render Setup
1. GitHub repo push karo
2. Render.com → New Web Service → Connect GitHub repo
3. Settings:
   - **Build Command**: *(empty)*
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
4. Environment Variables set karo (see section 10)
5. Manual Deploy → Deploy latest commit

### Why Free Tier Has Cold Starts
Render free tier **spins down** after 15 minutes of inactivity.
First request after inactivity takes **30-50 seconds** to respond.
This is normal — paid tier removes this limitation.

---

## 10. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster...` |
| `JWT_SECRET` | Secret key for signing JWT tokens | Any random string |
| `GEMINI_API_KEY` | Google AI Studio API key | `AIzaSy...` |
| `PORT` | Server port (Render sets this automatically) | `3001` |

**Local development**: Create `.env` file in project root (already gitignored)

**Render deployment**: Set in Dashboard → your service → Environment tab

---

## 11. Known Limitations & Future Scope

### Current Limitations
| Limitation | Reason | Production Solution |
|------------|--------|---------------------|
| Last-write-wins conflict resolution | Simple implementation | Operational Transformation (OT) or CRDT |
| Chat history lost on server restart | Stored in RAM | Store in MongoDB |
| No room permissions | All rooms are public | Add private rooms with invite codes |
| Single server | No horizontal scaling | Redis adapter for Socket.io |
| No user profiles | Out of scope | Add avatar, bio, settings page |

### Potential Improvements
1. **Operational Transformation** — Proper merge of simultaneous edits (Google Docs approach)
2. **Offline support** — Queue changes when disconnected, sync when reconnected
3. **File attachments** — Image/file upload within documents
4. **Comments** — Inline comments on specific text selections
5. **Export formats** — DOCX, PDF with formatting
6. **Notifications** — Email/push when someone joins your document
7. **Search** — Full-text search across all documents

---

## Interview Talking Points

**"What was the most challenging part?"**
Real-time synchronization — specifically preventing the "echo" problem where your own text change comes back from the server. Solution: `suppressChg` flag that ignores incoming changes while the local editor is being updated.

**"How do live cursors work?"**
Each user's cursor movement is sent as a character offset (single number). On receiving side, Monaco's `model.getPositionAt(offset)` converts it to line:column, and a decoration widget renders the colored cursor with the username label.

**"How is the AI feature secured?"**
The Gemini API key lives only on the server. The browser calls `/api/ai-assist` (our own endpoint) which proxies the request to Google. The key never appears in browser network tab or frontend code.

**"What would you do differently?"**
Use CRDT (Conflict-free Replicated Data Types) instead of last-write-wins for proper collaborative editing. Also separate the frontend into a proper build system (React/Vite) for better maintainability at scale.

---

*Documentation written for CollabEdit v1.0 — May 2026*
