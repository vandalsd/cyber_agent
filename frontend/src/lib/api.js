import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

const TOKEN_KEY = "emergent_cyber_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const http = axios.create({ baseURL: API });
http.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export async function login(token) {
  const { data } = await axios.post(`${API}/auth/login`, { token });
  if (data.ok) setToken(data.token);
  return data;
}

export const getAgents = () => http.get("/agents").then((r) => r.data);
export const getHealth = () => http.get("/health").then((r) => r.data);
export const getSessions = () => http.get("/sessions").then((r) => r.data);
export const createSession = (title) =>
  http.post("/sessions", { title }).then((r) => r.data);
export const deleteSession = (id) =>
  http.delete(`/sessions/${id}`).then((r) => r.data);
export const getMessages = (id) =>
  http.get(`/sessions/${id}/messages`).then((r) => r.data);
export const sendChat = (text, session_id, agent) =>
  http
    .post("/orchestrator/chat", { text, session_id, agent })
    .then((r) => r.data);
export const sendDebate = (text, session_id, panel) =>
  http
    .post("/orchestrator/debate", { text, session_id, panel })
    .then((r) => r.data);
export const streamChatUrl = (text, session_id, agent) => {
  const params = new URLSearchParams({ text, token: getToken() });
  if (session_id) params.set("session_id", session_id);
  if (agent) params.set("agent", agent);
  return `${API}/orchestrator/chat/stream?${params.toString()}`;
};
export const getReports = () => http.get("/reports").then((r) => r.data);
export const getLogs = (level) =>
  http.get("/logs", { params: { level } }).then((r) => r.data);
export const getTelegramStatus = () =>
  http.get("/telegram/status").then((r) => r.data);
