require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://seturahangdale:Setu2816@cluster0.atrmr.mongodb.net/collabapp?appName=Cluster0';
const JWT_SECRET     = process.env.JWT_SECRET     || 'collabedit_jwt_secret_2024';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ── Schemas ───────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

const versionSchema = new mongoose.Schema({
  content:  { type: String, default: '' },
  savedBy:  { type: String, default: '' },
  savedAt:  { type: Date, default: Date.now },
});

const docSchema = new mongoose.Schema({
  roomId:       { type: String, required: true, unique: true },
  content:      { type: String, default: '' },
  title:        { type: String, default: '' },
  roomPassword: { type: String, default: null },
  createdBy:    { type: String, default: '' },
  lastModified: { type: Date, default: Date.now },
  versions:     { type: [versionSchema], default: [] },
});
const Document = mongoose.model('Document', docSchema);

// ── Auth middleware ───────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 2)    return res.status(400).json({ error: 'Username must be at least 2 characters' });
    if (password.length < 4)    return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const exists = await User.findOne({ username: username.trim() });
    if (exists) return res.status(400).json({ error: 'Username already taken' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ username: username.trim(), password: hashed });
    const token  = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.trim() });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid username or password' });
    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Document routes ───────────────────────────────────────────────────────────

app.get('/api/documents', authMiddleware, async (req, res) => {
  try {
    const docs = await Document.find({}, 'roomId title roomPassword content createdBy lastModified')
      .sort({ lastModified: -1 }).limit(50);
    res.json(docs.map(d => ({
      roomId:       d.roomId,
      title:        d.title || '',
      hasPassword:  !!d.roomPassword,
      preview:      d.content.slice(0, 120).replace(/\n/g, ' '),
      charCount:    d.content.length,
      wordCount:    d.content.trim() ? d.content.trim().split(/\s+/).length : 0,
      createdBy:    d.createdBy,
      lastModified: d.lastModified,
    })));
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/document/:roomId/info', authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findOne({ roomId: req.params.roomId }, 'title roomPassword');
    if (!doc) return res.json({ exists: false, hasPassword: false, title: '' });
    res.json({ exists: true, hasPassword: !!doc.roomPassword, title: doc.title || '' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/document/:roomId/versions', authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findOne({ roomId: req.params.roomId }, 'versions');
    if (!doc) return res.json([]);
    res.json([...doc.versions].reverse().slice(0, 20));
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/document/:roomId/restore', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const doc = await Document.findOneAndUpdate(
      { roomId: req.params.roomId },
      { content, lastModified: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    // Push restored content as new version
    await Document.updateOne({ roomId: req.params.roomId }, {
      $push: { versions: { $each: [{ content, savedBy: req.user.username, savedAt: new Date() }], $slice: -20 } }
    });
    // Broadcast restored content to all users in room
    io.to(req.params.roomId).emit('text-change', { text: content });
    io.to(req.params.roomId).emit('doc-saved', { savedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── AI: list available models (debug) ────────────────────────────────────────

app.get('/api/ai-models', authMiddleware, async (req, res) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
    );
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const names = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    res.json({ available: names });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI endpoint ───────────────────────────────────────────────────────────────

app.post('/api/ai-assist', authMiddleware, async (req, res) => {
  try {
    if (!GEMINI_API_KEY) return res.status(503).json({ error: 'AI not configured — set GEMINI_API_KEY env var' });
    const { text, action } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });
    const prompts = {
      improve:  `Improve the writing quality of this text. Make it clearer, more engaging, and professional. Return ONLY the improved text, no explanations:\n\n${text}`,
      grammar:  `Fix all grammar, spelling, and punctuation errors in this text. Return ONLY the corrected text, no explanations:\n\n${text}`,
      summarize:`Summarize this text concisely in 2-3 sentences. Return ONLY the summary:\n\n${text}`,
      continue: `Continue writing from where this text ends. Write 2-3 more sentences that flow naturally. Return ONLY the continuation:\n\n${text}`,
    };
    const prompt = prompts[action];
    if (!prompt) return res.status(400).json({ error: 'Invalid action' });
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const data = await response.json();
    if (data.error) {
      console.error('Gemini error:', JSON.stringify(data.error));
      return res.status(500).json({ error: 'Gemini: ' + (data.error.message || 'API error') });
    }
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!result) {
      const reason = data.candidates?.[0]?.finishReason || JSON.stringify(data).slice(0, 120);
      console.error('Gemini empty result:', reason);
      return res.status(500).json({ error: 'AI returned no content — ' + reason });
    }
    res.json({ result: result.trim() });
  } catch (err) {
    console.error('AI error:', err);
    res.status(500).json({ error: 'AI service error' });
  }
});

// ── In-memory rooms ───────────────────────────────────────────────────────────

const rooms = {};

function getOrCreateRoom(roomId) {
  if (!rooms[roomId]) rooms[roomId] = { documentText: '', title: '', users: {} };
  return rooms[roomId];
}

const saveTimers = {};
const lastVersionSave = {};

async function scheduleSave(roomId, content, username) {
  if (saveTimers[roomId]) clearTimeout(saveTimers[roomId]);
  saveTimers[roomId] = setTimeout(async () => {
    try {
      const now = Date.now();
      const saveVersion = !lastVersionSave[roomId] || (now - lastVersionSave[roomId]) > 3 * 60 * 1000;

      const update = { content, lastModified: new Date() };
      if (saveVersion && content.trim()) {
        update.$push = { versions: { $each: [{ content, savedBy: username, savedAt: new Date() }], $slice: -20 } };
        lastVersionSave[roomId] = now;
      }

      await Document.findOneAndUpdate({ roomId }, update, { upsert: true, new: true });
      io.to(roomId).emit('doc-saved', { savedAt: new Date().toISOString() });
    } catch (err) { console.error('Save error:', err); }
  }, 2000);
}

// ── Socket auth ───────────────────────────────────────────────────────────────

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId; socket.username = decoded.username;
    next();
  } catch { next(new Error('Invalid token')); }
});

// ── Socket events ─────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (${socket.username})`);

  socket.on('join-room', async ({ roomId, password }) => {
    const room = getOrCreateRoom(roomId);
    socket.rooms.forEach((r) => { if (r !== socket.id) socket.leave(r); });

    let docContent = room.documentText;
    let docTitle   = room.title || '';
    try {
      const doc = await Document.findOne({ roomId });
      if (doc) {
        if (doc.roomPassword) {
          const valid = password ? await bcrypt.compare(password, doc.roomPassword) : false;
          if (!valid) { socket.emit('room-error', { error: 'Incorrect room password' }); return; }
        }
        docContent = doc.content; docTitle = doc.title || '';
        room.documentText = docContent; room.title = docTitle;
      } else {
        const newDoc = { roomId, content: '', createdBy: socket.username };
        if (password) newDoc.roomPassword = await bcrypt.hash(password, 10);
        await Document.create(newDoc);
      }
    } catch (err) { console.error('Load error:', err); }

    socket.join(roomId);
    socket.roomId = roomId;
    room.users[socket.id] = { username: socket.username, socketId: socket.id };

    socket.emit('init-document', { text: docContent, title: docTitle });
    socket.emit('user-list',     { users: Object.values(room.users) });
    socket.emit('chat-history',  { messages: room.messages || [] });
    socket.to(roomId).emit('user-joined', {
      username: socket.username, socketId: socket.id, users: Object.values(room.users),
    });
    console.log(`${socket.username} joined room "${roomId}" (${Object.keys(room.users).length} users)`);
  });

  socket.on('text-change', ({ roomId, text }) => {
    const room = rooms[roomId]; if (!room) return;
    room.documentText = text;
    socket.to(roomId).emit('text-change', { text });
    scheduleSave(roomId, text, socket.username);
  });

  socket.on('cursor-move', ({ roomId, position }) => {
    const room = rooms[roomId]; if (!room) return;
    const user = room.users[socket.id]; if (!user) return;
    socket.to(roomId).emit('cursor-move', { socketId: socket.id, username: user.username, position });
  });

  socket.on('typing', ({ roomId }) => {
    const room = rooms[roomId]; if (!room || !room.users[socket.id]) return;
    socket.to(roomId).emit('typing', { username: room.users[socket.id].username, socketId: socket.id });
  });

  socket.on('title-change', async ({ roomId, title }) => {
    const room = rooms[roomId]; if (!room) return;
    const clean = (title || '').trim().slice(0, 100);
    room.title = clean;
    try { await Document.findOneAndUpdate({ roomId }, { title: clean }); } catch {}
    socket.to(roomId).emit('title-change', { title: clean });
  });

  socket.on('chat-message', ({ roomId, text }) => {
    const room = rooms[roomId]; if (!room || !room.users[socket.id]) return;
    const clean = text?.trim().slice(0, 500); if (!clean) return;
    if (!room.messages) room.messages = [];
    const msg = { username: socket.username, text: clean, time: new Date().toISOString() };
    room.messages.push(msg);
    if (room.messages.length > 100) room.messages.shift();
    io.to(roomId).emit('chat-message', msg);
  });

  socket.on('disconnect', () => {
    const { username, roomId } = socket;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    delete room.users[socket.id];
    io.to(roomId).emit('user-left', { username, socketId: socket.id, users: Object.values(room.users) });
    if (Object.keys(room.users).length === 0) { delete rooms[roomId]; }
    console.log(`${username} left room "${roomId}"`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
