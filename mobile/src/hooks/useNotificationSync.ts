/**
 * useNotificationSync.ts
 *
 * Bridges in-app notifications with OS notification bar.
 * When new unread notifications arrive from the API, this hook fires
 * local OS notifications via expo-notifications so they appear in the
 * device's notification bar / tray.
 *
 * Uses AsyncStorage to track which notification IDs have already been
 * surfaced as OS notifications to avoid duplicates across app restarts.
 */

import { useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { Notification } from "../types";

const SEEN_NOTIF_KEY = "@staynexa_seen_os_notifs_v1";
const MAX_STORED_IDS = 500; // Cap stored IDs to prevent unbounded growth

type ScheduleLocalFn = (
  title: string,
  body: string,
  data?: Record<string, unknown>,
) => Promise<void>;

/**
 * Load the set of notification IDs that have already been pushed to the OS.
 */
async function loadSeenIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_NOTIF_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    }
  } catch {
    // Corrupted storage — start fresh
  }
  return new Set();
}

/**
 * Persist the seen IDs (trimmed to MAX_STORED_IDS most recent).
 */
async function saveSeenIds(ids: Set<string>): Promise<void> {
  try {
    const arr = Array.from(ids);
    // Keep only the most recent IDs if we exceed the cap
    const trimmed = arr.length > MAX_STORED_IDS ? arr.slice(-MAX_STORED_IDS) : arr;
    await AsyncStorage.setItem(SEEN_NOTIF_KEY, JSON.stringify(trimmed));
  } catch {
    // Non-critical — worst case is a duplicate OS notification
  }
}

export function useNotificationSync(
  notifications: Notification[],
  scheduleLocalNotification: ScheduleLocalFn,
  isLoggedIn: boolean,
  currentUserId?: string,
  currentUserRole?: string,
  onPollNotifications?: () => Promise<void> | void,
) {
  // In-memory cache of seen IDs (initialized lazily from AsyncStorage)
  const seenIdsRef = useRef<Set<string> | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Initialize seen IDs from storage (once)
  const ensureInit = useCallback(async () => {
    if (seenIdsRef.current !== null) return;
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }
    initPromiseRef.current = (async () => {
      seenIdsRef.current = await loadSeenIds();
    })();
    await initPromiseRef.current;
  }, []);

  // Active periodic sync & AppState listener to fetch fresh notifications
  useEffect(() => {
    if (!isLoggedIn || !onPollNotifications) return;

    // Fetch immediately on mount / login
    void onPollNotifications();

    // Poll every 20 seconds while app is open
    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void onPollNotifications();
      }
    }, 20000);

    // Also poll whenever app returns to foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void onPollNotifications();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [isLoggedIn, onPollNotifications]);

  // Core sync: compare notifications vs seen IDs, fire OS notifications for new ones
  useEffect(() => {
    if (!isLoggedIn || notifications.length === 0) return;

    let cancelled = false;

    (async () => {
      await ensureInit();
      if (cancelled || !seenIdsRef.current) return;

      const seenIds = seenIdsRef.current;
      const newNotifs: Notification[] = [];

      for (const notif of notifications) {
        if (!notif.id || seenIds.has(notif.id)) continue;

        // The admin / sender must NEVER receive OS notifications for notifications they sent
        const isSentBySelf =
          Boolean((notif as any).sentByMe) ||
          (Boolean(currentUserId) && (
            (notif as any).senderId === currentUserId ||
            (notif as any).createdBy === currentUserId
          ));

        // Admins should not receive OS notifications for resident broadcasts or announcements
        const isAdminBroadcast =
          currentUserRole !== "RENTER" &&
          (notif.entityType === "BROADCAST" || notif.userId === "ALL" || notif.type === "ANNOUNCEMENT");

        if (isSentBySelf || isAdminBroadcast) {
          seenIds.add(notif.id);
          continue;
        }

        // Only push unread notifications to OS bar
        if (notif.read) {
          seenIds.add(notif.id);
          continue;
        }

        newNotifs.push(notif);
        seenIds.add(notif.id);
      }

      if (newNotifs.length === 0) return;

      // Fire OS notifications (limit to 5 at a time to avoid notification spam)
      const toFire = newNotifs.slice(0, 5);
      for (const notif of toFire) {
        await scheduleLocalNotification(
          notif.title || "Hostella",
          notif.message || "You have a new notification",
          {
            notificationId: notif.id,
            type: notif.type,
            entityType: notif.entityType ?? undefined,
            entityId: notif.entityId ?? undefined,
          },
        );
      }

      // If there are more than 5, show a summary
      if (newNotifs.length > 5) {
        await scheduleLocalNotification(
          "Hostella",
          `You have ${newNotifs.length - 5} more new notifications`,
          { type: "SUMMARY" },
        );
      }

      // Persist updated seen IDs
      await saveSeenIds(seenIds);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    notifications,
    isLoggedIn,
    currentUserId,
    currentUserRole,
    scheduleLocalNotification,
    ensureInit,
  ]);

  // Clear seen IDs on logout
  useEffect(() => {
    if (!isLoggedIn) {
      seenIdsRef.current = null;
      initPromiseRef.current = null;
    }
  }, [isLoggedIn]);
}
