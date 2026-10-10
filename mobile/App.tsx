/**
 * App.tsx — slim orchestrator
 *
 * All business logic lives in dedicated hooks:
 *   useAuth            — authentication state & login/logout
 *   useHostelData      — hostel / room / renter / fee / payment / repair data + refresh
 *   useRoomActions     — add / delete room
 *   useRenterActions   — add / edit / remove renter
 *   useFeeActions      — create fee
 *   usePaymentActions  — approve / reject payment proofs
 *   useNotificationActions — fee reminders, broadcast messages
 *
 * UI screens live in src/screens/:
 *   LoginScreen        — combined Renter (Google) + Admin (email/password) login
 *   RenterPortalScreen — resident-facing portal
 *   DashboardScreen, HostelsScreen, RoomsScreen,
 *   RentersScreen, FeesScreen, PaymentsScreen, MoreScreen
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

import { COLORS } from "./src/constants/theme";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";

import { Hostel, Renter, Tab } from "./src/types";
import { dashboardFrom } from "./src/utils/formatters";
import { API_URL, parseJsonResponse, warmupApi } from "./src/services/api";

// Hooks
import { useAuth, AuthCallbacks } from "./src/hooks/useAuth";
import { useHostelData } from "./src/hooks/useHostelData";
import { useRoomActions } from "./src/hooks/useRoomActions";
import { useRenterActions } from "./src/hooks/useRenterActions";
import { useFeeActions } from "./src/hooks/useFeeActions";
import { usePaymentActions } from "./src/hooks/usePaymentActions";

import { useRepairActions } from "./src/hooks/useRepairActions";
import { useNotificationActions } from "./src/hooks/useNotificationActions";
import { useNotificationSync } from "./src/hooks/useNotificationSync";
import { useExpoPushNotifications } from "./src/hooks/useExpoPushNotifications";

// Screens
import { LoginScreen } from "./src/screens/LoginScreen";
import { RenterPortalScreen } from "./src/screens/RenterPortalScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { HostelsScreen } from "./src/screens/HostelsScreen";
import { RoomsScreen } from "./src/screens/RoomsScreen";
import { RentersScreen } from "./src/screens/RentersScreen";
import { FeesScreen } from "./src/screens/FeesScreen";
import { PaymentsScreen } from "./src/screens/PaymentsScreen";
import { RepairsScreen } from "./src/screens/RepairsScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";

import { MoreScreen } from "./src/screens/MoreScreen";
import { SuperAdminScreen } from "./src/screens/SuperAdminScreen";
import { ThemedAlertModal } from "./src/components/ThemedAlertModal";
import { BiometricLockOverlay } from "./src/components/BiometricLockOverlay";
import { useBiometrics } from "./src/hooks/useBiometrics";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ToastProvider, useToast } from "./src/contexts/ToastContext";

import { OfflineBanner } from "./src/components/OfflineBanner";
import { flushOfflineQueue } from "./src/services/offlineQueue";
import { AuditLogModal } from "./src/components/AuditLogModal";

// Components
import { BottomTab } from "./src/components/common";



WebBrowser.maybeCompleteAuthSession();

const ADMIN_TABS: Tab[] = [
  "dashboard",
  "rooms",
  "renters",
  "payments",
  "more",
];

interface PlatformStatus {
  maintenanceMode: boolean;
  maintenanceNotice: string;
  alertBanner?: {
    active: boolean;
    title: string;
    message: string;
    level: "INFO" | "WARN" | "CRITICAL";
    updatedAt: string;
    updatedBy: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AppContent
// ─────────────────────────────────────────────────────────────────────────────
function AppContent() {
  const { colors, toggleTheme, isDark, themeMode } = useTheme();
  const toast = useToast();
  const [page, setPageState] = useState<Tab>("dashboard");
  const [pageHistory, setPageHistory] = useState<Tab[]>(["dashboard"]);
  const [paymentsInitialOption, setPaymentsInitialOption] = useState<"menu" | "fees_all" | "fees_paid" | "fees_unpaid" | "proofs" | "reminders" | "expenses">("menu");
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [containerWidth, setContainerWidth] = useState(
    Dimensions.get("window").width,
  );
  const pageScrollRef = useRef<ScrollView>(null);
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set(["dashboard"]));



  // Platform Maintenance & Alert Banner State (Features 2 & 5)
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus | null>(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [checkingMaintenance, setCheckingMaintenance] = useState(false);

  const fetchPlatformStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/platform/status`);
      if (res.ok) {
        const data = (await parseJsonResponse(res)) as PlatformStatus;
        setPlatformStatus(data);
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  useEffect(() => {
    void fetchPlatformStatus();
    const interval = setInterval(fetchPlatformStatus, 25000);
    return () => clearInterval(interval);
  }, [fetchPlatformStatus]);

  const renderGlobalAlertBanner = () => {
    if (!platformStatus?.alertBanner?.active || dismissedBanner) return null;
    const banner = platformStatus.alertBanner;
    const isCritical = banner.level === "CRITICAL";
    const isWarn = banner.level === "WARN";
    const bannerBg = isCritical
      ? (isDark ? "rgba(239, 68, 68, 0.15)" : "#FEF2F2")
      : isWarn
        ? (isDark ? "rgba(245, 158, 11, 0.15)" : "#FFFBEB")
        : (isDark ? "rgba(56, 189, 248, 0.15)" : "#F0F9FF");
    const bannerBorder = isCritical ? "#EF4444" : isWarn ? "#F59E0B" : "#0284C7";
    const bannerIcon = isCritical ? "alert-circle" : isWarn ? "warning" : "information-circle";

    return (
      <View style={[styles.globalBannerContainer, { backgroundColor: bannerBg, borderColor: bannerBorder }]}>
        <Ionicons name={bannerIcon as any} size={18} color={bannerBorder} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.globalBannerTitle, { color: colors.text }]}>{banner.title}</Text>
          <Text style={[styles.globalBannerText, { color: colors.secondary }]}>{banner.message}</Text>
        </View>
        <TouchableOpacity onPress={() => setDismissedBanner(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={16} color={colors.secondary} />
        </TouchableOpacity>
      </View>
    );
  };

  const goBack = useCallback(() => {
    setPageHistory((prev) => {
      let prevPage: Tab = "dashboard";
      let updated: Tab[] = ["dashboard"];
      if (prev.length > 1) {
        updated = prev.slice(0, -1);
        prevPage = updated[updated.length - 1];
      }
      setPageState(prevPage);
      if (ADMIN_TABS.includes(prevPage)) {
        const targetIdx = ADMIN_TABS.indexOf(prevPage);
        if (targetIdx >= 0 && containerWidth > 0) {
          pageScrollRef.current?.scrollTo({ x: targetIdx * containerWidth, animated: true });
        }
      }
      return updated;
    });
  }, [containerWidth]);

  // Hardware back button navigation on Android (prevents app exit)
  useEffect(() => {
    const onHardwareBack = () => {
      if (pageHistory.length > 1 || page !== "dashboard") {
        goBack();
        return true; // Handled: prevent app exit
      }
      return false; // Exit app only if already on initial dashboard
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [pageHistory, page, goBack]);

  const setPage = (next: Tab) => {
    const normalized = next === "fees" ? "payments" : next;
    setPageHistory((prev) => (prev[prev.length - 1] === normalized ? prev : [...prev, normalized]));
    setPageState(normalized);
    setMountedTabs((prev) => {
      if (prev.has(normalized)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(normalized);
      return nextSet;
    });
    if (ADMIN_TABS.includes(normalized)) {
      const targetIdx = ADMIN_TABS.indexOf(normalized);
      if (targetIdx >= 0 && containerWidth > 0) {
        // Instant snap on tap so bottom menu responds without delay
        pageScrollRef.current?.scrollTo({ x: targetIdx * containerWidth, animated: false });
      }
    }
  };

  const onPageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const width = containerWidth || Dimensions.get("window").width;
    if (width <= 0) return;
    const idx = Math.round(offsetX / width);
    if (idx >= 0 && idx < ADMIN_TABS.length) {
      const targetTab = ADMIN_TABS[idx];
      if (targetTab) {
        setMountedTabs((prev) => {
          if (prev.has(targetTab)) return prev;
          const nextSet = new Set(prev);
          nextSet.add(targetTab);
          return nextSet;
        });
        if (targetTab !== page) {
          setPageState(targetTab);
        }
      }
    }
  };

  const onPageScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const width = containerWidth || Dimensions.get("window").width;
    if (width <= 0) return;
    const idx = Math.round(offsetX / width);
    if (idx >= 0 && idx < ADMIN_TABS.length) {
      const targetTab = ADMIN_TABS[idx];
      if (targetTab) {
        setMountedTabs((prev) => {
          if (prev.has(targetTab)) return prev;
          const nextSet = new Set(prev);
          nextSet.add(targetTab);
          return nextSet;
        });
        setPageState(targetTab);
        setPageHistory((prev) =>
          prev[prev.length - 1] === targetTab ? prev : [...prev, targetTab],
        );
      }
    }
  };

  const [renterSearch, setRenterSearch] = useState("");

  // ── Data layer ──────────────────────────────────────────────────────────────
  const data = useHostelData();

  // Ref used by authCallbacks to call auth.setCurrentRenterDoc without a
  // forward-reference issue (auth is initialised after authCallbacks).
  const setCurrentRenterDocRef = useRef<((r: Renter | null) => void) | null>(null);

  // ── Auth layer ─────────────────────────────────────────────────────────────
  const authCallbacks: AuthCallbacks = useMemo(
    () => ({
      onHostelsLoaded: (hostels: Hostel[], token: string) => {
        data.setHostels(hostels);
        data.setToken(token);
        data.setSelectedHostelId(hostels[0]?.id || "");
      },
      onDashboardLoaded: (dashData: unknown) => {
        data.setDashboard(dashboardFrom(dashData));
        setPage("dashboard");
      },
      onRenterDataNeeded: (token: string, hostelId: string, userId: string) => {
        data.setToken(token);
        if (hostelId) {
          data.setSelectedHostelId(hostelId);
        }
        if (setCurrentRenterDocRef.current) {
          void data.loadRenterData(token, hostelId, userId, setCurrentRenterDocRef.current);
        }
      },
      onLogout: () => {
        data.resetAllData();
        setPage("dashboard");
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const auth = useAuth(authCallbacks);
  // Wire the ref once auth is available
  setCurrentRenterDocRef.current = auth.setCurrentRenterDoc;

  // Auto-refresh the active tab data silently in background when switching tabs
  useEffect(() => {
    if (auth.token && data.selectedHostelId) {
      void data.refreshTab(page);
    }
  }, [page, auth.token, data.selectedHostelId, data.refreshTab]);



  // ── Biometrics layer (Hardware Fingerprint / Face ID lock) ─────────────────
  const biometrics = useBiometrics(Boolean(auth.token));



  // ── Room actions ────────────────────────────────────────────────────────────
  const rooms = useRoomActions({
    selectedHostelId: data.selectedHostelId,
    renters: data.renters,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  // ── Renter actions ──────────────────────────────────────────────────────────
  const renters = useRenterActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  // ── Fee actions ─────────────────────────────────────────────────────────────
  const fees = useFeeActions({
    selectedHostelId: data.selectedHostelId,
    fees: data.fees,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  // ── Payment actions ─────────────────────────────────────────────────────────
  const payments = usePaymentActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });



  // ── Repair actions ──────────────────────────────────────────────────────────
  const repairsHook = useRepairActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  // ── Notification actions & Push system ──────────────────────────────────────
  const notificationsHook = useNotificationActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  const pushNotifications = useExpoPushNotifications((notifData) => {
    if (notifData.type === "REPAIR" || notifData.entityType === "REPAIR") {
      setPage("repairs");
    } else if (notifData.type === "FEE_DUE" || notifData.type === "FEE_OVERDUE") {
      setPage("payments");
    } else {
      setPage("notifications");
    }
  });

  useNotificationSync(
    data.notifications,
    pushNotifications.scheduleLocalNotification,
    Boolean(auth.token),
  );

  useEffect(() => {
    if (!auth.token || !auth.currentUser) return;
    pushNotifications.getExpoPushToken().then((token) => {
      if (token) {
        data.request("/notifications/push-token", {
          method: "POST",
          body: JSON.stringify({ token, platform: Platform.OS }),
        }).catch(() => {
          // Non-blocking in dev
        });
      }
    });
  }, [auth.token, auth.currentUser]);

  // ── Renter portal helpers ───────────────────────────────────────────────────
  async function handleRenterSubmitProof(params: {
    feeId: string;
    amount: number;
    paymentDate: string;
    proofUri: string;
    proofBase64?: string | null;
    proofMimeType?: string | null;
    reference?: string;
    notes?: string;
  }) {
    if (!auth.currentRenterDoc) throw new Error("Missing renter profile.");
    if (!auth.token) throw new Error("You are not signed in.");

    const hostelId = data.selectedHostelId || auth.currentRenterDoc.hostelId;
    if (!hostelId) throw new Error("Hostel ID is missing from your profile.");

    let base64 = params.proofBase64;
    if (!base64 && params.proofUri) {
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          params.proofUri,
          [{ resize: { width: 1080 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        base64 = manipResult.base64;
      } catch (readErr) {
        console.warn("Could not compress and read image as base64:", readErr);
      }
    }

    if (!base64) {
      throw new Error("Unable to read payment proof image data.");
    }

    const uploadResponse = await fetch(`${API_URL}/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        base64,
        originalName: `payment-proof-${Date.now()}.jpg`,
        contentType: params.proofMimeType || "image/jpeg",
      }),
    });

    const uploadData = (await parseJsonResponse(uploadResponse)) as {
      file?: { id?: string };
      message?: string;
    };
    if (!uploadResponse.ok || !uploadData.file?.id) {
      throw new Error(uploadData.message || "Unable to upload the payment proof.");
    }

    await data.request(`/hostels/${hostelId}/payment-proofs`, {
      method: "POST",
      body: JSON.stringify({
        renterId: auth.currentRenterDoc.id,
        feeId: params.feeId,
        amount: params.amount,
        paymentDate: params.paymentDate,
        proofUploadId: uploadData.file.id,
        ...(params.reference ? { reference: params.reference } : {}),
        ...(params.notes ? { notes: params.notes } : {}),
      }),
    });
    if (auth.currentUser) {
      await data.loadRenterData(
        auth.token!,
        hostelId,
        auth.currentUser.id,
        auth.setCurrentRenterDoc,
      );
    }
  }

  async function handleRenterSubmitRepair(params: {
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  }) {
    const hostelId = data.selectedHostelId || auth.currentRenterDoc?.hostelId;
    if (!hostelId) throw new Error("Hostel ID is missing from your profile.");

    await data.request(`/hostels/${hostelId}/repairs`, {
      method: "POST",
      body: JSON.stringify({
        ...params,
        roomId:
          auth.currentRenterDoc?.roomId || auth.currentRenterDoc?.room?.id,
      }),
    });
    if (auth.currentUser) {
      await data.loadRenterData(
        auth.token!,
        hostelId,
        auth.currentUser.id,
        auth.setCurrentRenterDoc,
      );
    }
  }

  // ── Auto-refresh effects ────────────────────────────────────────────────────
  useEffect(() => {
    warmupApi();
  }, []);


  useEffect(() => {
    if (!auth.token || !data.selectedHostelId) return;
    if (auth.currentUser?.role !== "ADMIN") return; // Super Admin & Renters don't load admin hostel data
    void data.refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, data.selectedHostelId, auth.currentUser?.role]);

  useEffect(() => {
    if (!auth.token || !data.selectedHostelId) return;
    if (auth.currentUser?.role !== "ADMIN") return;
    const timer = setInterval(() => {
      void data.refreshHostelData(data.selectedHostelId);
    }, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, data.selectedHostelId, auth.currentUser?.role]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && auth.token && data.selectedHostelId) {
        if (auth.currentUser?.role === "RENTER") {
          if (auth.currentUser?.id) {
            void data.loadRenterData(
              auth.token,
              data.selectedHostelId,
              auth.currentUser.id,
              auth.setCurrentRenterDoc,
            );
          }
        } else if (auth.currentUser?.role === "ADMIN") {
          void data.refreshHostelData(data.selectedHostelId);
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, data.selectedHostelId, auth.currentUser]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const paymentProofStats = useMemo(() => {
    const submitted = data.payments.filter((item) => {
      const status = String(item.status || "APPROVED").toUpperCase();
      return status === "SUBMITTED" || status === "PENDING";
    }).length;
    const approved = data.payments.filter(
      (item) => String(item.status || "APPROVED").toUpperCase() === "APPROVED",
    ).length;
    const rejected = data.payments.filter(
      (item) => String(item.status || "").toUpperCase() === "REJECTED",
    ).length;
    return { submitted, approved, rejected };
  }, [data.payments]);

  const recentPayments = useMemo(
    () =>
      [...data.payments]
        .filter((item) => item.amount && Number(item.amount) > 0)
        .sort((a, b) =>
          String(b.submittedAt || b.paymentDate || b.createdAt || "").localeCompare(
            String(a.submittedAt || a.paymentDate || a.createdAt || ""),
          ),
        )
        .slice(0, 6),
    [data.payments],
  );

  const monthlyPaymentBars = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleString("en-US", { month: "short" }), value: 0 });
    }
    data.payments.forEach((p) => {
      if (String(p.status || "APPROVED").toUpperCase() !== "APPROVED") return;
      const monthKey = String(
        p.paymentDate || p.submittedAt || p.createdAt || "",
      ).slice(0, 7);
      const month = months.find((m) => m.key === monthKey);
      if (month) month.value += Number(p.amount || 0);
    });
    return months;
  }, [data.payments]);

  const pendingProofsCount = useMemo(() => {
    return (data.payments || []).filter(
      (p) => String(p.status || "").toUpperCase() === "SUBMITTED",
    ).length;
  }, [data.payments]);

  const isDetailSubPage =
    page === "hostels" ||
    page === "repairs" ||
    page === "notifications";

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — session check (prevents login screen from flashing on startup)
  // ─────────────────────────────────────────────────────────────────────────
  if (auth.initializing) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text
          style={{
            marginTop: 16,
            color: colors.secondary,
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 0.5,
          }}
        >
          HostelDesk
        </Text>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — token available but user profile not yet resolved (mid-auth guard)
  // Prevents the admin dashboard from flashing during renter Google sign-in.
  // ─────────────────────────────────────────────────────────────────────────
  if (auth.token && !auth.currentUser) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: colors.background,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
          },
        ]}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text
          style={{
            marginTop: 16,
            color: colors.text,
            fontSize: 16,
            fontWeight: "700",
            letterSpacing: 0.3,
          }}
        >
          Signing you in…
        </Text>
        <Text
          style={{
            marginTop: 8,
            color: colors.secondary,
            fontSize: 13,
            textAlign: "center",
            lineHeight: 18,
            maxWidth: 320,
          }}
        >
          Connecting to cloud services. If this takes longer than a few moments, tap below to return to the login screen.
        </Text>
        {auth.error ? (
          <Text
            style={{
              marginTop: 12,
              color: colors.danger,
              fontSize: 13,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            {auth.error}
          </Text>
        ) : null}
        <TouchableOpacity
          style={{
            marginTop: 20,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
          onPress={() => void auth.logout()}
        >
          <Text style={{ fontSize: 13, color: colors.secondary, fontWeight: "600" }}>
            Cancel & Return to Login
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }


  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — not authenticated
  // ─────────────────────────────────────────────────────────────────────────
  if (!auth.token) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />
        {renderGlobalAlertBanner()}
        <LoginScreen
          loginRole={auth.loginRole}
          setLoginRole={auth.setLoginRole}
          showRenterEmailFallback={auth.showRenterEmailFallback}
          setShowRenterEmailFallback={auth.setShowRenterEmailFallback}
          renterEmailInput={auth.renterEmailInput}
          setRenterEmailInput={auth.setRenterEmailInput}
          renterPasswordInput={auth.renterPasswordInput}
          setRenterPasswordInput={auth.setRenterPasswordInput}
          onLoginWithGoogle={() => void auth.loginWithGoogle()}
          onLoginRenterWithEmail={() => void auth.loginRenterWithEmail()}
          onSendPasswordResetLink={() => void auth.sendPasswordResetLink()}
          email={auth.email}
          setEmail={auth.setEmail}
          password={auth.password}
          setPassword={auth.setPassword}
          showPassword={auth.showPassword}
          setShowPassword={auth.setShowPassword}
          onLoginAdmin={() => void auth.loginAdmin()}
          loading={auth.loading}
          error={auth.error}
          setError={auth.setError}
        />
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Biometric lock overlay (Hardware Face ID / Fingerprint guard)
  // ─────────────────────────────────────────────────────────────────────────
  if (auth.token && biometrics.isBiometricsEnabled && biometrics.isLocked) {
    return (
      <BiometricLockOverlay
        biometricLabel={biometrics.biometricTypeLabel}
        authError={biometrics.authError}
        onUnlock={() => void biometrics.promptUnlock()}
        onManualUnlock={() => biometrics.unlockManually()}
        onLogout={() => void auth.logout()}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Super Admin (Dedicated Administrator Governance Console)
  // Super Admin can ONLY add and manage admins — no other hostel operations.
  // Super Admin ALWAYS bypasses maintenance mode.
  // ─────────────────────────────────────────────────────────────────────────
  if (auth.currentUser?.role === "SUPER_ADMIN") {
    return (
      <SuperAdminScreen
        currentUser={auth.currentUser}
        token={auth.token}
        onLogout={auth.logout}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Platform Maintenance Mode (Feature 5)
  // If active, all non-Super Admin traffic receives this graceful screen.
  // ─────────────────────────────────────────────────────────────────────────
  if (platformStatus?.maintenanceMode) {
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
            {platformStatus.maintenanceNotice || "HostelDesk is currently undergoing scheduled platform upgrades. Services will resume shortly."}
          </Text>
          <TouchableOpacity
            style={[styles.maintenanceRefreshBtn, { backgroundColor: colors.text }]}
            onPress={async () => {
              setCheckingMaintenance(true);
              await fetchPlatformStatus();
              setCheckingMaintenance(false);
            }}
            disabled={checkingMaintenance}
          >
            {checkingMaintenance ? (
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
            onPress={() => void auth.logout()}
          >
            <Text style={{ fontSize: 13, color: colors.secondary, fontWeight: "600" }}>
              Log Out
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — renter portal
  // ─────────────────────────────────────────────────────────────────────────
  if (auth.currentUser?.role === "RENTER") {
    const renterTopBg = isDark ? "#060B1E" : "#0A1333";
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: renterTopBg }]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={renterTopBg}
        />
        {renderGlobalAlertBanner()}
        <RenterPortalScreen
          user={auth.currentUser}
          renter={auth.currentRenterDoc}
          hostel={data.selectedHostel || data.hostels[0] || null}
          fees={data.fees}
          payments={data.payments}
          repairs={data.repairs}
          notifications={data.notifications}
          token={auth.token}
          request={data.request}
          onRefresh={() => {
            if (auth.currentUser && data.selectedHostelId) {
              void data.loadRenterData(
                auth.token!,
                data.selectedHostelId,
                auth.currentUser.id,
                auth.setCurrentRenterDoc,
              );
            }
          }}
          onLogout={() => void auth.logout()}
          onSubmitProof={handleRenterSubmitProof}
          onSubmitRepair={handleRenterSubmitRepair}

          biometricLabel={biometrics.biometricTypeLabel}
          isBiometricsEnabled={biometrics.isBiometricsEnabled}
          isBiometricsSupported={biometrics.isHardwareAvailable && biometrics.isEnrolled}
          onToggleBiometrics={biometrics.toggleBiometrics}
        />
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — repair person portal
  // ─────────────────────────────────────────────────────────────────────────
  if (auth.currentUser?.role === "REPAIR_PERSON") {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 18,
              paddingVertical: 14,
              backgroundColor: colors.card,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>
                Repairs & Maintenance Portal
              </Text>
              <Text style={{ fontSize: 12, color: colors.secondary, marginTop: 2 }}>
                {auth.currentUser.firstName || auth.currentUser.email} • Technician
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => void auth.logout()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 7,
                backgroundColor: COLORS.dangerLight,
                borderRadius: 9,
              }}
            >
              <Ionicons name="log-out-outline" size={16} color={COLORS.danger} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.danger }}>Logout</Text>
            </TouchableOpacity>
          </View>
          <RepairsScreen
            repairs={data.repairs}
            renters={data.renters}
            rooms={data.rooms}
            selectedHostel={data.selectedHostel || data.hostels[0]}
            showStatusModal={repairsHook.showStatusModal}
            setShowStatusModal={repairsHook.setShowStatusModal}
            showCreateModal={repairsHook.showCreateModal}
            setShowCreateModal={repairsHook.setShowCreateModal}
            selectedRepair={repairsHook.selectedRepair}
            repairStatus={repairsHook.repairStatus}
            setRepairStatus={repairsHook.setRepairStatus}
            adminNotes={repairsHook.adminNotes}
            setAdminNotes={repairsHook.setAdminNotes}
            repairSaving={repairsHook.repairSaving}
            onOpenStatusModal={(r) => repairsHook.openStatusModal(r)}
            onUpdateStatus={(id, status, notes) =>
              repairsHook.updateRepairStatus(id, status, notes)
            }
            newTitle={repairsHook.newTitle}
            setNewTitle={repairsHook.setNewTitle}
            newDescription={repairsHook.newDescription}
            setNewDescription={repairsHook.setNewDescription}
            newPriority={repairsHook.newPriority}
            setNewPriority={repairsHook.setNewPriority}
            newRenterId={repairsHook.newRenterId}
            setNewRenterId={repairsHook.setNewRenterId}
            newRoomId={repairsHook.newRoomId}
            setNewRoomId={repairsHook.setNewRoomId}
            repairPersons={repairsHook.repairPersons}
            showAddPersonModal={false}
            personSaving={false}
            maintenanceTasks={repairsHook.maintenanceTasks}
            onAddMaintenanceTask={repairsHook.addMaintenanceTask}
            onUpdateMaintenanceTaskStatus={repairsHook.updateMaintenanceTaskStatus}
            onDeleteMaintenanceTask={repairsHook.deleteMaintenanceTask}
            onLoadMaintenanceTasks={repairsHook.loadMaintenanceTasks}
            maintenanceSaving={repairsHook.maintenanceSaving}
            onAddRepair={() => repairsHook.addRepair()}
            onRefresh={() => void data.refreshAll()}
            isRepairPerson={true}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isAdminRole =
    auth.currentUser?.role === "ADMIN" ||
    auth.currentUser?.role === "SUPER_ADMIN" ||
    (auth.currentUser?.role as any) === "WARDEN";

  if (isAdminRole) {
    const isNavyHero = page !== "more";
    const headerBg = isNavyHero ? (isDark ? "#060B1E" : "#0A1333") : colors.background;

    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: headerBg }]}>
        <StatusBar
          barStyle={isNavyHero ? "light-content" : (isDark ? "light-content" : "dark-content")}
          backgroundColor={headerBg}
        />
        {renderGlobalAlertBanner()}
        <OfflineBanner onSyncPress={() => void flushOfflineQueue(data.request)} />
        <View style={[styles.appContainer, { backgroundColor: colors.background }]}>
          <View
            style={[{ flex: 1 }, isDetailSubPage && { display: "none" }]}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - containerWidth) > 1) {
                setContainerWidth(w);
              }
            }}
          >
            <ScrollView
              ref={pageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              overScrollMode="never"
              bounces={false}
              nestedScrollEnabled={true}
              removeClippedSubviews={false}
              scrollEventThrottle={16}
              onScroll={onPageScroll}
              onMomentumScrollEnd={onPageScrollEnd}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1 }}
            >
              {ADMIN_TABS.map((tabKey) => {
                const isTabMounted = mountedTabs.has(tabKey) || tabKey === page;
                return (
                  <View
                    key={tabKey}
                    style={{ width: containerWidth, flex: 1 }}
                    collapsable={false}
                  >
                    {!isTabMounted ? (
                      <View style={{ flex: 1, backgroundColor: colors.background }} />
                    ) : (
                      <>
                        {tabKey === "dashboard" && (
                          <DashboardScreen
                            dashboard={data.dashboard}
                            selectedHostel={data.selectedHostel}
                            payments={data.payments}
                            fees={data.fees}
                            renters={data.renters}
                            paymentProofStats={paymentProofStats}
                            recentPayments={recentPayments}
                            monthlyPaymentBars={monthlyPaymentBars}
                            onRefresh={() => void data.refreshAll()}
                            onNavigate={(targetPage) => {
                              if (targetPage === "payments") {
                                setPaymentsInitialOption("menu");
                              }
                              setPage(targetPage);
                            }}
                            onNavigateToExpenses={() => {
                              setPaymentsInitialOption("expenses");
                              setPage("payments");
                            }}
                          />
                        )}



                        {tabKey === "rooms" && (
                          <RoomsScreen
                            rooms={data.rooms}
                            renters={data.renters}
                            selectedHostel={data.selectedHostel}
                            showRoomModal={rooms.showRoomModal}
                            setShowRoomModal={rooms.setShowRoomModal}
                            roomNumber={rooms.roomNumber}
                            setRoomNumber={rooms.setRoomNumber}
                            roomFloor={rooms.roomFloor}
                            setRoomFloor={rooms.setRoomFloor}
                            roomCapacity={rooms.roomCapacity}
                            setRoomCapacity={rooms.setRoomCapacity}
                            roomSaving={rooms.roomSaving}
                            onAddRoom={() => void rooms.addRoom()}
                            onDeleteRoom={(room) => rooms.deleteRoom(room)}
                            onRefresh={() => void data.refreshAll()}
                            request={data.request}
                            selectedHostelId={data.selectedHostelId}
                          />
                        )}

                        {tabKey === "renters" && (
                          <RentersScreen
                            renters={data.renters}
                            activeRenters={data.activeRenters}
                            rooms={data.rooms}
                            activeRooms={data.activeRooms}
                            selectedHostel={data.selectedHostel}
                            renterSearch={renterSearch}
                            setRenterSearch={setRenterSearch}
                            showRenterDetailsModal={renters.showRenterDetailsModal}
                            setShowRenterDetailsModal={renters.setShowRenterDetailsModal}
                            selectedRenter={renters.selectedRenter}
                            renterDetailsLoading={renters.renterDetailsLoading}
                            onOpenRenterDetails={(r) => void renters.openRenterDetails(r)}
                            onOpenEditRenter={(r) => renters.openEditRenter(r)}
                            onRemoveRenter={(r) => renters.removeRenter(r)}
                            showRenterModal={renters.showRenterModal}
                            setShowRenterModal={renters.setShowRenterModal}
                            onOpenRenterModal={renters.openRenterModal}
                            firstName={renters.firstName}
                            setFirstName={renters.setFirstName}
                            lastName={renters.lastName}
                            setLastName={renters.setLastName}
                            renterEmail={renters.renterEmail}
                            setRenterEmail={renters.setRenterEmail}
                            renterPhone={renters.renterPhone}
                            setRenterPhone={renters.setRenterPhone}
                            guardianName={renters.guardianName}
                            setGuardianName={renters.setGuardianName}
                            guardianPhone={renters.guardianPhone}
                            setGuardianPhone={renters.setGuardianPhone}
                            address={renters.address}
                            setAddress={renters.setAddress}
                            city={renters.city}
                            setCity={renters.setCity}
                            state={renters.state}
                            setState={renters.setState}
                            pincode={renters.pincode}
                            setPincode={renters.setPincode}
                            renterPassword={renters.renterPassword}
                            setRenterPassword={renters.setRenterPassword}
                            showRenterPassword={renters.showRenterPassword}
                            setShowRenterPassword={renters.setShowRenterPassword}
                            renterRoomId={renters.renterRoomId}
                            setRenterRoomId={renters.setRenterRoomId}
                            joiningDate={renters.joiningDate}
                            setJoiningDate={renters.setJoiningDate}
                            monthlyFee={renters.monthlyFee}
                            setMonthlyFee={renters.setMonthlyFee}
                            securityDeposit={renters.securityDeposit}
                            setSecurityDeposit={renters.setSecurityDeposit}
                            renterSaving={renters.renterSaving}
                            onAddRenter={() => void renters.addRenter()}
                            renterRoomPickerOpen={renters.renterRoomPickerOpen}
                            setRenterRoomPickerOpen={renters.setRenterRoomPickerOpen}
                            showEditRenterModal={renters.showEditRenterModal}
                            setShowEditRenterModal={renters.setShowEditRenterModal}
                            editingRenterId={renters.editingRenterId}
                            editFirstName={renters.editFirstName}
                            setEditFirstName={renters.setEditFirstName}
                            editLastName={renters.editLastName}
                            setEditLastName={renters.setEditLastName}
                            editPhone={renters.editPhone}
                            setEditPhone={renters.setEditPhone}
                            editGuardianName={renters.editGuardianName}
                            setEditGuardianName={renters.setEditGuardianName}
                            editGuardianPhone={renters.editGuardianPhone}
                            setEditGuardianPhone={renters.setEditGuardianPhone}
                            editAddress={renters.editAddress}
                            setEditAddress={renters.setEditAddress}
                            editCity={renters.editCity}
                            setEditCity={renters.setEditCity}
                            editState={renters.editState}
                            setEditState={renters.setEditState}
                            editPincode={renters.editPincode}
                            setEditPincode={renters.setEditPincode}
                            editRenterRoomId={renters.editRenterRoomId}
                            setEditRenterRoomId={renters.setEditRenterRoomId}
                            editJoiningDate={renters.editJoiningDate}
                            setEditJoiningDate={renters.setEditJoiningDate}
                            editMonthlyFee={renters.editMonthlyFee}
                            setEditMonthlyFee={renters.setEditMonthlyFee}
                            editSecurityDeposit={renters.editSecurityDeposit}
                            setEditSecurityDeposit={renters.setEditSecurityDeposit}
                            editRenterStatus={renters.editRenterStatus}
                            setEditRenterStatus={renters.setEditRenterStatus}
                            editRenterSaving={renters.editRenterSaving}
                            onUpdateRenter={() => void renters.updateRenter()}
                            editRenterRoomPickerOpen={renters.editRenterRoomPickerOpen}
                            setEditRenterRoomPickerOpen={renters.setEditRenterRoomPickerOpen}
                            onRefresh={() => void data.refreshAll()}
                          />
                        )}

                        {tabKey === "payments" && (
                          <PaymentsScreen
                            fees={data.fees}
                            payments={data.payments}
                            renters={data.renters}
                            activeRenters={data.activeRenters}
                            rooms={data.rooms}
                            selectedHostel={data.selectedHostel}
                            initialOption={paymentsInitialOption}
                            showFeeModal={fees.showFeeModal}
                            setShowFeeModal={fees.setShowFeeModal}
                            feeRenterId={fees.feeRenterId}
                            setFeeRenterId={fees.setFeeRenterId}
                            feeMonth={fees.feeMonth}
                            setFeeMonth={fees.setFeeMonth}
                            feeAmount={fees.feeAmount}
                            setFeeAmount={fees.setFeeAmount}
                            feeDueDate={fees.feeDueDate}
                            setFeeDueDate={fees.setFeeDueDate}
                            feeDescription={fees.feeDescription}
                            setFeeDescription={fees.setFeeDescription}
                            feeSaving={fees.feeSaving}
                            feeRenterPickerOpen={fees.feeRenterPickerOpen}
                            setFeeRenterPickerOpen={fees.setFeeRenterPickerOpen}
                            onOpenFeeModal={() => fees.openFeeModal()}
                            onAddFee={() => void fees.addFee()}
                            onDeleteFee={(feeId) => void fees.deleteFee(feeId)}
                            onRemindFee={(feeId, renterName, customMessage) =>
                              void notificationsHook.remindFee(feeId, renterName, customMessage)
                            }
                            onRemindAllUnpaid={() => void notificationsHook.remindAllUnpaid()}
                            showGenerateModal={fees.showGenerateModal}
                            setShowGenerateModal={fees.setShowGenerateModal}
                            generateMonth={fees.generateMonth}
                            setGenerateMonth={fees.setGenerateMonth}
                            generateDueDate={fees.generateDueDate}
                            setGenerateDueDate={fees.setGenerateDueDate}
                            generateSaving={fees.generateSaving}
                            onGenerateMonthlyFees={() => void fees.generateMonthlyFees()}
                            onMarkOverdue={() => void fees.markOverdueFees()}
                            paymentActionId={payments.paymentActionId}
                            onReviewPayment={(id, status, hostelId) =>
                              payments.reviewPayment(id, status, hostelId || data.selectedHostelId)
                            }
                            onDeletePayment={(id, hostelId) =>
                              void payments.deletePayment(id, hostelId || data.selectedHostelId)
                            }
                            onRefresh={() => void data.refreshAll()}
                            onBack={goBack}
                            token={auth.token}
                          />
                        )}

                        {tabKey === "more" && (
                          <MoreScreen
                            currentUser={auth.currentUser}
                            token={auth.token}
                            hostels={data.hostels}
                            onRefreshHostels={() => void data.refreshAll()}
                            onNavigateToFees={() => setPage("payments")}
                            onNavigateToPayments={() => setPage("payments")}
                            onNavigateToRepairs={() => setPage("repairs")}
                            onNavigateToDashboard={() => setPage("dashboard")}
                            onNavigateToHostels={() => setPage("hostels")}
                            onNavigateToNotifications={() => setPage("notifications")}
                            onRefresh={() => void data.refreshAll()}
                            onLogout={() => void auth.logout()}
                            themeMode={themeMode}
                            onToggleTheme={toggleTheme}
                            biometricLabel={biometrics.biometricTypeLabel}
                            isBiometricsEnabled={biometrics.isBiometricsEnabled}
                            isBiometricsSupported={biometrics.isHardwareAvailable && biometrics.isEnrolled}
                            onToggleBiometrics={biometrics.toggleBiometrics}
                          />
                        )}
                      </>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {isDetailSubPage && (
            <View style={{ flex: 1 }}>
              {page === "hostels" && (
                <HostelsScreen
                  hostels={data.hostels}
                  selectedHostelId={data.selectedHostelId}
                  onSelectHostel={(id) => {
                    data.setSelectedHostelId(id);
                    void data.refreshHostelData(id);
                    setPage("dashboard");
                  }}
                  onRefresh={() => void data.refreshAll()}
                  request={data.request}
                  onBack={goBack}
                />
              )}

              {page === "repairs" && (
                <RepairsScreen
                  repairs={data.repairs}
                  renters={data.renters}
                  rooms={data.rooms}
                  selectedHostel={data.selectedHostel}
                  showStatusModal={repairsHook.showStatusModal}
                  setShowStatusModal={repairsHook.setShowStatusModal}
                  showCreateModal={repairsHook.showCreateModal}
                  setShowCreateModal={repairsHook.setShowCreateModal}
                  selectedRepair={repairsHook.selectedRepair}
                  repairStatus={repairsHook.repairStatus}
                  setRepairStatus={repairsHook.setRepairStatus}
                  adminNotes={repairsHook.adminNotes}
                  setAdminNotes={repairsHook.setAdminNotes}
                  repairSaving={repairsHook.repairSaving}
                  onOpenStatusModal={(r) => repairsHook.openStatusModal(r)}
                  onUpdateStatus={(id, status, notes) =>
                    repairsHook.updateRepairStatus(id, status, notes)
                  }
                  newTitle={repairsHook.newTitle}
                  setNewTitle={repairsHook.setNewTitle}
                  newDescription={repairsHook.newDescription}
                  setNewDescription={repairsHook.setNewDescription}
                  newPriority={repairsHook.newPriority}
                  setNewPriority={repairsHook.setNewPriority}
                  newRenterId={repairsHook.newRenterId}
                  setNewRenterId={repairsHook.setNewRenterId}
                  newRoomId={repairsHook.newRoomId}
                  setNewRoomId={repairsHook.setNewRoomId}
                  repairPersons={repairsHook.repairPersons}
                  showAddPersonModal={repairsHook.showAddPersonModal}
                  setShowAddPersonModal={repairsHook.setShowAddPersonModal}
                  personSaving={repairsHook.personSaving}
                  onAddRepairPerson={repairsHook.addRepairPerson}
                  onUpdateRepairPerson={repairsHook.updateRepairPerson}
                  onRemoveRepairPerson={repairsHook.removeRepairPerson}
                  onLoadRepairPersons={repairsHook.loadRepairPersons}
                  maintenanceTasks={repairsHook.maintenanceTasks}
                  onAddMaintenanceTask={repairsHook.addMaintenanceTask}
                  onUpdateMaintenanceTaskStatus={repairsHook.updateMaintenanceTaskStatus}
                  onDeleteMaintenanceTask={repairsHook.deleteMaintenanceTask}
                  onLoadMaintenanceTasks={repairsHook.loadMaintenanceTasks}
                  maintenanceSaving={repairsHook.maintenanceSaving}
                  onAddRepair={() => repairsHook.addRepair()}
                  onDeleteRepair={(id, title) => void repairsHook.deleteRepair(id, title)}
                  onRefresh={() => void data.refreshAll()}
                  onBack={goBack}
                  isRepairPerson={false}
                />
              )}

              {page === "notifications" && (
                <NotificationsScreen
                  notifications={data.notifications}
                  selectedHostel={data.selectedHostel}
                  hostels={data.hostels}
                  onSendBroadcast={(title, message, type, scope) =>
                    notificationsHook.sendBroadcast(title, message, type, scope)
                  }
                  onDeleteNotification={(id) => void notificationsHook.deleteNotification(id)}
                  onClearAll={() => void notificationsHook.clearAllNotifications()}
                  onRefresh={() => void data.refreshAll()}
                  onBack={goBack}
                />
              )}

            </View>
          )}

          {/* Bottom navigation */}
          <View style={[styles.bottomNavWrap, { backgroundColor: colors.background }]}>
            <View
              style={[
                styles.bottomNav,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  shadowColor: isDark ? "#000000" : "#1E1B4B",
                  shadowOpacity: isDark ? 0.45 : 0.12,
                },
              ]}
            >
              <BottomTab
                icon="home-outline"
                activeIcon="home"
                label="Home"
                active={page === "dashboard"}
                onPress={() => setPage("dashboard")}
              />
              <BottomTab
                icon="bed-outline"
                activeIcon="bed"
                label="Rooms"
                active={page === "rooms"}
                onPress={() => setPage("rooms")}
              />
              <BottomTab
                icon="people-outline"
                activeIcon="people"
                label="Renters"
                active={page === "renters"}
                onPress={() => setPage("renters")}
              />
              <BottomTab
                icon="wallet-outline"
                activeIcon="wallet"
                label="Payments"
                badge={pendingProofsCount > 0 ? pendingProofsCount : undefined}
                active={page === "payments" || page === "fees"}
                onPress={() => {
                  setPaymentsInitialOption("menu");
                  setPage("payments");
                }}
              />
              <BottomTab
                icon="apps-outline"
                activeIcon="apps"
                label="More"
                active={
                  page === "more" ||
                  page === "hostels" ||
                  page === "repairs"
                }
                onPress={() => setPage("more")}
              />
            </View>
          </View>
        </View>

        {data.dataLoading ? (
          <View style={[styles.refreshOverlay, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.refreshOverlayText, { color: colors.secondary }]}>Refreshing…</Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  // Fallback while auth role is resolving to prevent any admin UI flashes
  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text
        style={{
          marginTop: 16,
          color: colors.secondary,
          fontSize: 14,
          fontWeight: "600",
          letterSpacing: 0.5,
        }}
      >
        Signing you in…
      </Text>
      <TouchableOpacity
        style={{
          marginTop: 20,
          paddingVertical: 10,
          paddingHorizontal: 20,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
        onPress={() => void auth.logout()}
      >
        <Text style={{ fontSize: 13, color: colors.secondary, fontWeight: "600" }}>
          Cancel & Return to Login
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppContent />
            <ThemedAlertModal />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles (only what AppContent itself needs — screens own their own styles)
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appContainer: { flex: 1 },
  bottomNavWrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 2 : 10,
  },
  bottomNav: {
    minHeight: 68,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth * 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  refreshOverlay: {
    position: "absolute",
    right: 16,
    bottom: 98,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  refreshOverlayText: { fontSize: 11 },

  // Global Alert Banner Styles
  globalBannerContainer: {
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
  globalBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  globalBannerText: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },

  // Maintenance Screen Styles
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