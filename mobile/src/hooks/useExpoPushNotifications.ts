import { useCallback, useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { registerBackgroundNotificationTask } from "../services/backgroundNotificationTask";

// Check if running in Expo Go client
export function checkIsExpoGo(): boolean {
  try {
    return (
      isRunningInExpoGo() ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    );
  } catch {
    return false;
  }
}

// Configure notification presentation when app is foregrounded
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  console.warn("Failed to set notification handler:", e);
}

/**
 * Create Android notification channels. Must be called before any
 * FCM notification can be displayed on the device. Channels are
 * created once at app startup; Android ignores duplicate calls.
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default Notifications",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync("hostella", {
      name: "Hostella Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
  } catch (channelErr) {
    console.warn("[Push] Error setting notification channels:", channelErr);
  }
}

/**
 * Get the device FCM push token. Falls back to Expo push token
 * if native token is unavailable. Returns null in Expo Go.
 */
export async function getDevicePushToken(): Promise<string | null> {
  try {
    if (checkIsExpoGo()) {
      console.log("[Push] Expo Go detected — push token disabled.");
      return null;
    }

    const existing = await Notifications.getPermissionsAsync().catch(() => null);
    const permission =
      existing?.status === "granted"
        ? existing
        : await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          }).catch(() => null);

    if (permission?.status !== "granted") {
      console.warn("[Push] Notification permission not granted — push token cannot be registered.");
      return null;
    }

    // 1. Native FCM device token (standalone APK / production)
    try {
      const tokenResult = await Notifications.getDevicePushTokenAsync();
      if (tokenResult?.data) {
        console.log("[Push] Native FCM token obtained ✓");
        return String(tokenResult.data);
      }
    } catch (deviceTokenErr) {
      console.warn("[Push] getDevicePushTokenAsync failed:", deviceTokenErr);
    }

    // 2. Expo push token (dev client fallback)
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        "2b6b1dbc-f72f-421f-80dc-40137f441017";
      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      if (tokenResult?.data) {
        console.log("[Push] Expo push token obtained ✓");
        return String(tokenResult.data);
      }
    } catch (expoPushErr) {
      console.warn("[Push] getExpoPushTokenAsync failed:", expoPushErr);
    }

    return null;
  } catch (error) {
    console.warn("[Push] Unable to get push token:", error);
    return null;
  }
}

export function useExpoPushNotifications(
  onNotificationResponse?: (data: Record<string, unknown>) => void
) {
  // Setup channels + permissions + background task once on mount
  useEffect(() => {
    async function configure() {
      try {
        await ensureNotificationChannels();

        const existing = await Notifications.getPermissionsAsync().catch(() => null);
        if (existing?.status !== "granted") {
          await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          }).catch(() => null);
        }

        // Register the background task (native builds only)
        if (!checkIsExpoGo()) {
          await registerBackgroundNotificationTask().catch(() => {});
        }
      } catch (err) {
        console.warn("[Push] Error configuring notifications:", err);
      }
    }

    void configure();
  }, []);

  // Listen for user tapping notifications (deep links)
  useEffect(() => {
    if (!onNotificationResponse) return;

    // Check if app was opened by a notification tap
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response?.notification?.request?.content?.data) {
          onNotificationResponse(
            response.notification.request.content.data as Record<string, unknown>
          );
        }
      })
      .catch(() => {});

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response.notification.request.content.data;
          if (data) {
            onNotificationResponse(data as Record<string, unknown>);
          }
        } catch {
          // Non-blocking
        }
      });
    } catch {
      // Ignored in unsupported environments
    }

    return () => {
      subscription?.remove();
    };
  }, [onNotificationResponse]);

  const getExpoPushToken = useCallback(async (): Promise<string | null> => {
    return getDevicePushToken();
  }, []);

  const scheduleLocalNotification = useCallback(
    async (title: string, body: string, data?: Record<string, unknown>) => {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: data ?? {},
            sound: "default",
            ...({
              channelId: "default",
              priority: Notifications.AndroidNotificationPriority.MAX,
            } as any),
          },
          trigger: null,
        });
      } catch (error) {
        console.warn("[Push] Unable to show local notification:", error);
      }
    },
    [],
  );

  return { getExpoPushToken, scheduleLocalNotification };
}
