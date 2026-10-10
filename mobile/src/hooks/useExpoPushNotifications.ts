import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { registerBackgroundNotificationTask } from "../services/backgroundNotificationTask";

// Check if running in Expo Go client (which can't use native FCM device tokens)
function checkIsExpoGo(): boolean {
  try {
    // In a standalone build, globalThis.__expo is not set to "storeClient"
    const appOwnership = (globalThis as any).expo?.modules?.ExpoConstants?.appOwnership;
    if (appOwnership === "expo") return true;
  } catch {
    // fallback — assume standalone
  }
  return false;
}

// Configure notification presentation when app is foregrounded or backgrounded
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

export function useExpoPushNotifications(
  onNotificationResponse?: (data: Record<string, unknown>) => void
) {
  useEffect(() => {
    async function configureChannelsAndPermissions() {
      try {
        if (Platform.OS === "android" && !checkIsExpoGo()) {
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
            // Suppress Expo Go channel manager absence
          }
        }

        const existing = await Notifications.getPermissionsAsync();
        if (existing.status !== "granted") {
          await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
        }

        // Register the background task so notifications arrive even when app is killed
        await registerBackgroundNotificationTask();
      } catch (err) {
        console.warn("Error configuring notifications channel/permissions:", err);
      }
    }

    void configureChannelsAndPermissions();
  }, []);

  // Listen for user tapping notifications (deep links)
  useEffect(() => {
    if (!onNotificationResponse) return;

    // Check if app was opened by a notification response
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification?.request?.content?.data) {
        onNotificationResponse(
          response.notification.request.content.data as Record<string, unknown>
        );
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data) {
        onNotificationResponse(data as Record<string, unknown>);
      }
    });

    return () => subscription.remove();
  }, [onNotificationResponse]);

  // Returns the native FCM device token (bypasses Expo's push relay which requires
  // deprecated Legacy FCM). Our backend sends directly via FCM V1 HTTP API.
  const getExpoPushToken = useCallback(async (): Promise<string | null> => {
    try {
      if (checkIsExpoGo()) {
        return null;
      }

      const existing = await Notifications.getPermissionsAsync();
      const permission =
        existing.status === "granted"
          ? existing
          : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") return null;

      // Use native FCM device token — works with FCM V1 directly
      const tokenResult = await Notifications.getDevicePushTokenAsync();
      return tokenResult.data as string;
    } catch (error) {
      console.warn("Unable to register for remote push notifications:", error);
      return null;
    }
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
        console.warn("Unable to show local notification:", error);
      }
    },
    [],
  );

  return { getExpoPushToken, scheduleLocalNotification };
}
