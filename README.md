const socket = io();

const joinPanel = document.getElementById('join-panel');
const chatLayout = document.getElementById('chat-layout');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const countdownEl = document.getElementById('countdown');
const statusEl = document.getElementById('join-status');
const userCountEl = document.getElementById('user-count');
const chatForm = document.getElementById('chat-form');

let username = '';

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#fca5a5' : '#cbd5e1';
}

function appendSystemMessage(message) {
  const item = document.createElement('div');
  item.className = 'system-message';
  item.textContent = message;
  messagesContainer.appendChild(item);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendMessage(msg) {
  const item = document.createElement('div');
  const isMine = msg.username === username;
  item.className = `message ${isMine ? 'me' : ''}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<strong>${msg.username}</strong><span>${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;

  const text = document.createElement('div');
  text.textContent = msg.text;

  item.appendChild(meta);
  item.appendChild(text);
  messagesContainer.appendChild(item);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setSessionState({ remainingSeconds, closed, usersOnline }) {
  countdownEl.textContent = formatCountdown(remainingSeconds || 0);
  userCountEl.textContent = `${usersOnline || 0} online`;

  if (closed) {
    setStatus('This live session is closed. Please wait for the next window.', true);
  }
}

joinBtn.addEventListener('click', () => {
  username = usernameInput.value.trim();

  if (!username) {
    setStatus('Please enter a valid username.', true);
    return;
  }

  socket.emit('join-session', { username });
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit('chat-message', text);
  messageInput.value = '';
});

socket.on('session-state', (state) => {
  setSessionState(state);
});

socket.on('session-reset', (payload) => {
  appendSystemMessage(payload.message);
  setStatus('A new live session has started.');
  messagesContainer.innerHTML = '';
});

socket.on('session-closed', (payload) => {
  appendSystemMessage(payload.message);
  setSessionState({ remainingSeconds: 0, closed: true, usersOnline: 0 });
});

socket.on('join-error', ({ message }) => {
  setStatus(message, true);
});

socket.on('chat-history', (messages) => {
  messagesContainer.innerHTML = '';
  messages.forEach((message) => appendMessage(message));
  appendSystemMessage('You joined the chat.');
  joinPanel.classList.add('hidden');
  chatLayout.classList.remove('hidden');
});

socket.on('user-joined', ({ username: joinedUser, usersOnline }) => {
  appendSystemMessage(`${joinedUser} joined the chat.`);
  userCountEl.textContent = `${usersOnline} online`;
});

socket.on('user-left', ({ username: leftUser, usersOnline }) => {
  appendSystemMessage(`${leftUser} left the chat.`);
  userCountEl.textContent = `${usersOnline} online`;
});

socket.on('new-message', (message) => {
  appendMessage(message);
});

usernameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    joinBtn.click();
  }
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

setStatus('Choose a username to enter the live room.');
setSessionState({ remainingSeconds: 180, closed: false, usersOnline: 0 });
