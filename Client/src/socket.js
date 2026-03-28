import { io } from "socket.io-client";

// In dev, Vite proxies /socket.io to the backend (see vite.config.js).
// In production, the socket connects to wherever the app is served from.
// Using window.location.origin makes this work in both environments.
const SOCKET_URL = import.meta.env.DEV
  ? "http://localhost:3001"
  : window.location.origin;

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});

export default socket;