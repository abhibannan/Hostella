const REMOTE_API_URL = "https://staynexa-1.onrender.com/api/v1";

// Local development server — only used when DEV flag is set manually
const LOCAL_LAN_IP = "192.168.0.183";
const LOCAL_API_URL = `http://${LOCAL_LAN_IP}:3000/api/v1`;

// Set USE_LOCAL=true ONLY when developing locally with a running backend
const USE_LOCAL = false;

export const getBaseApiUrl = (): string => {
  return USE_LOCAL ? LOCAL_API_URL : REMOTE_API_URL;
};

export const API_URL = getBaseApiUrl();

import { markOnline } from "./offlineQueue";

let lastWarmupAt = 0;
const WARMUP_COOLDOWN_MS = 25 * 1000; // Allow warming up every 25 seconds

export function warmupApi(force = false): void {
  const now = Date.now();
  if (!force && now - lastWarmupAt < WARMUP_COOLDOWN_MS) return;
  lastWarmupAt = now;

  fetch(`${API_URL}/health`, { method: "GET" })
    .then((res) => {
      if (res.ok) markOnline();
    })
    .catch(() => {});

  if (API_URL !== REMOTE_API_URL) {
    fetch(`${REMOTE_API_URL}/health`, { method: "GET" }).catch(() => {});
  }
}

// Background keepalive to prevent Render free-tier cold spin down while app is open
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
export function startApiKeepAlive(): () => void {
  if (keepAliveTimer) return () => {};
  keepAliveTimer = setInterval(() => {
    warmupApi(true);
  }, 3.5 * 60 * 1000); // Every 3.5 minutes

  return () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  };
}

export async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function apiRequest(path: string, options: RequestInit = {}, token?: string | null) {
  if (!token) throw new Error("You are not signed in.");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const message = data && typeof data === "object" ? (data as Record<string, unknown>).message : null;
    throw new Error(String(message || `Request failed: ${response.status}`));
  }
  markOnline();
  return data;
}
