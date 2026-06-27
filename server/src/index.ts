import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameRoom } from './GameRoom.js';
import { Leaderboard } from './Leaderboard.js';
import { PvCLeaderboard } from './PvCLeaderboard.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const CLIENT_ORIGIN = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173';

const pvcLeaderboard = new PvCLeaderboard();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/leaderboard', (_req, res) => res.json(leaderboard.getTop(20)));
app.get('/leaderboard/pvc', async (_req, res) => {
  // Make sure the initial Blob load is complete before returning data
  // so the first request after boot doesn't see an empty leaderboard.
  await pvcLeaderboard.whenReady();
  res.json(pvcLeaderboard.getTop(20));
});
app.post('/pvc/streak', async (req, res) => {
  await pvcLeaderboard.whenReady();
  const { name, streak } = req.body ?? {};
  if (typeof name !== 'string' || typeof streak !== 'number' || streak < 0) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  // Await the save so the client doesn't get a response until the
  // submission is durable on Blob (or file). Adds ~100-200ms but avoids
  // losing in-flight writes when the server is shut down for redeploy.
  const entry = await pvcLeaderboard.submit(name, Math.floor(streak));
  res.json({ entry, top: pvcLeaderboard.getTop(20) });
});

// Diagnostics — confirms Blob token is set and shows last save outcome
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
