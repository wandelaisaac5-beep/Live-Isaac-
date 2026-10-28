const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSION_LENGTH_SECONDS = 180;

const session = {
  startedAt: Date.now(),
  endsAt: Date.now() + SESSION_LENGTH_SECONDS * 1000,
  closed: false,
  users: new Set(),
  messages: []
};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    session: {
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      closed: session.closed,
      usersOnline: session.users.size,
      messageCount: session.messages.length
    }
  });
});

function broadcastSessionState() {
  const remainingMs = Math.max(session.endsAt - Date.now(), 0);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  io.emit('session-state', {
    remainingSeconds,
    closed: session.closed,
    usersOnline: session.users.size,
    startedAt: session.startedAt,
    endsAt: session.endsAt
  });
}

function resetSession() {
  session.startedAt = Date.now();
  session.endsAt = Date.now() + SESSION_LENGTH_SECONDS * 1000;
  session.closed = false;
  session.messages = [];
  session.users.clear();
  io.emit('session-reset', {
    message: 'A new live session has started.'
  });
}

function closeSession() {
  if (session.closed) return;

  session.closed = true;
  io.emit('session-closed', {
    message: 'The live session has ended. You can re-enter after the cooldown window.'
  });
}

setInterval(() => {
  if (session.closed) {
    return;
  }

  if (Date.now() >= session.endsAt) {
    closeSession();
    return;
  }

  broadcastSessionState();
}, 1000);

io.on('connection', (socket) => {
  socket.on('join-session', ({ username }) => {
    const safeUsername = String(username || 'Guest')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 20);

    if (!safeUsername) {
      socket.emit('join-error', { message: 'Please provide a username.' });
      return;
    }

    if (session.closed) {
      socket.emit('join-error', {
        message: 'This live session is closed. Please wait for the next available session.'
      });
      return;
    }

    socket.username = safeUsername;
    session.users.add(safeUsername);

    socket.emit('session-state', {
      remainingSeconds: Math.max(Math.ceil((session.endsAt - Date.now()) / 1000), 0),
      closed: session.closed,
      usersOnline: session.users.size
    });

    socket.emit('chat-history', session.messages);
    io.emit('user-joined', { username: safeUsername, usersOnline: session.users.size });
    broadcastSessionState();
  });

  socket.on('chat-message', (message) => {
    const text = String(message || '').trim();

    if (!socket.username || !text) {
      return;
    }

    if (session.closed) {
      socket.emit('join-error', {
        message: 'The session has closed. Please wait for the next window.'
      });
      return;
    }

    const chatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      username: socket.username,
      text: text.slice(0, 500),
      timestamp: new Date().toISOString()
    };

    session.messages.push(chatMessage);

    if (session.messages.length > 100) {
      session.messages.shift();
    }

    io.emit('new-message', chatMessage);
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      session.users.delete(socket.username);
      io.emit('user-left', {
        username: socket.username,
        usersOnline: session.users.size
      });
      broadcastSessionState();
    }
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Live-Isaac is running on http://localhost:${PORT}`);
});
