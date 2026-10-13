import React from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

interface MaintenanceScreenProps {
  notice?: string;
  isChecking: boolean;
  onCheckStatus: () => void;
  onLogout: () => void;
}

export function MaintenanceScreen({
  notice,
  isChecking,
  onCheckStatus,
  onLogout,
}: MaintenanceScreenProps) {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <View style={[styles.maintenanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View
          style={[
            styles.maintenanceIconBadge,
            {
              backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "#FFFBEB",
              borderColor: "#F59E0B",
            },
          ]}
        >
          <Ionicons name="construct-outline" size={32} color="#F59E0B" />
        </View>
        <View style={[styles.maintenancePill, { backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#FEF3C7" }]}>
          <Text style={[styles.maintenancePillText, { color: "#F59E0B" }]}>SYSTEM NOTICE</Text>
        </View>
        <Text style={[styles.maintenanceTitle, { color: colors.text }]}>Platform Under Maintenance</Text>
        <Text style={[styles.maintenanceMessage, { color: colors.secondary }]}>
          {notice || "Hostella is currently undergoing scheduled platform upgrades. Services will resume shortly."}
        </Text>
        <TouchableOpacity
          style={[styles.maintenanceRefreshBtn, { backgroundColor: colors.text }]}
          onPress={onCheckStatus}
          disabled={isChecking}
        >
          {isChecking ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="refresh-outline" size={15} color={colors.background} />
              <Text style={[styles.maintenanceRefreshBtnText, { color: colors.background }]}>Check System Status</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 20, alignItems: "center" }}
          onPress={onLogout}
        >
          <Text style={{ fontSize: 13, color: colors.secondary, fontWeight: "600" }}>
            Log Out
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  maintenanceCard: {
    width: "100%",
    maxWidth: 380,
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  maintenanceIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  maintenancePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 12,
  },
  maintenancePillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  maintenanceTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  maintenanceMessage: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  maintenanceRefreshBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  maintenanceRefreshBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
