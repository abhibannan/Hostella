import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Dimensions,
  Switch,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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

// ── Smooth Count-Up Number Component ─────────────────────────────────────────
function CountUpNumber({
  targetValue,
  duration = 800,
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
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
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
  const screenWidth = Dimensions.get("window").width;

  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? StatusBar.currentHeight || 28 : 0,
  );
  const bottomInset = Math.max(insets.bottom, 20);

  // Dashboard animations
  const dashboardEntrance = useRef(new Animated.Value(1)).current;
  const metricsEntrance = useRef(new Animated.Value(1)).current;
  const chartDrawAnim = useRef(new Animated.Value(1)).current;

  // ── Apple iOS Human Interface Theme (Cupertino Minimalist) ──
  const theme = {
    canvas: isDark ? "#000000" : "#F2F2F7",
    card: isDark ? "#1C1C1E" : "#FFFFFF",
    cardElevated: isDark ? "#2C2C2E" : "#F8F8FA",
    cardBorder: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(60, 60, 67, 0.1)",
    borderSubtle: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(60, 60, 67, 0.06)",
    fillTertiary: isDark ? "rgba(118, 118, 128, 0.24)" : "rgba(118, 118, 128, 0.12)",

    // Apple System Accent Colors
    primary: "#007AFF", // Apple System Blue
    primaryGlow: isDark ? "rgba(0, 122, 255, 0.2)" : "rgba(0, 122, 255, 0.12)",
    flame: "#007AFF",
    flameGlow: isDark ? "rgba(0, 122, 255, 0.2)" : "rgba(0, 122, 255, 0.12)",
    goldLight: isDark ? "#5AC8FA" : "#007AFF",

    // Mapped aliases for consistent UI rendering
    teal: "#007AFF",
    tealGlow: isDark ? "rgba(0, 122, 255, 0.2)" : "rgba(0, 122, 255, 0.12)",
    cyan: "#32ADE6", // Apple System Teal / Cyan
    cyanGlow: isDark ? "rgba(50, 173, 230, 0.2)" : "rgba(50, 173, 230, 0.12)",
    gold: "#FF9500", // Apple System Orange / Gold
    goldGlow: isDark ? "rgba(255, 149, 0, 0.2)" : "rgba(255, 149, 0, 0.12)",
    emerald: "#34C759", // Apple System Green
    emeraldGlow: isDark ? "rgba(52, 199, 89, 0.2)" : "rgba(52, 199, 89, 0.12)",
    crimson: "#FF3B30", // Apple System Red
    crimsonGlow: isDark ? "rgba(255, 59, 48, 0.2)" : "rgba(255, 59, 48, 0.12)",
    indigo: "#5856D6",
    indigoGlow: isDark ? "rgba(88, 86, 214, 0.2)" : "rgba(88, 86, 214, 0.12)",

    // Apple Typography Labels
    textPrimary: isDark ? "#FFFFFF" : "#000000",
    textSecondary: isDark ? "#8E8E93" : "#6C6C70",
    textMuted: isDark ? "#636366" : "#AEAEB2",
  };

  // ── States ────────────────────────────────────────────────────────────────
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

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

  // Governance / Maintenance
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  // ── Data Fetching ─────────────────────────────────────────────────────────
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

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAdmins(), loadHostels(), loadConfig()]);
    setLoading(false);
  }, [loadAdmins, loadHostels, loadConfig]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    haptic.medium();
    await Promise.all([loadAdmins(), loadHostels(), loadConfig()]);
    setRefreshing(false);
  };

  // ── Actions ───────────────────────────────────────────────────────────────
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

      const data = (await parseJsonResponse(res)) as { message?: string; user?: { id: string } };
      if (!res.ok) throw new Error(data.message || "Failed to create administrator");

      // Optional initial property assignment
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

  const handleToggleMaintenance = (enable: boolean) => {
    Alert.alert(
      enable ? "Activate Platform Lockdown" : "Restore Normal Operations",
      enable
        ? "Maintenance mode restricts mobile access for all hostel managers and residents with HTTP 503. Only Super Admins bypass."
        : "Restoring operations will immediately unblock public mobile access across all hostels.",
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

  // Filtered Admins
  const filteredAdmins = admins.filter((admin) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      admin.firstName.toLowerCase().includes(q) ||
      (admin.lastName && admin.lastName.toLowerCase().includes(q)) ||
      admin.email.toLowerCase().includes(q) ||
      (admin.phone && admin.phone.includes(q)) ||
      admin.assignedHostels?.some((h) => h.hostelName.toLowerCase().includes(q));

    const matchesFilter =
      filter === "ALL" ||
      (filter === "ACTIVE" && admin.status === "ACTIVE") ||
      (filter === "INACTIVE" && admin.status !== "ACTIVE");

    return matchesQuery && matchesFilter;
  });

  const activeCount = admins.filter((a) => a.status === "ACTIVE").length;
  const inactiveCount = admins.filter((a) => a.status !== "ACTIVE").length;
  const activePercent = admins.length > 0 ? (activeCount / admins.length) * 100 : 100;

  const greetingName = currentUser?.firstName || "Super Admin";

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />


      {/* ── 2. REAL SUPER ADMIN DASHBOARD (STAGGERED SLIDE-IN REVEAL) ────── */}
      <Animated.View
        style={[
          styles.screenContent,
          {
            opacity: dashboardEntrance,
            transform: [
              {
                translateY: dashboardEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* ── Top Executive Header Bar ───────────────────────────────────── */}
        <View
          style={[
            styles.dashboardHeader,
            {
              paddingTop: topInset + 6,
              backgroundColor: theme.card,
              borderBottomColor: theme.cardBorder,
            },
          ]}
        >
          <View style={styles.headerTopRow}>
            {/* Hostella Brand & Role */}
            <View style={styles.brandGroup}>
              <HostellaBrand variant="icon" size="medium" />
              <View style={{ marginLeft: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <HostellaBrand
                    variant="wordmark"
                    colorScheme={isDark ? "dark" : "light"}
                    size="medium"
                    style={{ alignItems: "flex-start" }}
                  />
                  <View style={[styles.roleBadge, { backgroundColor: theme.cyanGlow, borderColor: theme.cyan }]}>
                    <Text style={[styles.roleBadgeText, { color: theme.cyan }]}>SUPER ADMIN</Text>
                  </View>
                </View>
                <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
                  {currentUser?.email || "Executive Control Center"}
                </Text>
              </View>
            </View>

            {/* Utility Controls */}
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder }]}
                onPress={() => {
                  haptic.light();
                  toggleTheme();
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isDark ? "sunny-outline" : "moon-outline"}
                  size={15}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.headerBtn, { backgroundColor: theme.crimsonGlow, borderColor: theme.crimsonGlow }]}
                onPress={() => {
                  Alert.alert("Sign Out", "End Super Administrator session?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Sign Out", style: "destructive", onPress: onLogout },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="power-outline" size={15} color={theme.crimson} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Animated Staggered Metrics Strip (Count-Up Numbers) ──────── */}
          <Animated.View
            style={[
              styles.metricsStrip,
              {
                opacity: metricsEntrance,
                transform: [
                  {
                    translateY: metricsEntrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Metric 1: Total Admins */}
            <View style={[styles.metricCard, { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder }]}>
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>TOTAL ADMINS</Text>
              <CountUpNumber
                targetValue={admins.length}
                duration={700}
                style={[styles.metricValue, { color: theme.textPrimary }]}
              />
              <Text style={[styles.metricSubtext, { color: theme.textMuted }]}>Platform Staff</Text>
            </View>

            {/* Metric 2: Active Staff */}
            <View style={[styles.metricCard, { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder }]}>
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>ACTIVE STAFF</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={[styles.activeDot, { backgroundColor: theme.emerald }]} />
                <CountUpNumber
                  targetValue={activeCount}
                  duration={700}
                  style={[styles.metricValue, { color: theme.emerald }]}
                />
              </View>
              <Text style={[styles.metricSubtext, { color: theme.textMuted }]}>Ready to Manage</Text>
            </View>

            {/* Metric 3: Managed Hostels */}
            <View style={[styles.metricCard, { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder }]}>
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>MANAGED HOSTELS</Text>
              <CountUpNumber
                targetValue={hostels.length}
                duration={700}
                style={[styles.metricValue, { color: theme.cyan }]}
              />
              <Text style={[styles.metricSubtext, { color: theme.textMuted }]}>Live Properties</Text>
            </View>
          </Animated.View>

          {/* Animated Coverage Ratio Bar */}
          <View style={[styles.chartBarWrapper, { backgroundColor: theme.cardElevated }]}>
            <View style={styles.chartBarLabelRow}>
              <Text style={[styles.chartBarLabel, { color: theme.textSecondary }]}>Staff Active Ratio</Text>
              <Text style={[styles.chartBarPercent, { color: theme.teal }]}>
                {Math.round(activePercent)}% Operational
              </Text>
            </View>
            <View style={[styles.chartBarTrack, { backgroundColor: theme.borderSubtle }]}>
              <Animated.View
                style={[
                  styles.chartBarFill,
                  {
                    backgroundColor: theme.teal,
                    width: chartDrawAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", `${activePercent}%`],
                    }),
                  },
                ]}
              />
            </View>
          </View>

          {/* ── Search & Add Admin Bar (Apple HIG Layout) ──────────────────── */}
          <View style={styles.actionRow}>
            <View style={[styles.searchBox, { backgroundColor: theme.fillTertiary }]}>
              <Ionicons name="search" size={16} color={theme.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: theme.textPrimary }]}
                placeholder="Search staff, email or hostel..."
                placeholderTextColor={theme.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.addAdminBtn,
                {
                  backgroundColor: theme.primary,
                  shadowColor: theme.primary,
                },
              ]}
              onPress={() => {
                haptic.medium();
                setShowAddModal(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addAdminBtnText}>Add Admin</Text>
            </TouchableOpacity>
          </View>

          {/* ── Apple iOS Segmented Control ─────────────────────────────── */}
          <View style={[styles.segmentedControlContainer, { backgroundColor: theme.fillTertiary }]}>
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((tab) => {
              const isSelected = filter === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.segmentedTab,
                    isSelected && [
                      styles.segmentedTabActive,
                      {
                        backgroundColor: theme.card,
                        shadowColor: "#000",
                        shadowOpacity: isDark ? 0.35 : 0.08,
                      },
                    ],
                  ]}
                  onPress={() => {
                    haptic.selection();
                    setFilter(tab);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.segmentedTabText,
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

        {/* ── 3. ADMINISTRATOR CARDS ROSTER ───────────────────────────────── */}
        <ScrollView
          contentContainerStyle={[styles.rosterScroll, { paddingBottom: bottomInset + 30 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.teal}
              colors={[theme.teal]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {loading && admins.length === 0 ? (
            <View style={styles.centerLoadingBox}>
              <ActivityIndicator size="small" color={theme.teal} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading administrator directory...
              </Text>
            </View>
          ) : filteredAdmins.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Ionicons name="people-outline" size={36} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No Administrators Found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {searchQuery
                  ? `No accounts matching "${searchQuery}"`
                  : "Add an administrator to assign hostel management permissions."}
              </Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: theme.teal }]}
                onPress={() => setShowAddModal(true)}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Add Administrator</Text>
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
                  {/* Card Header: Avatar & Info */}
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
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={[styles.adminFullName, { color: theme.textPrimary }]}>
                            {admin.firstName} {admin.lastName || ""}
                          </Text>
                          {isSelf && (
                            <View style={[styles.selfTag, { backgroundColor: theme.cyanGlow, borderColor: theme.cyan }]}>
                              <Text style={[styles.selfTagText, { color: theme.cyan }]}>You</Text>
                            </View>
                          )}
                          <View
                            style={[
                              styles.rolePill,
                              { backgroundColor: isSuper ? theme.cyanGlow : theme.cardElevated },
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

                    {/* Status Toggle Switch */}
                    <View style={styles.switchWrapper}>
                      <Switch
                        value={isActive}
                        onValueChange={() => handleToggleStatus(admin)}
                        disabled={isSelf}
                        trackColor={{ false: theme.cardBorder, true: theme.emerald }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  </View>

                  {/* Managed Hostels Section */}
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
                          style={[styles.assignActionBtn, { backgroundColor: theme.tealGlow, borderColor: theme.teal }]}
                          onPress={() => {
                            setAssigningAdmin(admin);
                            setAssignHostelId("");
                          }}
                        >
                          <Ionicons name="add" size={12} color={theme.teal} />
                          <Text style={[styles.assignActionBtnText, { color: theme.teal }]}>
                            Assign Property
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {assignedHostelsList.length === 0 ? (
                        <Text style={[styles.noPropertyText, { color: theme.textMuted }]}>
                          No hostels assigned yet. This administrator cannot manage any branch until assigned.
                        </Text>
                      ) : (
                        <View style={styles.hostelChipsContainer}>
                          {assignedHostelsList.map((h) => (
                            <TouchableOpacity
                              key={h.hostelId}
                              style={[styles.hostelChip, { backgroundColor: theme.cardElevated, borderColor: theme.cardBorder }]}
                              onPress={() => handleUnassignHostel(admin, h.hostelId, h.hostelName)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="home-outline" size={12} color={theme.teal} />
                              <Text style={[styles.hostelChipText, { color: theme.textPrimary }]} numberOfLines={1}>
                                {h.hostelName}
                              </Text>
                              <Ionicons name="close-circle" size={13} color={theme.textMuted} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Footer: Date & Delete */}
                  {!isSelf && (
                    <View style={[styles.cardFooter, { borderTopColor: theme.cardBorder }]}>
                      <Text style={[styles.createdDateText, { color: theme.textMuted }]}>
                        Created {new Date(admin.createdAt).toLocaleDateString()}
                      </Text>

                      <TouchableOpacity
                        style={[styles.deleteBtn, { backgroundColor: theme.crimsonGlow }]}
                        onPress={() => handleDeleteAdmin(admin)}
                      >
                        <Ionicons name="trash-outline" size={12} color={theme.crimson} />
                        <Text style={[styles.deleteBtnText, { color: theme.crimson }]}>
                          Remove Administrator
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* ── Emergency Lockdown Footer ─────────────────────────────────── */}
          <View style={[styles.governanceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, marginTop: 14 }]}>
            <View style={styles.governanceRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons
                    name={maintenanceMode ? "lock-closed" : "shield-outline"}
                    size={15}
                    color={maintenanceMode ? theme.crimson : theme.emerald}
                  />
                  <Text style={[styles.governanceTitle, { color: theme.textPrimary }]}>
                    Platform Emergency Lockdown
                  </Text>
                </View>
                <Text style={[styles.governanceSub, { color: theme.textMuted }]}>
                  {maintenanceMode
                    ? "ACTIVE: Non-super admin access is blocked with HTTP 503."
                    : "All resident and admin portals operational."}
                </Text>
              </View>

              <Switch
                value={maintenanceMode}
                onValueChange={handleToggleMaintenance}
                disabled={savingMaintenance}
                trackColor={{ false: theme.cardBorder, true: theme.crimson }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* ── MODAL: PROVISION NEW ADMINISTRATOR ─────────────────────────────── */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.teal }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  New Administrator
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Create staff account with hostel management rights
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 14 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>FIRST NAME *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder }]}
                placeholder="e.g. Rahul"
                placeholderTextColor={theme.textMuted}
                value={newFirstName}
                onChangeText={setNewFirstName}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>LAST NAME</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder }]}
                placeholder="e.g. Sharma"
                placeholderTextColor={theme.textMuted}
                value={newLastName}
                onChangeText={setNewLastName}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>EMAIL ADDRESS *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder }]}
                placeholder="admin@example.com"
                placeholderTextColor={theme.textMuted}
                value={newEmail}
                onChangeText={setNewEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>PHONE NUMBER</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder }]}
                placeholder="+91 9876543210"
                placeholderTextColor={theme.textMuted}
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 10 }]}>TEMPORARY PASSWORD *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.cardElevated, color: theme.textPrimary, borderColor: theme.cardBorder }]}
                placeholder="Minimum 6 characters"
                placeholderTextColor={theme.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />

              {/* Initial Property Assignment (Optional) */}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 12 }]}>
                ASSIGN PROPERTY (OPTIONAL)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                <TouchableOpacity
                  style={[
                    styles.hostelSelectChip,
                    {
                      backgroundColor: !selectedHostelIdForNew ? theme.tealGlow : theme.cardElevated,
                      borderColor: !selectedHostelIdForNew ? theme.teal : theme.cardBorder,
                    },
                  ]}
                  onPress={() => setSelectedHostelIdForNew("")}
                >
                  <Text style={[styles.hostelSelectChipText, { color: !selectedHostelIdForNew ? theme.teal : theme.textSecondary }]}>
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
                          backgroundColor: isPicked ? theme.tealGlow : theme.cardElevated,
                          borderColor: isPicked ? theme.teal : theme.cardBorder,
                        },
                      ]}
                      onPress={() => setSelectedHostelIdForNew(h.id)}
                    >
                      <Text style={[styles.hostelSelectChipText, { color: isPicked ? theme.teal : theme.textPrimary }]}>
                        {h.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: theme.cardBorder }]}
                  onPress={() => setShowAddModal(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitTealBtn, { backgroundColor: theme.teal }]}
                  onPress={handleCreateAdmin}
                  disabled={savingAdmin}
                >
                  {savingAdmin ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitTealBtnText}>Create Administrator</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL: ASSIGN PROPERTY PERMISSION ──────────────────────────────── */}
      <Modal visible={Boolean(assigningAdmin)} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.teal }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Assign Managed Property
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Select a hostel for {assigningAdmin?.firstName} to oversee
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAssigningAdmin(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 14 }}>
              {hostels.length === 0 ? (
                <Text style={[styles.noPropertyText, { color: theme.textMuted, marginVertical: 20 }]}>
                  No hostels registered on the platform yet.
                </Text>
              ) : (
                hostels.map((hostel) => {
                  const isAssigned = assigningAdmin?.assignedHostels?.some(
                    (h) => h.hostelId === hostel.id,
                  );
                  const isSelected = assignHostelId === hostel.id;

                  return (
                    <TouchableOpacity
                      key={hostel.id}
                      style={[
                        styles.hostelPickCard,
                        {
                          backgroundColor: isSelected ? theme.tealGlow : theme.cardElevated,
                          borderColor: isSelected ? theme.teal : theme.cardBorder,
                        },
                      ]}
                      onPress={() => setAssignHostelId(hostel.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={[styles.hostelPickName, { color: theme.textPrimary }]}>
                            {hostel.name}
                          </Text>
                          {isAssigned && (
                            <View style={[styles.assignedTag, { backgroundColor: theme.emeraldGlow }]}>
                              <Text style={[styles.assignedTagText, { color: theme.emerald }]}>
                                Already Assigned
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.hostelPickSub, { color: theme.textMuted }]}>
                          {hostel.city || hostel.address || "Property ID: " + hostel.id.slice(0, 8)}
                        </Text>
                      </View>

                      <Ionicons
                        name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                        size={20}
                        color={isSelected ? theme.teal : theme.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })
              )}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: theme.cardBorder }]}
                  onPress={() => setAssigningAdmin(null)}
                >
                  <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitTealBtn, { backgroundColor: theme.teal }]}
                  onPress={handleAssignHostel}
                  disabled={savingAssignment || !assignHostelId}
                >
                  {savingAssignment ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitTealBtnText}>Confirm Assignment</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── HOSTELLA VISUAL STYLES ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
  },

  // Dashboard Header
  dashboardHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  brandSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  // Metrics Strip (Apple Inset Cards)
  metricsStrip: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 3,
  },
  metricSubtext: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Chart Bar
  chartBarWrapper: {
    marginTop: 10,
    borderRadius: 12,
    padding: 10,
  },
  chartBarLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  chartBarLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  chartBarPercent: {
    fontSize: 11,
    fontWeight: "700",
  },
  chartBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  chartBarFill: {
    height: "100%",
    borderRadius: 3,
  },

  // Action Row
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    height: 40,
  },
  addAdminBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 15,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  addAdminBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Apple Segmented Control Container
  segmentedControlContainer: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    marginTop: 12,
  },
  segmentedTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentedTabActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  segmentedTabText: {
    fontSize: 11.5,
  },

  // Filter Pills Row (legacy fallback)
  filterPillsRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 10,
  },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
  },

  // Roster Scroll
  rosterScroll: {
    padding: 14,
    gap: 12,
  },
  centerLoadingBox: {
    paddingVertical: 40,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  emptyBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
  },
  emptyAddBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Admin Card (Apple Inset Grouped Card)
  adminCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  adminCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  adminAvatarBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 17,
    fontWeight: "800",
  },
  adminDetailsText: {
    marginLeft: 12,
    flex: 1,
  },
  adminFullName: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  selfTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  selfTagText: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  rolePill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  adminEmailText: {
    fontSize: 12,
    marginTop: 2,
  },
  adminPhoneText: {
    fontSize: 11.5,
    marginTop: 1,
  },
  switchWrapper: {
    marginLeft: 8,
  },

  // Property Section
  propertySection: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 10,
  },
  propertySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  propertySectionTitle: {
    fontSize: 11,
    fontWeight: "600",
  },
  assignActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  assignActionBtnText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  noPropertyText: {
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  hostelChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  hostelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: "85%",
  },
  hostelChipText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Footer Actions
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 8,
  },
  createdDateText: {
    fontSize: 10.5,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  deleteBtnText: {
    fontSize: 10.5,
    fontWeight: "700",
  },

  // Governance Card
  governanceCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  governanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  governanceTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  governanceSub: {
    fontSize: 10.5,
    marginTop: 2,
    lineHeight: 14,
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  fieldLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  modalInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    marginTop: 4,
  },
  hostelSelectChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
  },
  hostelSelectChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  submitTealBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  submitTealBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  // Hostel Pick Card in Modal
  hostelPickCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  hostelPickName: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  hostelPickSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  assignedTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  assignedTagText: {
    fontSize: 9,
    fontWeight: "700",
  },
});
