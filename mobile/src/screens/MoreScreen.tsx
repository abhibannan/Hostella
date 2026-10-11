import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  StyleSheet,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../contexts/ThemeContext";
import { ThemeMode, GRADIENTS, GOLD, RADIUS, shadow } from "../constants/theme";
import { Hostel, User } from "../types";
import { HostellaBrand } from "../components/HostellaBrand";
import { haptic } from "../utils/haptics";
import { API_URL } from "../services/api";

interface MoreScreenProps {
  currentUser?: User | null;
  token?: string | null;
  hostels?: Hostel[];
  onRefreshHostels?: () => void;
  onNavigateToFees: () => void;
  onNavigateToPayments: () => void;
  onNavigateToRepairs: () => void;
  onNavigateToDashboard: () => void;
  onNavigateToHostels?: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  biometricLabel?: string;
  isBiometricsEnabled?: boolean;
  isBiometricsSupported?: boolean;
  onToggleBiometrics?: (enable: boolean) => Promise<boolean>;
  onOpenAuditLogs?: () => void;
  onNavigateToNotifications?: () => void;
}

type Colors = ReturnType<typeof useTheme>["colors"];

/** Section label */
function Label({ children, colors }: { children: string; colors: Colors }) {
  return <Text style={[styles.sectionLabel, { color: colors.secondary }]}>{children}</Text>;
}

/** A rounded group that holds rows separated by hairline dividers */
function Group({ children, colors, isDark }: { children: React.ReactNode; colors: Colors; isDark: boolean }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }, shadow(1, isDark)]}>
      {items.map((child, i) => (
        <View key={i}>
          {child}
          {i < items.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
        </View>
      ))}
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
  fg,
  bg,
  colors,
  right,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  fg: string;
  bg: string;
  colors: Colors;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerLight : bg }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: danger ? colors.danger : colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colors.secondary }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={colors.secondary} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        haptic.cardPress();
        onPress();
      }}
      android_ripple={{ color: colors.primaryLight }}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSecondary } : null)}
    >
      {content}
    </Pressable>
  );
}

