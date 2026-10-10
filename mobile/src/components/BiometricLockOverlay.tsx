import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";

interface BiometricLockOverlayProps {
  biometricLabel: string;
  authError?: string | null;
  onUnlock: () => void;
  onLogout: () => void;
}

export function BiometricLockOverlay({
  biometricLabel,
  authError,
  onUnlock,
  onLogout,
}: BiometricLockOverlayProps) {
  const { colors, isDark } = useTheme();

  const isFace = biometricLabel.toLowerCase().includes("face");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <View style={styles.content}>
        {/* Brand Icon */}
        <View style={[styles.iconRing, { backgroundColor: isDark ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.08)" }]}>
          <View style={[styles.iconInner, { backgroundColor: COLORS.primary }]}>
            <Ionicons
              name={isFace ? "scan-outline" : "finger-print-outline"}
              size={48}
              color="#FFFFFF"
            />
          </View>
        </View>

        {/* Title & Description */}
        <Text style={[styles.title, { color: colors.text }]}>Hostella Locked</Text>
        <Text style={[styles.subtitle, { color: colors.secondary }]}>
          Authenticate using your {biometricLabel} to access your hostel management dashboard.
        </Text>

        {/* Error message if any */}
        {authError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={COLORS.danger} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        ) : null}

        {/* Unlock Button */}
        <TouchableOpacity
          style={[styles.unlockButton, { backgroundColor: COLORS.primary }]}
          activeOpacity={0.85}
          onPress={onUnlock}
        >
          <Ionicons
            name={isFace ? "scan-outline" : "finger-print-outline"}
            size={22}
            color="#FFFFFF"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.unlockButtonText}>Unlock with {biometricLabel}</Text>
        </TouchableOpacity>

        {/* Sign Out Fallback */}
        <TouchableOpacity
          style={styles.switchButton}
          activeOpacity={0.7}
          onPress={onLogout}
        >
          <Text style={[styles.switchButtonText, { color: colors.secondary }]}>
            Sign Out / Switch Account
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  content: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  iconRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  iconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "500",
  },
  unlockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  unlockButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  switchButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  switchButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
