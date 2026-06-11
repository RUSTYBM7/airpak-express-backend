/**
 * Real-time bridge between admin operators and the user app.
 *
 * Architecture
 * ------------
 * - One ws server attached to the same HTTP port as Express.
 * - Each client connects with ?token=<authToken>&room=<roomId>&role=user|admin.
 * - Clients are tracked by socket.id and grouped by `room` (= chat thread).
 * - A user posting a chat message goes through the existing POST
 *   /api/chat/messages route, which then calls `broadcastToRoom(...)` to
 *   fan out to every admin listening on that room.
 * - An admin posting through POST /api/admin/messages also routes
 *   through the same bus, landing instantly in the user's app.
 *
 * The WebSocket layer is intentionally transport-only. Persistence and
 * validation live in the existing REST routes. The bridge just shuttles
 * events between open sockets.
 */

import { WebSocketServer } from 'ws';
import { verifySocketAuth } from './services/auth.js';

/** Map<roomId, Set<{ ws, role, userId }>> */
const rooms = new Map();

/** Map<userId, ws> — for direct user→admin push (typing, presence). */
const userSockets = new Map();

/** Sequence counter used for the `seq` field on every broadcast. */
let _seq = 0;

function nextSeq() {
  _seq += 1;
  return _seq;
}

function joinRoom(roomId, peer) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(peer);
}

function leaveAllRooms(peer) {
  for (const set of rooms.values()) {
    set.delete(peer);
  }
  if (peer.userId) userSockets.delete(peer.userId);
}

export function broadcastToRoom(roomId, event, { exceptSender } = {}) {
  const set = rooms.get(roomId);
  if (!set) return 0;
  const payload = JSON.stringify({ ...event, seq: nextSeq(), room: roomId });
  let n = 0;
  for (const peer of set) {
    if (exceptSender && peer.ws === exceptSender) continue;
    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(payload);
      n += 1;
    }
  }
  return n;
}

export function isUserOnline(userId) {
  const sock = userSockets.get(userId);
  return !!(sock && sock.readyState === sock.OPEN);
}

export function listOnlineUsers() {
  return [...userSockets.keys()];
}
/** Per-user live status so admin UIs can see who's online. */
const presence = new Map();
function touchPresence(peer) {
  presence.set(peer.userId, {
    name: peer.name,
    role: peer.role,
    room: peer.room,
    connectedAt: presence.get(peer.userId)?.connectedAt || Date.now(),
    lastSeenAt: Date.now(),
  });
}
function dropPresence(peer) {
  if (!peer.userId) return;
  const cur = presence.get(peer.userId);
  if (!cur) return;
  cur.lastSeenAt = Date.now();
  cur.online = false;
}

export function listPresence() {
  return [...presence.entries()].map(([userId, p]) => ({
    userId,
    name: p.name,
    role: p.role,
    room: p.room,
    online: true,
    connectedAt: p.connectedAt,
    lastSeenAt: p.lastSeenAt,
  }));
}


export function listRooms() {
  return [...rooms.entries()].map(([room, peers]) => ({
    room,
    peerCount: peers.size,
    roles: [...peers].reduce((acc, p) => {
      acc[p.role] = (acc[p.role] || 0) + 1;
      return acc;
    }, {}),
  }));
}

export function attachLiveBridge(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  wss.on('connection', async (ws, req) => {
    // Parse query string auth.
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('token') || '';
    const room = url.searchParams.get('room') || 'global';
    const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'user';
    const auth = await verifySocketAuth(token);
    if (!auth.ok) {
      ws.send(JSON.stringify({ type: 'auth_error', message: auth.reason }));
      ws.close(1008, 'auth');
      return;
    }
    const peer = {
      ws,
      role,
      room,
      userId: auth.userId,
      name: auth.name || auth.userId,
    };
    joinRoom(room, peer);
    if (role === 'user') userSockets.set(auth.userId, ws);

    // Welcome frame
    ws.send(
      JSON.stringify({
        type: 'hello',
        seq: nextSeq(),
        room,
        role,
        serverTime: Date.now(),
      }),
    );

    // Tell the room a peer joined
    broadcastToRoom(
      room,
      {
        type: 'presence',
        action: 'join',
        userId: peer.userId,
        role,
        name: peer.name,
        online: true,
      },
      { exceptSender: ws },
    );

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', seq: nextSeq(), t: Date.now() }));
          return;
        case 'ping-presence':
          ws.send(JSON.stringify({
            type: 'admin-presence-snapshot',
            users: listPresence(),
          }));
          return;
        case 'typing':
          broadcastToRoom(
            room,
            {
              type: 'typing',
              userId: peer.userId,
              name: peer.name,
              role,
              typing: !!msg.typing,
            },
            { exceptSender: ws },
          );
          return;
        case 'chat':
          // Direct inbound from the websocket — persistence is the caller's
          // job; we just fan out to admins listening on the same room.
          broadcastToRoom(
            room,
            {
              type: 'chat',
              userId: peer.userId,
              name: peer.name,
              role,
              text: String(msg.text || '').slice(0, 4000),
              at: Date.now(),
            },
            { exceptSender: ws },
          );
          return;
        default:
          // Unknown frame — ignore.
          return;
      }
    });

    ws.on('close', () => {
      leaveAllRooms(peer);
      dropPresence(peer);
      broadcastToRoom(room, {
        type: 'presence',
        action: 'leave',
        userId: peer.userId,
        role,
        name: peer.name,
        online: false,
      });
      // After a peer leaves, push a fresh admin-presence snapshot to
      // every remaining admin in the same room.
      broadcastToRoom(room, {
        type: 'admin-presence-snapshot',
        users: listPresence(),
      });
    });

    ws.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.warn('[ws] socket error', err?.message || err);
    });
  });

  // eslint-disable-next-line no-console
  console.log('Live bridge ws:// /ws  ready');
  return wss;
}
