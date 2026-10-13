import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { API_URL } from "./api";

export interface QueuedAction {
  id: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  timestamp: number;
  description: string;
}

const STORAGE_KEY = "@hosteldesk_offline_action_queue";

let _isOnline = true;
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_OFFLINE = 2;
const listeners = new Set<(online: boolean, queueCount: number) => void>();

/** Mark the client as explicitly online whenever any network request succeeds */
export function markOnline(): void {
  consecutiveFailures = 0;
  if (!_isOnline) {
    _isOnline = true;
    notifyListeners();
  }
}

export function isCurrentlyOnline(): boolean {
  return _isOnline;
}

export async function getOfflineQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function enqueueOfflineAction(action: Omit<QueuedAction, "id" | "timestamp">): Promise<QueuedAction> {
  const queue = await getOfflineQueue();
  const newAction: QueuedAction = {
    ...action,
    id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };
  queue.push(newAction);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  notifyListeners();
  return newAction;
}

export async function removeOfflineAction(id: string): Promise<void> {
  const queue = await getOfflineQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  notifyListeners();
}

export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  notifyListeners();
}

/** Check server reachable with generous 10s timeout and multi-check resilience */
let isCheckingNetwork = false;
export async function checkNetworkStatus(): Promise<boolean> {
  if (isCheckingNetwork) return _isOnline;
  isCheckingNetwork = true;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${API_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      consecutiveFailures = 0;
      if (!_isOnline) {
        _isOnline = true;
        notifyListeners();
      }
      return true;
    } else {
      consecutiveFailures++;
    }
  } catch {
    consecutiveFailures++;
  } finally {
    isCheckingNetwork = false;
  }

  // Only flip to offline mode after confirmed consecutive failures
  if (consecutiveFailures >= MAX_FAILURES_BEFORE_OFFLINE) {
    if (_isOnline) {
      _isOnline = false;
      notifyListeners();
    }
  } else {
    // Schedule one immediate background retry in 2.5s before declaring offline
    setTimeout(() => {
      void checkNetworkStatus();
    }, 2500);
  }

  return _isOnline;
}

/** Flush and sync all queued actions to the backend */
export async function flushOfflineQueue(
  requestFn: (endpoint: string, options?: RequestInit) => Promise<any>
): Promise<{ success: number; failed: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const item of queue) {
    try {
      await requestFn(item.endpoint, {
        method: item.method,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      success++;
    } catch (err) {
      console.warn(`[OfflineQueue] Failed to replay action ${item.id}:`, err);
      failed++;
      remaining.push(item);
    }
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  notifyListeners();
  return { success, failed };
}

function notifyListeners() {
  getOfflineQueue().then((q) => {
    listeners.forEach((l) => l(_isOnline, q.length));
  });
}

/** React hook to subscribe to network status and pending queue count */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(_isOnline);
  const [queueCount, setQueueCount] = useState<number>(0);

  useEffect(() => {
    getOfflineQueue().then((q) => setQueueCount(q.length));

    const handler = (online: boolean, count: number) => {
      setIsOnline(online);
      setQueueCount(count);
    };

    listeners.add(handler);
    const initialCheck = setTimeout(() => {
      void checkNetworkStatus();
    }, 1200);

    const interval = setInterval(() => {
      void checkNetworkStatus();
    }, 60000);

    return () => {
      listeners.delete(handler);
      clearTimeout(initialCheck);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, queueCount, checkNetworkStatus };
}
