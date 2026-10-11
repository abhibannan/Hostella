import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Modal,
  KeyboardAvoidingView,
  RefreshControl,
  StatusBar,
  Animated,
  Switch,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../contexts/ThemeContext";
import { API_URL, parseJsonResponse } from "../services/api";
import { AdminAccount, Hostel, User } from "../types";
import { haptic } from "../utils/haptics";
import { HostellaBrand } from "../components/HostellaBrand";

interface SuperAdminScreenProps {
  currentUser: User | null;
  token: string | null;
  onLogout: () => void;
}

type SuperAdminTab = "overview" | "admins" | "hostels" | "logs";

export interface SystemLogEntry {
  id: string;
  level: "ERROR" | "WARN" | "INFO";
  message: string;
  source: string;
  statusCode?: number;
  route?: string;
  method?: string;
  timestamp: string;
}

// ── Smooth Count-Up Number Component ─────────────────────────────────────────
function CountUpNumber({
  targetValue,
  duration = 750,
  style,
}: {
  targetValue: number;
  duration?: number;
  style?: any;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (targetValue === 0) {
      setDisplayValue(0);
      return;
    }
    let startTimestamp: number | null = null;
    let frameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(ease * targetValue));

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetValue);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [targetValue, duration]);

  return <Text style={style}>{displayValue}</Text>;
}

