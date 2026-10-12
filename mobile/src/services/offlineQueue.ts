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
const listeners = new Set<(online: boolean, queueCount: number) => void>();

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

/** Check server reachable */
export async function checkNetworkStatus(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${API_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    _isOnline = res.ok;
  } catch {
    _isOnline = false;
  }
  notifyListeners();
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
    void checkNetworkStatus();

    const interval = setInterval(() => {
      void checkNetworkStatus();
    }, 60000);

    return () => {
      listeners.delete(handler);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, queueCount, checkNetworkStatus };
}