function GridItem({
  icon,
  title,
  subtitle,
  onPress,
  fg,
  bg,
  colors,
  danger = false,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  fg: string;
  bg: string;
  colors: Colors;
  danger?: boolean;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.cardPress();
        onPress();
      }}
      style={({ pressed }) => [
        styles.gridItem,
        { backgroundColor: colors.card, borderColor: colors.border },
        shadow(1, isDark),
        pressed && { backgroundColor: colors.surfaceSecondary },
      ]}
    >
      <View style={[styles.gridIcon, { backgroundColor: danger ? colors.dangerLight : bg }]}>
        <Ionicons name={icon} size={24} color={danger ? colors.danger : fg} />
      </View>
      <Text style={[styles.gridTitle, { color: danger ? colors.danger : colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.gridSub, { color: colors.secondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function MoreScreen({
  currentUser,
  token,
  onNavigateToPayments,
  onNavigateToRepairs,
  onNavigateToHostels,
  onRefresh,
  onLogout,
  onToggleTheme,
  biometricLabel = "Biometric / Face Recognition",
  isBiometricsEnabled = false,
  isBiometricsSupported = false,
  onToggleBiometrics,
  onOpenAuditLogs,
  onNavigateToNotifications,
}: MoreScreenProps) {
  const { colors, isDark } = useTheme();
  const [testingPush, setTestingPush] = useState(false);

  const handleTestPushDelayed = async () => {
    if (!token) {
      Alert.alert("Sign In Required", "You must be signed in to test notifications.");
      return;
    }
    setTestingPush(true);
    try {
      const res = await fetch(`${API_URL}/notifications/push-token/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ delaySeconds: 5 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert(
          "🔔 Test Push Scheduled!",
          "Notification will arrive in 5 seconds.\n\n👉 Press your phone's Home button or lock your screen NOW to see it appear while the app is closed!",
          [{ text: "OK" }],
        );
      } else {
        Alert.alert("Push Test", (data as any)?.message || "Failed to schedule test push.");
      }
    } catch (e: any) {
      Alert.alert("Push Test Error", e?.message || "Could not reach server.");
    } finally {
      setTestingPush(false);
    }
  };

  function handleLogout() {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: onLogout },
    ]);
  }

  const initials = currentUser
    ? `${currentUser.firstName?.[0] || ""}${currentUser.lastName?.[0] || ""}`.toUpperCase() ||
    (currentUser.email?.[0] || "A").toUpperCase()
    : "A";

  const displayName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.email
    : "Admin";

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const heroColors = isDark ? GRADIENTS.heroDark : GRADIENTS.hero;

  const roleDisplayName = currentUser?.role === "SUPER_ADMIN" ? "Super Admin" :
                          currentUser?.role === "ADMIN" ? "Hostel Admin" :
                          currentUser?.role === "REPAIR_PERSON" ? "Repair Tech" :
                          currentUser?.role === "RENTER" ? "Renter" :
                          "User";

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Menu</Text>
        <HostellaBrand variant="full" colorScheme={isDark ? "dark" : "light"} size="small" />
      </View>
      <Text style={[styles.pageSub, { color: colors.secondary }]}>Settings, app colors, and your account.</Text>

      {/* Profile */}
      <View style={[{ borderRadius: RADIUS.xxl, backgroundColor: heroColors[1] }, shadow(3, isDark)]}>
        <LinearGradient
          colors={heroColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profile}
        >
          <View style={[styles.orb, { width: 190, height: 190, top: -70, right: -60, backgroundColor: "rgba(255,255,255,0.09)" }]} />
          <View style={[styles.orb, { width: 110, height: 110, bottom: -40, left: -30, backgroundColor: "rgba(139,92,246,0.35)" }]} />
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {displayName}
            </Text>
            {currentUser?.email ? (
              <Text style={styles.profileEmail} numberOfLines={1}>
                {currentUser.email}
              </Text>
            ) : null}
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={11} color={GOLD} />
              <Text style={styles.roleText}>{roleDisplayName}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <Label colors={colors}>MAIN MENU</Label>
      <View style={styles.gridContainer}>
        <GridItem
          icon="wallet-outline"
          title="Payments"
          subtitle="Rent & fees"
          fg={colors.success}
          bg={colors.successLight}
          onPress={onNavigateToPayments}
          colors={colors}
          isDark={isDark}
        />
        <GridItem
          icon="build-outline"
          title="Repairs"
          subtitle="Fix problems"
          fg={colors.warning}
          bg={colors.warningLight}
          onPress={onNavigateToRepairs}
          colors={colors}
          isDark={isDark}
        />

        <GridItem
          icon="business-outline"
          title="Properties"
          subtitle="Manage hostels"
          fg={colors.purple}
          bg={colors.purpleLight}
          onPress={onNavigateToHostels || (() => {})}
          colors={colors}
          isDark={isDark}
        />
        <GridItem
          icon="log-out-outline"
          title="Logout"
          subtitle="Exit the app"
          danger
          fg={colors.danger}
          bg={colors.dangerLight}
          onPress={handleLogout}
          colors={colors}
          isDark={isDark}
        />
      </View>

      <Label colors={colors}>COMMUNICATION</Label>
      <Group colors={colors} isDark={isDark}>
        <Row
          icon="megaphone-outline"
          title="Announcements & Notices"
          subtitle="Send broadcast alerts to residents"
          fg={colors.primary}
          bg={colors.primaryLight}
          colors={colors}
          onPress={onNavigateToNotifications}
        />
      </Group>

      <Label colors={colors}>APP SETTINGS</Label>
      <Group colors={colors} isDark={isDark}>

        <Row
          icon={isDark ? "moon" : "sunny"}
          title={isDark ? "Dark Mode" : "Light Mode"}
          subtitle="Change the background color"
          fg={isDark ? colors.purple : colors.warning}
          bg={isDark ? colors.purpleLight : colors.warningLight}
          colors={colors}
          right={
            <Switch
              value={isDark}
              onValueChange={() => {
                haptic.selection();
                onToggleTheme();
              }}
              trackColor={{ false: colors.grayFill, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          }
        />
        <Row
          icon={biometricLabel.toLowerCase().includes("face") ? "scan-outline" : "finger-print-outline"}
          title={`${biometricLabel} Login`}
          subtitle={
            isBiometricsSupported
              ? "Login without typing a password"
              : "Not setup on this phone"
          }
          fg={isBiometricsEnabled ? colors.success : colors.primary}
          bg={isBiometricsEnabled ? colors.successLight : colors.primaryLight}
          colors={colors}
          right={
            <Switch
              disabled={!isBiometricsSupported}
              value={Boolean(isBiometricsEnabled)}
              onValueChange={async (val) => {
                try {
                  await onToggleBiometrics?.(val);
                } catch (err: any) {
                  Alert.alert("Biometrics Error", err?.message || "Could not toggle biometrics.");
                }
              }}
              trackColor={{ false: colors.grayFill, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          }
        />
      </Group>

      <Label colors={colors}>NOTIFICATIONS & DIAGNOSTICS</Label>
      <Group colors={colors} isDark={isDark}>
        <Row
          icon="notifications-outline"
          title={testingPush ? "Scheduling Push…" : "Test Push Notification (5s Delay)"}
          subtitle="Tap, then immediately swipe away or lock phone"
          fg={colors.primary}
          bg={colors.primaryLight}
          colors={colors}
          onPress={handleTestPushDelayed}
        />
      </Group>

      <Text style={[styles.versionText, { color: colors.secondary }]}>Hostella v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { padding: 20, paddingBottom: 36 },

  pageTitle: { fontSize: 30, fontWeight: "800", letterSpacing: -0.9, marginTop: 2 },
  pageSub: { fontSize: 14, marginTop: 4, marginBottom: 20 },

  profile: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.xxl,
    padding: 20,
    gap: 16,
    overflow: "hidden",
  },
  orb: { position: "absolute", borderRadius: 999 },
  avatarRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: "rgba(245,181,68,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 21, fontWeight: "800", letterSpacing: 1 },
  profileName: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  profileEmail: { color: "rgba(255,255,255,0.75)", fontSize: 12.5, marginTop: 2 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  roleText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },

  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginTop: 26, marginBottom: 10, marginLeft: 6 },

  group: { borderRadius: RADIUS.xl, borderWidth: StyleSheet.hairlineWidth * 2, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 72 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  rowSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  gridContainer: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gridItem: {
    width: "48%",
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 16,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  gridIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  gridTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2, marginBottom: 4 },
  gridSub: { fontSize: 12, lineHeight: 16 },

  versionText: { textAlign: "center", fontSize: 11, fontWeight: "600", marginTop: 26 },
});