export function SuperAdminScreen({
  currentUser,
  token,
  onLogout,
}: SuperAdminScreenProps) {
  const { isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();

  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? StatusBar.currentHeight || 28 : 0,
  );
  const bottomInset = Math.max(insets.bottom, 16);

  // ── Navigation State ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SuperAdminTab>("overview");

  // Animations
  const contentFadeAnim = useRef(new Animated.Value(1)).current;
  const chartDrawAnim = useRef(new Animated.Value(1)).current;

  const switchTab = (tab: SuperAdminTab) => {
    if (tab === activeTab) return;
    haptic.selection();
    Animated.sequence([
      Animated.timing(contentFadeAnim, {
        toValue: 0.35,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    setActiveTab(tab);
  };

  // ── Apple iOS Human Interface Theme Tokens ─────────────────────────────────
  const theme = {
    canvas: isDark ? "#000000" : "#F2F2F7",
    card: isDark ? "#1C1C1E" : "#FFFFFF",
    cardElevated: isDark ? "#2C2C2E" : "#F8F8FA",
    cardBorder: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(60, 60, 67, 0.1)",
    borderSubtle: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(60, 60, 67, 0.06)",
    fillTertiary: isDark ? "rgba(118, 118, 128, 0.24)" : "rgba(118, 118, 128, 0.12)",

    primary: "#007AFF",
    primaryGlow: isDark ? "rgba(0, 122, 255, 0.22)" : "rgba(0, 122, 255, 0.12)",
    cyan: "#32ADE6",
    cyanGlow: isDark ? "rgba(50, 173, 230, 0.22)" : "rgba(50, 173, 230, 0.12)",
    gold: "#FF9500",
    goldGlow: isDark ? "rgba(255, 149, 0, 0.22)" : "rgba(255, 149, 0, 0.12)",
    emerald: "#34C759",
    emeraldGlow: isDark ? "rgba(52, 199, 89, 0.22)" : "rgba(52, 199, 89, 0.12)",
    crimson: "#FF3B30",
    crimsonGlow: isDark ? "rgba(255, 59, 48, 0.22)" : "rgba(255, 59, 48, 0.12)",
    indigo: "#5856D6",
    indigoGlow: isDark ? "rgba(88, 86, 214, 0.22)" : "rgba(88, 86, 214, 0.12)",

    textPrimary: isDark ? "#FFFFFF" : "#000000",
    textSecondary: isDark ? "#8E8E93" : "#6C6C70",
    textMuted: isDark ? "#636366" : "#AEAEB2",
  };

  // ── States ─────────────────────────────────────────────────────────────────
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filters
  const [adminSearch, setAdminSearch] = useState("");
  const [adminFilter, setAdminFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [hostelSearch, setHostelSearch] = useState("");
  const [logFilter, setLogFilter] = useState<"ALL" | "ERROR" | "WARN" | "INFO">("ALL");

  // Governance & Maintenance
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // Modal: Add Admin
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedHostelIdForNew, setSelectedHostelIdForNew] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);

  // Modal: Assign Hostel to Existing Admin
  const [assigningAdmin, setAssigningAdmin] = useState<AdminAccount | null>(null);
  const [assignHostelId, setAssignHostelId] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Modal: Reset Password
  const [resettingAdmin, setResettingAdmin] = useState<AdminAccount | null>(null);
  const [newResetPassword, setNewResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [savingPasswordReset, setSavingPasswordReset] = useState(false);

  // ── Data Fetching ──────────────────────────────────────────────────────────
  const loadAdmins = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/auth/admins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await parseJsonResponse(res)) as { admins: AdminAccount[] };
        setAdmins(data.admins || []);
      }
    } catch (e) {
      console.warn("Failed to load admins:", e);
    }
  }, [token]);

  const loadHostels = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/hostels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await parseJsonResponse(res)) as { hostels: Hostel[] };
        setHostels(data.hostels || []);
      }
    } catch (e) {
      console.warn("Failed to load hostels:", e);
    }
  }, [token]);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/auth/super-admin/platform-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await parseJsonResponse(res)) as { maintenanceMode?: boolean };
        setMaintenanceMode(Boolean(data.maintenanceMode));
      }
    } catch (e) {
      console.warn("Failed to load config:", e);
    }
  }, [token]);

  const loadLogs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/auth/super-admin/system-logs?limit=40`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await parseJsonResponse(res)) as { logs?: SystemLogEntry[] };
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.warn("Failed to load logs:", e);
    }
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAdmins(), loadHostels(), loadConfig(), loadLogs()]);
    setLoading(false);
  }, [loadAdmins, loadHostels, loadConfig, loadLogs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    haptic.medium();
    await Promise.all([loadAdmins(), loadHostels(), loadConfig(), loadLogs()]);
    setRefreshing(false);
  };

  // ── Filtered Collections ───────────────────────────────────────────────────
  const activeCount = useMemo(
    () => admins.filter((a) => a.status === "ACTIVE").length,
    [admins],
  );
  const inactiveCount = useMemo(
    () => admins.filter((a) => a.status !== "ACTIVE").length,
    [admins],
  );
  const activePercent = useMemo(
    () => (admins.length > 0 ? (activeCount / admins.length) * 100 : 0),
    [activeCount, admins.length],
  );

  const filteredAdmins = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    return admins.filter((a) => {
      const fullName = `${a.firstName} ${a.lastName || ""}`.toLowerCase();
      const email = a.email.toLowerCase();
      const hostelsStr = (a.assignedHostels || [])
        .map((h) => h.hostelName.toLowerCase())
        .join(" ");

      const matchesSearch =
        !q ||
        fullName.includes(q) ||
        email.includes(q) ||
        hostelsStr.includes(q);

      if (!matchesSearch) return false;
      if (adminFilter === "ACTIVE") return a.status === "ACTIVE";
      if (adminFilter === "INACTIVE") return a.status !== "ACTIVE";
      return true;
    });
  }, [admins, adminSearch, adminFilter]);

  const filteredHostels = useMemo(() => {
    const q = hostelSearch.trim().toLowerCase();
    if (!q) return hostels;
    return hostels.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.city && h.city.toLowerCase().includes(q)) ||
        (h.address && h.address.toLowerCase().includes(q)),
    );
  }, [hostels, hostelSearch]);

  const filteredLogs = useMemo(() => {
    if (logFilter === "ALL") return logs;
    return logs.filter((l) => l.level === logFilter);
  }, [logs, logFilter]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleCreateAdmin = async () => {
    if (!newFirstName.trim() || !newEmail.trim() || !newPassword.trim()) {
      Alert.alert("Missing Fields", "First name, email address, and password are required.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters.");
      return;
    }

    setSavingAdmin(true);
    haptic.medium();
    try {
      const res = await fetch(`${API_URL}/auth/admins`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: newFirstName.trim(),
          ...(newLastName.trim() ? { lastName: newLastName.trim() } : {}),
          email: newEmail.trim().toLowerCase(),
          ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
          password: newPassword,
        }),
      });

      const data = (await parseJsonResponse(res)) as {
        message?: string;
        user?: { id: string };
      };
      if (!res.ok) throw new Error(data.message || "Failed to create administrator");

      if (selectedHostelIdForNew && data.user?.id) {
        try {
          await fetch(`${API_URL}/hostels/${selectedHostelIdForNew}/admin`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ adminId: data.user.id }),
          });
        } catch (assignErr) {
          console.warn("Property assignment warning:", assignErr);
        }
      }

      haptic.success();
      Alert.alert("Administrator Created", `Account for ${newEmail} is now active.`);
      setShowAddModal(false);
      setNewFirstName("");
      setNewLastName("");
      setNewEmail("");
      setNewPhone("");
      setNewPassword("");
      setSelectedHostelIdForNew("");
      void loadAdmins();
    } catch (err: any) {
      Alert.alert("Creation Error", err.message || "Unable to create administrator.");
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleToggleStatus = async (admin: AdminAccount) => {
    if (admin.id === currentUser?.id) {
      Alert.alert("Restricted", "You cannot modify your own Super Administrator status.");
      return;
    }

    const nextStatus = admin.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    haptic.selection();
    try {
      const res = await fetch(`${API_URL}/auth/admins/${admin.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) throw new Error("Failed to update status");

      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, status: nextStatus } : a)),
      );
      haptic.success();
    } catch (err: any) {
      Alert.alert("Status Error", err.message || "Could not update status.");
    }
  };

  const handleDeleteAdmin = (admin: AdminAccount) => {
    if (admin.id === currentUser?.id) {
      Alert.alert("Restricted", "You cannot delete your own Super Administrator account.");
      return;
    }

    Alert.alert(
      "Remove Administrator",
      `Are you sure you want to permanently remove ${admin.firstName} ${admin.lastName || ""}? They will lose access to all managed hostels.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Account",
          style: "destructive",
          onPress: async () => {
            haptic.heavy();
            try {
              const res = await fetch(`${API_URL}/auth/admins/${admin.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Failed to remove administrator");

              setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
              haptic.success();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not delete administrator.");
            }
          },
        },
      ],
    );
  };

  const handleAssignHostel = async () => {
    if (!assigningAdmin || !assignHostelId) {
      Alert.alert("Select Property", "Please choose a property to assign.");
      return;
    }

    setSavingAssignment(true);
    haptic.medium();
    try {
      const res = await fetch(`${API_URL}/hostels/${assignHostelId}/admin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adminId: assigningAdmin.id }),
      });

      const data = (await parseJsonResponse(res)) as { message?: string };
      if (!res.ok) throw new Error(data.message || "Failed to assign property");

      haptic.success();
      Alert.alert("Property Assigned", "Hostel management has been granted.");
      setAssigningAdmin(null);
      setAssignHostelId("");
      void loadAdmins();
    } catch (err: any) {
      Alert.alert("Assignment Error", err.message || "Could not assign property.");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleUnassignHostel = (admin: AdminAccount, hostelId: string, hostelName: string) => {
    Alert.alert(
      "Unassign Property",
      `Remove ${admin.firstName}'s management permissions for "${hostelName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unassign",
          style: "destructive",
          onPress: async () => {
            haptic.heavy();
            try {
              const res = await fetch(`${API_URL}/hostels/${hostelId}/admin`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Failed to unassign property");

              haptic.success();
              void loadAdmins();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not unassign property.");
            }
          },
        },
      ],
    );
  };

  const handleResetPassword = async () => {
    if (!resettingAdmin || !newResetPassword.trim()) {
      Alert.alert("Missing Password", "Please provide a new password.");
      return;
    }
    if (newResetPassword.length < 6) {
      Alert.alert("Too Short", "Password must be at least 6 characters.");
      return;
    }

    setSavingPasswordReset(true);
    haptic.medium();
    try {
      const res = await fetch(`${API_URL}/auth/admins/${resettingAdmin.id}/password`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newResetPassword }),
      });
      const data = (await parseJsonResponse(res)) as { message?: string };
      if (!res.ok) throw new Error(data.message || "Failed to update password");

      haptic.success();
      Alert.alert(
        "Password Updated",
        `Password for ${resettingAdmin.email} has been updated.\n\nPassword: ${newResetPassword}`,
        [
          {
            text: "Copy Password",
            onPress: async () => {
              await Clipboard.setStringAsync(newResetPassword);
              Alert.alert("Copied", "Password copied to clipboard.");
            },
          },
          { text: "OK", style: "default" },
        ],
      );
      setResettingAdmin(null);
      setNewResetPassword("");
    } catch (err: any) {
      Alert.alert("Reset Error", err.message || "Could not update password.");
    } finally {
      setSavingPasswordReset(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let pwd = "Host@";
    for (let i = 0; i < 4; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pwd += "!";
    setNewResetPassword(pwd);
    haptic.light();
  };

  const handleFlushCache = async () => {
    setClearingCache(true);
    haptic.medium();
    try {
      const res = await fetch(`${API_URL}/auth/super-admin/clear-cache`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        haptic.success();
        Alert.alert("⚡ Server Cache Flushed", "All instance access tokens and permission caches invalidated.");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not flush cache.");
    } finally {
      setClearingCache(false);
    }
  };

  const handleClearLogs = async () => {
    Alert.alert("Clear Error Logs", "Purge all recorded in-memory exception logs?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear Buffer",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${API_URL}/auth/super-admin/system-logs`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            setLogs([]);
            haptic.success();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not clear logs.");
          }
        },
      },
    ]);
  };

  const handleToggleMaintenance = (enable: boolean) => {
    Alert.alert(
      enable ? "Activate Platform Lockdown" : "Restore Normal Operations",
      enable
        ? "Maintenance mode restricts mobile access for all hostel managers and residents with HTTP 503. Only Super Admins bypass."
        : "Restoring operations will immediately unblock mobile access across all hostels.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: enable ? "Lockdown Platform" : "Restore Access",
          style: enable ? "destructive" : "default",
          onPress: async () => {
            setSavingMaintenance(true);
            try {
              const res = await fetch(`${API_URL}/auth/super-admin/platform-config`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ maintenanceMode: enable }),
              });
              if (res.ok) {
                setMaintenanceMode(enable);
                haptic.heavy();
              }
            } catch (err) {
              console.warn("Failed to toggle maintenance:", err);
            } finally {
              setSavingMaintenance(false);
            }
          },
        },
      ],
    );
  };

  // ── Render Tab Views ───────────────────────────────────────────────────────
  const renderOverviewTab = () => (
    <ScrollView
      contentContainerStyle={[styles.tabContentScroll, { paddingBottom: bottomInset + 80 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Live Platform Health Status Banner */}
      <View
        style={[
          styles.healthBanner,
          {
            backgroundColor: maintenanceMode ? theme.crimsonGlow : theme.emeraldGlow,
            borderColor: maintenanceMode ? theme.crimson : theme.emerald,
          },
        ]}
      >
        <View style={styles.healthBannerLeft}>
          <View
            style={[
              styles.pulseIndicator,
              { backgroundColor: maintenanceMode ? theme.crimson : theme.emerald },
            ]}
          />
          <View>
            <Text
              style={[
                styles.healthBannerTitle,
                { color: maintenanceMode ? theme.crimson : theme.emerald },
              ]}
            >
              {maintenanceMode ? "LOCKDOWN ACTIVE (MAINTENANCE)" : "ALL SYSTEMS OPERATIONAL"}
            </Text>
            <Text style={[styles.healthBannerSub, { color: theme.textSecondary }]}>
              {maintenanceMode
                ? "HTTP 503 enforced for public users. Super Admin access active."
                : "Firebase Firestore • Google Identity • Push Relays Healthy"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.flushMiniBtn, { backgroundColor: theme.card }]}
          onPress={handleFlushCache}
          disabled={clearingCache}
        >
          {clearingCache ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons name="refresh" size={14} color={theme.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Executive Metric Cards (4-Grid Apple Style) */}
      <View style={styles.metricsGrid}>
        <View
          style={[
            styles.metricGridCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <View style={[styles.metricIconWrap, { backgroundColor: theme.primaryGlow }]}>
            <Ionicons name="people" size={18} color={theme.primary} />
          </View>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>TOTAL ADMINS</Text>
          <CountUpNumber
            targetValue={admins.length}
            style={[styles.metricValue, { color: theme.textPrimary }]}
          />
          <Text style={[styles.metricSubtext, { color: theme.textSecondary }]}>Platform Staff</Text>
        </View>

        <View
          style={[
            styles.metricGridCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <View style={[styles.metricIconWrap, { backgroundColor: theme.emeraldGlow }]}>
            <Ionicons name="shield-checkmark" size={18} color={theme.emerald} />
          </View>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>ACTIVE STAFF</Text>
          <CountUpNumber
            targetValue={activeCount}
            style={[styles.metricValue, { color: theme.emerald }]}
          />
          <Text style={[styles.metricSubtext, { color: theme.textSecondary }]}>Ready to Manage</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.metricGridCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
          onPress={() => switchTab("hostels")}
          activeOpacity={0.7}
        >
          <View style={[styles.metricIconWrap, { backgroundColor: theme.cyanGlow }]}>
            <Ionicons name="business" size={18} color={theme.cyan} />
          </View>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>LIVE HOSTELS</Text>
          <CountUpNumber
            targetValue={hostels.length}
            style={[styles.metricValue, { color: theme.cyan }]}
          />
          <Text style={[styles.metricSubtext, { color: theme.textSecondary }]}>Managed Properties</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.metricGridCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
          onPress={() => switchTab("logs")}
          activeOpacity={0.7}
        >
          <View style={[styles.metricIconWrap, { backgroundColor: theme.indigoGlow }]}>
            <Ionicons name="pulse" size={18} color={theme.indigo} />
          </View>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>ERROR LOGS</Text>
          <CountUpNumber
            targetValue={logs.length}
            style={[styles.metricValue, { color: logs.length > 0 ? theme.gold : theme.textPrimary }]}
          />
          <Text style={[styles.metricSubtext, { color: theme.textSecondary }]}>
            {logs.length === 0 ? "Clean Buffer" : "Recent Events"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Staff Operational Ratio Bar */}
      <View
        style={[
          styles.ratioCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <View style={styles.ratioHeader}>
          <Text style={[styles.ratioTitle, { color: theme.textPrimary }]}>Staff Operational Coverage</Text>
          <Text style={[styles.ratioPercent, { color: theme.primary }]}>
            {Math.round(activePercent)}% Active
          </Text>
        </View>
        <View style={[styles.ratioTrack, { backgroundColor: theme.borderSubtle }]}>
          <View
            style={[
              styles.ratioFill,
              {
                backgroundColor: theme.primary,
                width: `${Math.min(Math.max(activePercent, 4), 100)}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Quick Actions Grid */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>QUICK ACTIONS</Text>
      <View style={styles.quickActionsGrid}>
        <TouchableOpacity
          style={[
            styles.quickActionBtn,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.75}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: theme.primaryGlow }]}>
            <Ionicons name="person-add" size={20} color={theme.primary} />
          </View>
          <Text style={[styles.quickActionTitle, { color: theme.textPrimary }]}>Add Admin</Text>
          <Text style={[styles.quickActionSub, { color: theme.textSecondary }]}>Provision account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.quickActionBtn,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
          onPress={() => switchTab("admins")}
          activeOpacity={0.75}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: theme.goldGlow }]}>
            <Ionicons name="key" size={20} color={theme.gold} />
          </View>
          <Text style={[styles.quickActionTitle, { color: theme.textPrimary }]}>Manage Staff</Text>
          <Text style={[styles.quickActionSub, { color: theme.textSecondary }]}>Reset passwords</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.quickActionBtn,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
          onPress={() => switchTab("hostels")}
          activeOpacity={0.75}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: theme.cyanGlow }]}>
            <Ionicons name="business" size={20} color={theme.cyan} />
          </View>
          <Text style={[styles.quickActionTitle, { color: theme.textPrimary }]}>Properties</Text>
          <Text style={[styles.quickActionSub, { color: theme.textSecondary }]}>Assign branches</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.quickActionBtn,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
          onPress={handleFlushCache}
          activeOpacity={0.75}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: theme.indigoGlow }]}>
            <Ionicons name="flash" size={20} color={theme.indigo} />
          </View>
          <Text style={[styles.quickActionTitle, { color: theme.textPrimary }]}>Flush Cache</Text>
          <Text style={[styles.quickActionSub, { color: theme.textSecondary }]}>Reload instances</Text>
        </TouchableOpacity>
      </View>

      {/* Emergency Platform Lockdown */}
      <Text style={[styles.sectionHeading, { color: theme.textMuted }]}>GOVERNANCE & SECURITY</Text>
      <View
        style={[
          styles.lockdownCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <View style={styles.lockdownLeft}>
          <View
            style={[
              styles.lockdownIconCircle,
              { backgroundColor: maintenanceMode ? theme.crimsonGlow : theme.fillTertiary },
            ]}
          >
            <Ionicons
              name={maintenanceMode ? "lock-closed" : "shield-outline"}
              size={20}
              color={maintenanceMode ? theme.crimson : theme.textPrimary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.lockdownTitle, { color: theme.textPrimary }]}>
              Emergency Platform Lockdown
            </Text>
            <Text style={[styles.lockdownSub, { color: theme.textSecondary }]}>
              {maintenanceMode
                ? "Active: Restricts public client requests with HTTP 503."
                : "Operational: All portals and branches active."}
            </Text>
          </View>
        </View>
        <Switch
          value={maintenanceMode}
          onValueChange={handleToggleMaintenance}
          disabled={savingMaintenance}
          trackColor={{ false: theme.cardBorder, true: theme.crimson }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Platform Specification Badge */}
      <View style={[styles.specPill, { backgroundColor: theme.cardElevated }]}>
        <Ionicons name="cloud-done-outline" size={13} color={theme.emerald} />
        <Text style={[styles.specText, { color: theme.textMuted }]}>
          Hostella v1.0 • Connected to Firestore • Render Cloud Production
        </Text>
      </View>
    </ScrollView>
  );

  const renderAdminsTab = () => (
    <View style={{ flex: 1 }}>
      {/* Search & Filter Header */}
      <View style={[styles.filterBar, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.fillTertiary }]}>
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Search staff, email, or hostel..."
              placeholderTextColor={theme.textMuted}
              value={adminSearch}
              onChangeText={setAdminSearch}
            />
            {adminSearch.length > 0 && (
              <TouchableOpacity onPress={() => setAdminSearch("")}>
                <Ionicons name="close-circle" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.addAdminBtn, { backgroundColor: theme.primary }]}
            onPress={() => {
              haptic.medium();
              setShowAddModal(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addAdminBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Segmented Filter Control */}
        <View style={[styles.segmentedControl, { backgroundColor: theme.fillTertiary }]}>
          {(["ALL", "ACTIVE", "INACTIVE"] as const).map((tab) => {
            const isSelected = adminFilter === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.segmentedItem,
                  isSelected && [
                    styles.segmentedItemActive,
                    { backgroundColor: theme.card },
                  ],
                ]}
                onPress={() => {
                  haptic.selection();
                  setAdminFilter(tab);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentedItemText,
                    {
                      color: isSelected ? theme.textPrimary : theme.textSecondary,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {tab === "ALL"
                    ? `All (${admins.length})`
                    : tab === "ACTIVE"
                    ? `Active (${activeCount})`
                    : `Disabled (${inactiveCount})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Administrators List */}
      <ScrollView
        contentContainerStyle={[styles.rosterScroll, { paddingBottom: bottomInset + 80 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && admins.length === 0 ? (
          <View style={styles.centerLoadingBox}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading administrator roster...
            </Text>
          </View>
        ) : filteredAdmins.length === 0 ? (
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons name="people-outline" size={36} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No Administrators Found</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {adminSearch
                ? `No staff matching "${adminSearch}"`
                : "Add an administrator to assign property permissions."}
            </Text>
            <TouchableOpacity
              style={[styles.emptyActionBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.emptyActionBtnText}>Add Administrator</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredAdmins.map((admin) => {
            const isSelf = admin.id === currentUser?.id;
            const isActive = admin.status === "ACTIVE";
            const isSuper = admin.role === "SUPER_ADMIN";
            const assignedHostelsList = admin.assignedHostels || [];

            return (
              <View
                key={admin.id}
                style={[
                  styles.adminCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: isSelf ? theme.cyanGlow : theme.cardBorder,
                  },
                ]}
              >
                {/* Header: Avatar, Name, Role, Switch */}
                <View style={styles.adminCardHeader}>
                  <View style={styles.adminAvatarBox}>
                    <View
                      style={[
                        styles.avatarCircle,
                        {
                          backgroundColor: isSuper ? theme.cyanGlow : theme.cardElevated,
                          borderColor: isSuper ? theme.cyan : theme.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarInitial,
                          { color: isSuper ? theme.cyan : theme.textPrimary },
                        ]}
                      >
                        {admin.firstName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.adminDetailsText}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={[styles.adminFullName, { color: theme.textPrimary }]}>
                          {admin.firstName} {admin.lastName || ""}
                        </Text>
                        {isSelf && (
                          <View
                            style={[
                              styles.selfTag,
                              { backgroundColor: theme.cyanGlow, borderColor: theme.cyan },
                            ]}
                          >
                            <Text style={[styles.selfTagText, { color: theme.cyan }]}>You</Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.rolePill,
                            { backgroundColor: isSuper ? theme.cyanGlow : theme.fillTertiary },
                          ]}
                        >
                          <Text
                            style={[
                              styles.rolePillText,
                              { color: isSuper ? theme.cyan : theme.textSecondary },
                            ]}
                          >
                            {isSuper ? "Super Admin" : "Hostel Admin"}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.adminEmailText, { color: theme.textSecondary }]}>
                        {admin.email}
                      </Text>

                      {admin.phone ? (
                        <Text style={[styles.adminPhoneText, { color: theme.textMuted }]}>
                          {admin.phone}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Switch
                    value={isActive}
                    onValueChange={() => handleToggleStatus(admin)}
                    disabled={isSelf}
                    trackColor={{ false: theme.cardBorder, true: theme.emerald }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Managed Properties Section */}
                {!isSuper && (
                  <View style={[styles.propertySection, { borderTopColor: theme.cardBorder }]}>
                    <View style={styles.propertySectionHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Ionicons name="business-outline" size={13} color={theme.textSecondary} />
                        <Text style={[styles.propertySectionTitle, { color: theme.textSecondary }]}>
                          Managed Hostels ({assignedHostelsList.length})
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.assignActionBtn,
                          { backgroundColor: theme.primaryGlow, borderColor: theme.primary },
                        ]}
                        onPress={() => {
                          setAssigningAdmin(admin);
                          setAssignHostelId("");
                        }}
                      >
                        <Ionicons name="add" size={12} color={theme.primary} />
                        <Text style={[styles.assignActionBtnText, { color: theme.primary }]}>
                          Assign
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {assignedHostelsList.length === 0 ? (
                      <Text style={[styles.noPropertyText, { color: theme.textMuted }]}>
                        No hostels assigned. This administrator has no branch permissions.
                      </Text>
                    ) : (
                      <View style={styles.hostelChipsContainer}>
                        {assignedHostelsList.map((h) => (
                          <TouchableOpacity
                            key={h.hostelId}
                            style={[
                              styles.hostelChip,
                              { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder },
                            ]}
                            onPress={() => handleUnassignHostel(admin, h.hostelId, h.hostelName)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="home-outline" size={12} color={theme.primary} />
                            <Text
                              style={[styles.hostelChipText, { color: theme.textPrimary }]}
                              numberOfLines={1}
                            >
                              {h.hostelName}
                            </Text>
                            <Ionicons name="close-circle" size={13} color={theme.textMuted} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Admin Card Action Buttons (Reset Password, Delete) */}
                <View style={[styles.cardFooter, { borderTopColor: theme.cardBorder }]}>
                  <Text style={[styles.createdDateText, { color: theme.textMuted }]}>
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </Text>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.resetPasswordBtn, { backgroundColor: theme.cardElevated }]}
                      onPress={() => {
                        setResettingAdmin(admin);
                        setNewResetPassword("");
                        setShowResetPassword(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="key-outline" size={12} color={theme.gold} />
                      <Text style={[styles.resetPasswordBtnText, { color: theme.gold }]}>
                        Reset Password
                      </Text>
                    </TouchableOpacity>

                    {!isSelf && (
                      <TouchableOpacity
                        style={[styles.deleteBtn, { backgroundColor: theme.crimsonGlow }]}
                        onPress={() => handleDeleteAdmin(admin)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={12} color={theme.crimson} />
                        <Text style={[styles.deleteBtnText, { color: theme.crimson }]}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  const renderHostelsTab = () => (
    <View style={{ flex: 1 }}>
      {/* Search Bar */}
      <View style={[styles.filterBar, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.fillTertiary }]}>
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Search hostel name or city..."
              placeholderTextColor={theme.textMuted}
              value={hostelSearch}
              onChangeText={setHostelSearch}
            />
            {hostelSearch.length > 0 && (
              <TouchableOpacity onPress={() => setHostelSearch("")}>
                <Ionicons name="close-circle" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.hostelCountBadge, { backgroundColor: theme.cyanGlow }]}>
            <Text style={[styles.hostelCountBadgeText, { color: theme.cyan }]}>
              {filteredHostels.length}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.rosterScroll, { paddingBottom: bottomInset + 80 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredHostels.length === 0 ? (
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons name="business-outline" size={36} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No Properties Found</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {hostelSearch
                ? `No hostels matching "${hostelSearch}"`
                : "No registered hostels found in this system."}
            </Text>
          </View>
        ) : (
          filteredHostels.map((hostel) => {
            const managingAdmins = admins.filter((a) =>
              (a.assignedHostels || []).some((h) => h.hostelId === hostel.id),
            );

            return (
              <View
                key={hostel.id}
                style={[
                  styles.hostelCard,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
              >
                <View style={styles.hostelCardTop}>
                  <View style={[styles.hostelCardIcon, { backgroundColor: theme.cyanGlow }]}>
                    <Ionicons name="business" size={22} color={theme.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.hostelCardTitle, { color: theme.textPrimary }]}>
                      {hostel.name}
                    </Text>
                    <Text style={[styles.hostelCardLocation, { color: theme.textSecondary }]}>
                      {hostel.address || hostel.city || "Primary Branch Location"}
                    </Text>
                    {hostel.contactPhone ? (
                      <Text style={[styles.hostelCardPhone, { color: theme.textMuted }]}>
                        {hostel.contactPhone}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Assigned Staff List */}
                <View style={[styles.hostelStaffBox, { borderTopColor: theme.cardBorder }]}>
                  <View style={styles.hostelStaffHeader}>
                    <Text style={[styles.hostelStaffTitle, { color: theme.textSecondary }]}>
                      Assigned Administrators ({managingAdmins.length})
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.assignStaffBtn,
                        { backgroundColor: theme.primaryGlow, borderColor: theme.primary },
                      ]}
                      onPress={() => {
                        setAssignHostelId(hostel.id);
                        setAssigningAdmin(admins[0] || null);
                      }}
                    >
                      <Ionicons name="add" size={12} color={theme.primary} />
                      <Text style={[styles.assignStaffBtnText, { color: theme.primary }]}>
                        Assign Staff
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {managingAdmins.length === 0 ? (
                    <Text style={[styles.noStaffText, { color: theme.textMuted }]}>
                      Unassigned property. Tap "Assign Staff" to grant admin access.
                    </Text>
                  ) : (
                    <View style={styles.adminMiniChipWrap}>
                      {managingAdmins.map((adm) => (
                        <View
                          key={adm.id}
                          style={[
                            styles.adminMiniChip,
                            { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder },
                          ]}
                        >
                          <View style={[styles.adminMiniAvatar, { backgroundColor: theme.primary }]}>
                            <Text style={styles.adminMiniAvatarText}>
                              {adm.firstName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={[styles.adminMiniName, { color: theme.textPrimary }]}>
                            {adm.firstName} {adm.lastName || ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  const renderLogsTab = () => (
    <View style={{ flex: 1 }}>
      {/* Telemetry Header */}
      <View style={[styles.filterBar, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={styles.logControlsRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.logControlsTitle, { color: theme.textPrimary }]}>
              System Diagnostics
            </Text>
            <Text style={[styles.logControlsSub, { color: theme.textSecondary }]}>
              Real-time exception stream & latency
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[styles.logActionBtn, { backgroundColor: theme.cardElevated }]}
              onPress={handleFlushCache}
              activeOpacity={0.75}
            >
              <Ionicons name="flash-outline" size={13} color={theme.primary} />
              <Text style={[styles.logActionBtnText, { color: theme.primary }]}>Flush Cache</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logActionBtn, { backgroundColor: theme.crimsonGlow }]}
              onPress={handleClearLogs}
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={13} color={theme.crimson} />
              <Text style={[styles.logActionBtnText, { color: theme.crimson }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Severity Filter Tabs */}
        <View style={[styles.segmentedControl, { backgroundColor: theme.fillTertiary, marginTop: 10 }]}>
          {(["ALL", "ERROR", "WARN", "INFO"] as const).map((sev) => {
            const isSelected = logFilter === sev;
            return (
              <TouchableOpacity
                key={sev}
                style={[
                  styles.segmentedItem,
                  isSelected && [styles.segmentedItemActive, { backgroundColor: theme.card }],
                ]}
                onPress={() => {
                  haptic.selection();
                  setLogFilter(sev);
                }}
              >
                <Text
                  style={[
                    styles.segmentedItemText,
                    {
                      color: isSelected ? theme.textPrimary : theme.textSecondary,
                      fontWeight: isSelected ? "700" : "500",
                    },
                  ]}
                >
                  {sev}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.rosterScroll, { paddingBottom: bottomInset + 80 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredLogs.length === 0 ? (
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons name="checkmark-circle-outline" size={42} color={theme.emerald} />
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No Errors Logged</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              All backend microservices and database queries are executing normally.
            </Text>
          </View>
        ) : (
          filteredLogs.map((log) => {
            const isErr = log.level === "ERROR";
            const isWarn = log.level === "WARN";
            const badgeColor = isErr ? theme.crimson : isWarn ? theme.gold : theme.primary;
            const badgeGlow = isErr ? theme.crimsonGlow : isWarn ? theme.goldGlow : theme.primaryGlow;

            return (
              <View
                key={log.id}
                style={[
                  styles.logCard,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
              >
                <View style={styles.logCardTop}>
                  <View style={[styles.logLevelBadge, { backgroundColor: badgeGlow }]}>
                    <Text style={[styles.logLevelBadgeText, { color: badgeColor }]}>
                      {log.level}
                    </Text>
                  </View>
                  {log.statusCode ? (
                    <View style={[styles.logStatusBadge, { backgroundColor: theme.cardElevated }]}>
                      <Text style={[styles.logStatusBadgeText, { color: theme.textSecondary }]}>
                        HTTP {log.statusCode}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.logTimestamp, { color: theme.textMuted }]}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </Text>
                </View>

                <Text style={[styles.logMessage, { color: theme.textPrimary }]}>{log.message}</Text>

                {log.route ? (
                  <View style={styles.logRouteRow}>
                    <Ionicons name="link-outline" size={11} color={theme.textMuted} />
                    <Text style={[styles.logRouteText, { color: theme.textSecondary }]}>
                      {log.method || "GET"} {log.route}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ── 1. GLOBAL HEADER ──────────────────────────────────────────────── */}
      <View
        style={[
          styles.globalHeader,
          {
            paddingTop: topInset + 4,
            backgroundColor: theme.card,
            borderBottomColor: theme.cardBorder,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <HostellaBrand variant="icon" size="medium" />
            <View style={{ marginLeft: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <HostellaBrand
                  variant="wordmark"
                  colorScheme={isDark ? "dark" : "light"}
                  size="medium"
                  style={{ alignItems: "flex-start" }}
                />
                <View style={[styles.superBadge, { backgroundColor: theme.goldGlow, borderColor: theme.gold }]}>
                  <Ionicons name="shield" size={10} color={theme.gold} />
                  <Text style={[styles.superBadgeText, { color: theme.gold }]}>SUPER ADMIN</Text>
                </View>
              </View>
              <Text style={[styles.userSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {currentUser?.email || "Executive Console"}
              </Text>
            </View>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder }]}
              onPress={() => {
                haptic.light();
                toggleTheme();
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isDark ? "sunny-outline" : "moon-outline"}
                size={16}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: theme.crimsonGlow, borderColor: theme.crimsonGlow }]}
              onPress={() => {
                Alert.alert("Sign Out", "End Super Administrator session?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: onLogout },
                ]);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="power" size={16} color={theme.crimson} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── 2. ACTIVE TAB CONTENT VIEW ────────────────────────────────────── */}
      <Animated.View style={{ flex: 1, opacity: contentFadeAnim }}>
        {activeTab === "overview" && renderOverviewTab()}
        {activeTab === "admins" && renderAdminsTab()}
        {activeTab === "hostels" && renderHostelsTab()}
        {activeTab === "logs" && renderLogsTab()}
      </Animated.View>

      {/* ── 3. APPLE iOS FLOATING BOTTOM NAVIGATION BAR ────────────────────── */}
      <View
        style={[
          styles.bottomNavWrapper,
          {
            paddingBottom: bottomInset,
            backgroundColor: theme.card,
            borderTopColor: theme.cardBorder,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.navTabBtn}
          onPress={() => switchTab("overview")}
          activeOpacity={0.75}
        >
          <Ionicons
            name={activeTab === "overview" ? "speedometer" : "speedometer-outline"}
            size={22}
            color={activeTab === "overview" ? theme.primary : theme.textMuted}
          />
          <Text
            style={[
              styles.navTabLabel,
              {
                color: activeTab === "overview" ? theme.primary : theme.textMuted,
                fontWeight: activeTab === "overview" ? "700" : "500",
              },
            ]}
          >
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTabBtn}
          onPress={() => switchTab("admins")}
          activeOpacity={0.75}
        >
          <View>
            <Ionicons
              name={activeTab === "admins" ? "people" : "people-outline"}
              size={22}
              color={activeTab === "admins" ? theme.primary : theme.textMuted}
            />
            {admins.length > 0 && (
              <View style={[styles.navBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.navBadgeText}>{admins.length}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.navTabLabel,
              {
                color: activeTab === "admins" ? theme.primary : theme.textMuted,
                fontWeight: activeTab === "admins" ? "700" : "500",
              },
            ]}
          >
            Staff
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTabBtn}
          onPress={() => switchTab("hostels")}
          activeOpacity={0.75}
        >
          <View>
            <Ionicons
              name={activeTab === "hostels" ? "business" : "business-outline"}
              size={22}
              color={activeTab === "hostels" ? theme.primary : theme.textMuted}
            />
            {hostels.length > 0 && (
              <View style={[styles.navBadge, { backgroundColor: theme.cyan }]}>
                <Text style={styles.navBadgeText}>{hostels.length}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.navTabLabel,
              {
                color: activeTab === "hostels" ? theme.primary : theme.textMuted,
                fontWeight: activeTab === "hostels" ? "700" : "500",
              },
            ]}
          >
            Hostels
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTabBtn}
          onPress={() => switchTab("logs")}
          activeOpacity={0.75}
        >
          <View>
            <Ionicons
              name={activeTab === "logs" ? "pulse" : "pulse-outline"}
              size={22}
              color={activeTab === "logs" ? theme.primary : theme.textMuted}
            />
            {logs.length > 0 && (
              <View style={[styles.navBadge, { backgroundColor: theme.gold }]}>
                <Text style={styles.navBadgeText}>{logs.length}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.navTabLabel,
              {
                color: activeTab === "logs" ? theme.primary : theme.textMuted,
                fontWeight: activeTab === "logs" ? "700" : "500",
              },
            ]}
          >
            Logs
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── MODAL: PROVISION NEW ADMINISTRATOR ─────────────────────────────── */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.primary }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>New Administrator</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Provision staff account with property rights
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 14 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>FIRST NAME *</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder },
                ]}
                placeholder="e.g. Rahul"
                placeholderTextColor={theme.textMuted}
                value={newFirstName}
                onChangeText={setNewFirstName}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>LAST NAME</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder },
                ]}
                placeholder="e.g. Sharma"
                placeholderTextColor={theme.textMuted}
                value={newLastName}
                onChangeText={setNewLastName}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>EMAIL ADDRESS *</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder },
                ]}
                placeholder="admin@example.com"
                placeholderTextColor={theme.textMuted}
                value={newEmail}
                onChangeText={setNewEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>PHONE NUMBER</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder },
                ]}
                placeholder="+91 9876543210"
                placeholderTextColor={theme.textMuted}
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>PASSWORD *</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder },
                ]}
                placeholder="Minimum 6 characters"
                placeholderTextColor={theme.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 12 }]}>
                ASSIGN PROPERTY (OPTIONAL)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                <TouchableOpacity
                  style={[
                    styles.hostelSelectChip,
                    {
                      backgroundColor: !selectedHostelIdForNew ? theme.primaryGlow : theme.cardElevated,
                      borderColor: !selectedHostelIdForNew ? theme.primary : theme.cardBorder,
                    },
                  ]}
                  onPress={() => setSelectedHostelIdForNew("")}
                >
                  <Text
                    style={[
                      styles.hostelSelectChipText,
                      { color: !selectedHostelIdForNew ? theme.primary : theme.textSecondary },
                    ]}
                  >
                    None (Assign Later)
                  </Text>
                </TouchableOpacity>

                {hostels.map((h) => {
                  const isPicked = selectedHostelIdForNew === h.id;
                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={[
                        styles.hostelSelectChip,
                        {
                          backgroundColor: isPicked ? theme.primaryGlow : theme.cardElevated,
                          borderColor: isPicked ? theme.primary : theme.cardBorder,
                        },
                      ]}
                      onPress={() => setSelectedHostelIdForNew(h.id)}
                    >
                      <Text
                        style={[
                          styles.hostelSelectChipText,
                          { color: isPicked ? theme.primary : theme.textSecondary },
                        ]}
                      >
                        {h.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: theme.primary, marginTop: 22 }]}
                onPress={handleCreateAdmin}
                disabled={savingAdmin}
              >
                {savingAdmin ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Create Administrator</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL: ASSIGN HOSTEL TO ADMIN ─────────────────────────────────── */}
      <Modal visible={Boolean(assigningAdmin)} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.primary }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Assign Property</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Grant management rights to {assigningAdmin?.firstName}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAssigningAdmin(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 14, maxHeight: 320 }}>
              {hostels.length === 0 ? (
                <Text style={{ color: theme.textMuted, padding: 10 }}>No hostels available.</Text>
              ) : (
                hostels.map((h) => {
                  const isAlreadyAssigned = (assigningAdmin?.assignedHostels || []).some(
                    (ah) => ah.hostelId === h.id,
                  );
                  const isSelected = assignHostelId === h.id;

                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={[
                        styles.assignHostelItem,
                        {
                          backgroundColor: isSelected
                            ? theme.primaryGlow
                            : theme.cardElevated,
                          borderColor: isSelected ? theme.primary : theme.cardBorder,
                          opacity: isAlreadyAssigned ? 0.45 : 1,
                        },
                      ]}
                      disabled={isAlreadyAssigned}
                      onPress={() => setAssignHostelId(h.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assignHostelName, { color: theme.textPrimary }]}>
                          {h.name}
                        </Text>
                        <Text style={[styles.assignHostelLoc, { color: theme.textSecondary }]}>
                          {h.address || h.city || "Primary Location"}
                        </Text>
                      </View>
                      {isAlreadyAssigned ? (
                        <Text style={[styles.alreadyAssignedText, { color: theme.textMuted }]}>
                          Assigned
                        </Text>
                      ) : isSelected ? (
                        <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: theme.primary, marginTop: 16 }]}
              onPress={handleAssignHostel}
              disabled={savingAssignment || !assignHostelId}
            >
              {savingAssignment ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Confirm Assignment</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: RESET ADMIN PASSWORD ───────────────────────────────────── */}
      <Modal visible={Boolean(resettingAdmin)} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.gold }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Reset Password</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Set new password for {resettingAdmin?.firstName} ({resettingAdmin?.email})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setResettingAdmin(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>NEW PASSWORD *</Text>
                <TouchableOpacity onPress={generateRandomPassword}>
                  <Text style={[styles.genPassText, { color: theme.gold }]}>⚡ Generate Secure</Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.passwordInputBox,
                  { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder },
                ]}
              >
                <TextInput
                  style={[styles.passwordInput, { color: theme.textPrimary }]}
                  placeholder="Enter or generate password"
                  placeholderTextColor={theme.textMuted}
                  value={newResetPassword}
                  onChangeText={setNewResetPassword}
                  secureTextEntry={!showResetPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowResetPassword(!showResetPassword)}
                  style={{ padding: 6 }}
                >
                  <Ionicons
                    name={showResetPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <Text style={[styles.passwordHint, { color: theme.textMuted }]}>
                Minimum 6 characters. The administrator can log in immediately with this password.
              </Text>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: theme.gold, marginTop: 20 }]}
                onPress={handleResetPassword}
                disabled={savingPasswordReset}
              >
                {savingPasswordReset ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Global Header
  globalHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  superBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  superBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  userSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Floating Bottom Tab Bar
  bottomNavWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  navTabBtn: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  navTabLabel: {
    fontSize: 10,
    marginTop: 3,
  },
  navBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 14,
    alignItems: "center",
  },
  navBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },

  // Overview Tab Content
  tabContentScroll: {
    padding: 16,
  },
  healthBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  healthBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  pulseIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  healthBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  healthBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  flushMiniBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  // Metrics Grid
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  metricGridCard: {
    flex: 1,
    minWidth: "47%",
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  metricSubtext: {
    fontSize: 11,
    marginTop: 2,
  },

  // Ratio Card
  ratioCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  ratioHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  ratioTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  ratioPercent: {
    fontSize: 13,
    fontWeight: "700",
  },
  ratioTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  ratioFill: {
    height: 6,
    borderRadius: 3,
  },

  // Section Heading
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },

  // Quick Actions Grid
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    minWidth: "47%",
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  quickActionSub: {
    fontSize: 11,
    marginTop: 2,
  },

  // Lockdown Card
  lockdownCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  lockdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  lockdownIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  lockdownTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  lockdownSub: {
    fontSize: 11,
    marginTop: 2,
  },

  specPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  specText: {
    fontSize: 10,
    fontWeight: "600",
  },

  // Filter & Search Bar for Admins / Hostels
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  addAdminBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addAdminBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 9,
    marginTop: 10,
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 7,
  },
  segmentedItemActive: {
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  segmentedItemText: {
    fontSize: 12,
  },

  // Roster Scroll
  rosterScroll: {
    padding: 16,
    gap: 12,
  },
  centerLoadingBox: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    padding: 30,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  emptyActionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Admin Card
  adminCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  adminCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  adminAvatarBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "800",
  },
  adminDetailsText: {
    flex: 1,
  },
  adminFullName: {
    fontSize: 15,
    fontWeight: "700",
  },
  selfTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  selfTagText: {
    fontSize: 9,
    fontWeight: "800",
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  adminEmailText: {
    fontSize: 12,
    marginTop: 2,
  },
  adminPhoneText: {
    fontSize: 11,
    marginTop: 1,
  },

  // Managed Property in Admin Card
  propertySection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  propertySectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  propertySectionTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  assignActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  assignActionBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  noPropertyText: {
    fontSize: 11,
    lineHeight: 16,
  },
  hostelChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  hostelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hostelChipText: {
    fontSize: 11,
    fontWeight: "600",
    maxWidth: 160,
  },

  // Card Footer Actions
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  createdDateText: {
    fontSize: 11,
  },
  resetPasswordBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  resetPasswordBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Hostel Card
  hostelCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  hostelCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  hostelCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  hostelCardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  hostelCardLocation: {
    fontSize: 12,
    marginTop: 2,
  },
  hostelCardPhone: {
    fontSize: 11,
    marginTop: 1,
  },
  hostelStaffBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  hostelStaffHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  hostelStaffTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  assignStaffBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  assignStaffBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  noStaffText: {
    fontSize: 11,
  },
  adminMiniChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  adminMiniChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  adminMiniAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  adminMiniAvatarText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  adminMiniName: {
    fontSize: 12,
    fontWeight: "600",
  },
  hostelCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  hostelCountBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },

  // Logs Tab
  logControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logControlsTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  logControlsSub: {
    fontSize: 11,
    marginTop: 2,
  },
  logActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logActionBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  logCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  logCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logLevelBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  logStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logStatusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  logTimestamp: {
    fontSize: 10,
    marginLeft: "auto",
  },
  logMessage: {
    fontSize: 12,
    lineHeight: 17,
  },
  logRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  logRouteText: {
    fontSize: 10,
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    padding: 20,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  hostelSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  hostelSelectChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalSubmitBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  assignHostelItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  assignHostelName: {
    fontSize: 14,
    fontWeight: "700",
  },
  assignHostelLoc: {
    fontSize: 11,
    marginTop: 2,
  },
  alreadyAssignedText: {
    fontSize: 11,
    fontWeight: "600",
  },

  genPassText: {
    fontSize: 12,
    fontWeight: "700",
  },
  passwordInputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    marginTop: 5,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  passwordHint: {
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
});
