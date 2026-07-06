import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { GameRoom } from './GameRoom.js';
import { Leaderboard } from './Leaderboard.js';
import { PvCLeaderboard } from './PvCLeaderboard.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const CLIENT_ORIGIN = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173';

const pvcLeaderboard = new PvCLeaderboard();

const app = express();
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Rate limiter for streak submissions — 10 per IP per 15 minutes
const streakLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions — try again in 15 minutes' },
});

// Real health check — pings the DB so Render restarts if it's broken
app.get('/health', async (_req, res) => {
  try {
    await pvcLeaderboard.whenReady();
    const debug = await pvcLeaderboard.getDebug();
    if (debug.dbConnected) {
      res.json({ ok: true, db: 'connected' });
    } else {
      res.status(503).json({ ok: false, db: 'not connected' });
    }
  } catch {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

app.get('/leaderboard', (_req, res) => res.json(leaderboard.getTop(20)));
app.get('/leaderboard/pvc', async (_req, res) => {
  await pvcLeaderboard.whenReady();
  res.json(await pvcLeaderboard.getTop(20));
});
app.post('/pvc/streak', streakLimiter, async (req, res) => {
  await pvcLeaderboard.whenReady();
  const { name, streak } = req.body ?? {};

  // Server-side validation — clients can be bypassed, server cannot
  if (typeof name !== 'string' || typeof streak !== 'number') {
    return res.status(400).json({ error: 'invalid payload' });
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }
  if (trimmedName.length > 20) {
    return res.status(400).json({ error: 'name too long (max 20 chars)' });
  }
  const flooredStreak = Math.floor(streak);
  if (flooredStreak < 1 || flooredStreak > 999) {
    return res.status(400).json({ error: 'streak out of range' });
  }

  const entry = await pvcLeaderboard.submit(trimmedName, flooredStreak);
  res.json({ entry, top: await pvcLeaderboard.getTop(20) });
});

app.get('/pvc/debug', async (_req, res) => {
  await pvcLeaderboard.whenReady();
  res.json(await pvcLeaderboard.getDebug());
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  transports: ['websocket'],
});

// ── State ──────────────────────────────────────────────────────────────────
const leaderboard = new Leaderboard();
const rooms       = new Map<string, GameRoom>();

// Queue: { socketId, name }
const compQueue:   Array<{ socketId: string; name: string }> = [];
const casualQueue: Array<{ socketId: string; name: string }> = [];

let roomCounter = 0;
function nextRoomId() { return `room-${++roomCounter}`; }

function broadcastLeaderboard(): void {
  io.emit('comp:leaderboard', { entries: leaderboard.getTop(10) });
}

// ── Matchmaking ────────────────────────────────────────────────────────────
function tryMatch(
  queue: Array<{ socketId: string; name: string }>,
  ns: 'comp' | 'casual',
): void {
  if (queue.length < 2) return;
  const [p1, p2] = queue.splice(0, 2);
  const roomId = nextRoomId();

  const room = new GameRoom(
    roomId,
    p1.socketId, p1.name,
    p2.socketId, p2.name,
    io, ns,
    ns === 'comp' ? leaderboard : null,
    (id) => {
      rooms.delete(id);
      if (ns === 'comp') broadcastLeaderboard();
    },
  );

  rooms.set(roomId, room);
  room.start();
}

// ── Socket handlers ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // Competition
  socket.on('comp:join', ({ name }: { name: string }) => {
    leaderboard.upsert(name);
    compQueue.push({ socketId: socket.id, name });
    socket.emit('comp:waiting', {});
    tryMatch(compQueue, 'comp');
    broadcastLeaderboard();
  });

  socket.on('comp:gesture', ({ roomId, gesture }: { roomId: string; gesture: string }) => {
    rooms.get(roomId)?.receiveGesture(socket.id, gesture as 'rock' | 'paper' | 'scissors');
  });

  socket.on('comp:leave', () => {
    const idx = compQueue.findIndex((p) => p.socketId === socket.id);
    if (idx !== -1) compQueue.splice(idx, 1);
    for (const [, room] of rooms) {
      if (room.hasSocket(socket.id)) {
        room.handleDisconnect(socket.id);
        break;
      }
    }
  });

  // Casual PvP
  socket.on('casual:join', ({ name }: { name: string }) => {
    casualQueue.push({ socketId: socket.id, name });
    socket.emit('casual:waiting', {});
    tryMatch(casualQueue, 'casual');
  });

  socket.on('casual:gesture', ({ roomId, gesture }: { roomId: string; gesture: string }) => {
    rooms.get(roomId)?.receiveGesture(socket.id, gesture as 'rock' | 'paper' | 'scissors');
  });

  socket.on('casual:leave', () => {
    const idx = casualQueue.findIndex((p) => p.socketId === socket.id);
    if (idx !== -1) casualQueue.splice(idx, 1);
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);

    // Remove from queues
    for (const q of [compQueue, casualQueue]) {
      const idx = q.findIndex((p) => p.socketId === socket.id);
      if (idx !== -1) q.splice(idx, 1);
    }

    // Notify game rooms
    for (const [, room] of rooms) {
      if (room.hasSocket(socket.id)) {
        room.handleDisconnect(socket.id);
        break;
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`HandDuel server running on :${PORT}`);
});
