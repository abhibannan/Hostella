import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useOfflineSync } from "../services/offlineQueue";

interface OfflineBannerProps {
  onSyncPress?: () => void;
}

export function OfflineBanner({ onSyncPress }: OfflineBannerProps) {
  const { isOnline, queueCount, checkNetworkStatus } = useOfflineSync();
  const [startupGraceExpired, setStartupGraceExpired] = React.useState(false);

  React.useEffect(() => {
    // 8s grace period on initial launch to prevent flashing offline status during server warmup
    const t = setTimeout(() => {
      setStartupGraceExpired(true);
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  // Never show offline warning during initial launch if there are no pending changes
  if (!startupGraceExpired && queueCount === 0) return null;

  if (isOnline && queueCount === 0) return null;

  return (
    <View style={[styles.banner, !isOnline ? styles.offlineBg : styles.syncingBg]}>
      <Ionicons
        name={!isOnline ? "cloud-offline" : "sync"}
        size={16}
        color="#FFFFFF"
        style={{ marginRight: 6 }}
      />
      <Text style={styles.text}>
        {!isOnline
          ? `Offline Mode ${queueCount > 0 ? `(${queueCount} pending changes)` : ""}`
          : `Syncing ${queueCount} offline change${queueCount > 1 ? "s" : ""}...`}
      </Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => {
          void checkNetworkStatus();
          onSyncPress?.();
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.retryText}>{!isOnline ? "Retry" : "Sync Now"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineBg: {
    backgroundColor: "#DC2626",
  },
  syncingBg: {
    backgroundColor: "#D97706",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  retryBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
