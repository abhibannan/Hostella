import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

export interface AlertBannerData {
  active: boolean;
  title: string;
  message: string;
  level: "INFO" | "WARN" | "CRITICAL";
  updatedAt: string;
  updatedBy: string;
}

interface GlobalAlertBannerProps {
  banner?: AlertBannerData | null;
  dismissed: boolean;
  onDismiss: () => void;
}

export function GlobalAlertBanner({ banner, dismissed, onDismiss }: GlobalAlertBannerProps) {
  const { colors, isDark } = useTheme();

  if (!banner?.active || dismissed) return null;

  const isCritical = banner.level === "CRITICAL";
  const isWarn = banner.level === "WARN";
  const bannerBg = isCritical
    ? isDark
      ? "rgba(239, 68, 68, 0.15)"
      : "#FEF2F2"
    : isWarn
      ? isDark
        ? "rgba(245, 158, 11, 0.15)"
        : "#FFFBEB"
      : isDark
        ? "rgba(56, 189, 248, 0.15)"
        : "#F0F9FF";
  const bannerBorder = isCritical ? "#EF4444" : isWarn ? "#F59E0B" : "#0284C7";
  const bannerIcon = isCritical ? "alert-circle" : isWarn ? "warning" : "information-circle";

  return (
    <View style={[styles.container, { backgroundColor: bannerBg, borderColor: bannerBorder }]}>
      <Ionicons name={bannerIcon as any} size={18} color={bannerBorder} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>{banner.title}</Text>
        <Text style={[styles.text, { color: colors.secondary }]}>{banner.message}</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={16} color={colors.secondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    zIndex: 999,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  text: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
});
