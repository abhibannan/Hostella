/**
 * backgroundNotificationTask.ts
 *
 * Registers a background task that processes incoming push notifications
 * even when the app is fully killed / not running.
 *
 * How it works:
 * - expo-notifications + expo-task-manager register a native headless task
 * - When a push notification arrives while the app is killed, the OS wakes
 *   up the JS engine just enough to run this task
 * - The task can update badge count, store data, etc.
 *
 * IMPORTANT: This file must be imported at the TOP LEVEL (index.ts / App.tsx)
 * before `registerRootComponent` so the task is registered before the app mounts.
 */

import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { isRunningInExpoGo } from "expo";

export const BACKGROUND_NOTIFICATION_TASK = "STAYNEXA_BACKGROUND_NOTIFICATION";

/**
 * Define the background task that handles incoming notifications
 * when the app is killed or in background.
 *
 * This runs in a headless JS context — no React, no hooks, no UI.
 * Headless tasks are not supported in Expo Go and will throw if defined there.
 */
if (!isRunningInExpoGo()) {
  try {
    TaskManager.defineTask(
      BACKGROUND_NOTIFICATION_TASK,
      async ({ data, error }: TaskManager.TaskManagerTaskBody<{ notification: Notifications.Notification }>) => {
        if (error) {
          console.warn("[BackgroundNotif] Task error:", error);
          return;
        }

        if (data) {
          const { notification } = data;
          const content = notification?.request?.content;

          if (content) {
            console.log(
              "[BackgroundNotif] Received in background/killed state:",
              content.title,
              content.body,
            );
          }
        }
      },
    );
  } catch (taskDefErr) {
    console.warn("[BackgroundNotif] TaskManager.defineTask ignored:", taskDefErr);
  }
}

/**
 * Register the background notification task with expo-notifications.
 * This tells the system to wake up our JS engine when a push arrives.
 */
export async function registerBackgroundNotificationTask(): Promise<void> {
  if (isRunningInExpoGo()) {
    return;
  }
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_NOTIFICATION_TASK,
    ).catch(() => false);

    if (!isRegistered) {
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      console.log("[BackgroundNotif] Background notification task registered ✓");
    }
  } catch (err) {
    // Only works in dev builds / standalone
    console.warn(
      "[BackgroundNotif] Could not register background task:",
      err,
    );
  }
}
