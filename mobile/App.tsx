/**
 * App.tsx — Thin Root Orchestrator
 *
 * All heavy logic is delegated to focused modules:
 *
 *   Hooks:
 *     usePageNavigation       — Tab navigation, ScrollView pager, history, back button
 *     usePlatformStatus       — Maintenance mode + alert banner polling
 *     usePaymentStats         — Derived payment statistics and chart data
 *     useAppEffects           — Push token registration, hostel auto-refresh, renter submit helpers
 *
 *   Shells / Screens:
 *     AdminAppShell           — Admin Horizontal Pager, Navigation & all Admin Screens
 *     TechnicianPortalScreen  — Maintenance technician repair portal
 *     MaintenanceScreen       — Platform maintenance notice
 *     AuthLoadingScreen       — Session init & mid-auth transition
 *     GlobalAlertBanner       — Incident & broadcast alert banner
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import { ToastProvider } from "./src/contexts/ToastContext";
import { Hostel, Renter } from "./src/types";
import { dashboardFrom } from "./src/utils/formatters";
import { warmupApi, startApiKeepAlive } from "./src/services/api";

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
import { useBiometrics } from "./src/hooks/useBiometrics";
import { usePageNavigation } from "./src/hooks/usePageNavigation";
import { usePlatformStatus } from "./src/hooks/usePlatformStatus";
import { usePaymentStats } from "./src/hooks/usePaymentStats";
import {
  usePushTokenRegistration,
  useHostelAutoRefresh,
  useRenterProofSubmit,
  useRenterRepairSubmit,
} from "./src/hooks/useAppEffects";
import { flushOfflineQueue } from "./src/services/offlineQueue";

// Screens & Shells
import { LoginScreen } from "./src/screens/LoginScreen";
import { RenterPortalScreen } from "./src/screens/RenterPortalScreen";
import { SuperAdminScreen } from "./src/screens/SuperAdminScreen";
import { AdminAppShell } from "./src/components/AdminAppShell";
import { TechnicianPortalScreen } from "./src/components/TechnicianPortalScreen";
import { MaintenanceScreen } from "./src/components/MaintenanceScreen";
import { AuthLoadingScreen } from "./src/components/AuthLoadingScreen";
import { GlobalAlertBanner } from "./src/components/GlobalAlertBanner";
import { ThemedAlertModal } from "./src/components/ThemedAlertModal";
import { BiometricLockOverlay } from "./src/components/BiometricLockOverlay";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { IntroVideoScreen } from "./src/components/IntroVideoScreen";

WebBrowser.maybeCompleteAuthSession();

// ─────────────────────────────────────────────────────────────────────────────
// AppContent — wires all hooks together and routes to the correct screen
// ─────────────────────────────────────────────────────────────────────────────
function AppContent() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0
  );

  // ── Navigation state ────────────────────────────────────────────────────────
  const nav = usePageNavigation();

  // ── Platform status (maintenance + alert banner) ────────────────────────────
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const { status: platformStatus, checking: checkingMaintenance, refreshStatus } = usePlatformStatus();

  // ── Data layer ──────────────────────────────────────────────────────────────
  const data = useHostelData();
  const setCurrentRenterDocRef = useRef<((r: Renter | null) => void) | null>(null);

  // ── Auth layer ──────────────────────────────────────────────────────────────
  const authCallbacks: AuthCallbacks = useMemo(() => ({
    onHostelsLoaded: (hostels: Hostel[], token: string) => {
      data.setHostels(hostels);
      data.setToken(token);
      if (hostels.length > 0) {
        data.setSelectedHostelId((prev) => prev || hostels[0].id);
      }
    },
    onDashboardLoaded: (dashData: unknown) => {
      data.setDashboard(dashboardFrom(dashData));
      nav.setPage("dashboard");
    },
    onRenterDataNeeded: (token: string, hostelId: string, userId: string) => {
      data.setToken(token);
      if (hostelId) data.setSelectedHostelId(hostelId);
      if (setCurrentRenterDocRef.current) {
        void data.loadRenterData(token, hostelId, userId, setCurrentRenterDocRef.current);
      }
    },
    onLogout: () => {
      data.resetAllData();
      nav.setPage("dashboard");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const auth = useAuth(authCallbacks);
  setCurrentRenterDocRef.current = auth.setCurrentRenterDoc;

  // Keep data layer token in sync
  useEffect(() => {
    if (auth.token) data.setToken(auth.token);
  }, [auth.token, data]);

  // Auto-refresh on tab change
  useEffect(() => {
    if (auth.token && data.selectedHostelId) {
      void data.refreshTab(nav.page);
    }
  }, [nav.page, auth.token, data.selectedHostelId, data.refreshTab]);

  // ── Biometrics ───────────────────────────────────────────────────────────────
  const biometrics = useBiometrics(Boolean(auth.token));

  // ── Action hooks ──────────────────────────────────────────────────────────────
  const rooms = useRoomActions({
    selectedHostelId: data.selectedHostelId,
    renters: data.renters,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  const renters = useRenterActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  const fees = useFeeActions({
    selectedHostelId: data.selectedHostelId,
    fees: data.fees,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  const payments = usePaymentActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  const repairsHook = useRepairActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  const notificationsHook = useNotificationActions({
    selectedHostelId: data.selectedHostelId,
    request: data.request,
    onRefresh: data.refreshAll,
  });

  // ── Push notifications ────────────────────────────────────────────────────────
  const pushNotifications = useExpoPushNotifications((notifData) => {
    if (notifData.type === "REPAIR" || notifData.entityType === "REPAIR") {
      nav.setPage("repairs");
    } else if (notifData.type === "FEE_DUE" || notifData.type === "FEE_OVERDUE") {
      nav.setPage("payments");
    } else {
      nav.setPage("notifications");
    }
  });

  useNotificationSync(
    data.notifications,
    pushNotifications.scheduleLocalNotification,
    Boolean(auth.token),
    auth.currentUser?.id,
    auth.currentUser?.role,
    data.refreshNotifications,
  );

  // ── Side-effects (push token, auto-refresh) ───────────────────────────────────
  usePushTokenRegistration(auth.token);

  const isHostelStaff =
    auth.currentUser?.role === "ADMIN" ||
    auth.currentUser?.role === "PARTNER" ||
    (auth.currentUser?.role as string) === "WARDEN";

  useHostelAutoRefresh(
    auth.token,
    data.selectedHostelId,
    isHostelStaff,
    data,
    auth.currentUser,
    auth.setCurrentRenterDoc,
  );

  useEffect(() => {
    warmupApi(true);
    const stopKeepAlive = startApiKeepAlive();
    return () => stopKeepAlive();
  }, []);

  // ── Renter submit helpers ─────────────────────────────────────────────────────
  const handleRenterSubmitProof = useRenterProofSubmit(
    {
      token: auth.token,
      currentUser: auth.currentUser,
      currentRenterDoc: auth.currentRenterDoc,
      setCurrentRenterDoc: auth.setCurrentRenterDoc,
    },
    {
      selectedHostelId: data.selectedHostelId,
      request: data.request,
      loadRenterData: data.loadRenterData,
    },
  );

  const handleRenterSubmitRepair = useRenterRepairSubmit(
    {
      token: auth.token,
      currentUser: auth.currentUser,
      currentRenterDoc: auth.currentRenterDoc,
      setCurrentRenterDoc: auth.setCurrentRenterDoc,
    },
    {
      selectedHostelId: data.selectedHostelId,
      request: data.request,
      loadRenterData: data.loadRenterData,
    },
  );

  // ── Payment derived stats ────────────────────────────────────────────────────
  const {
    submitted: paymentProofStats_submitted,
    approved: paymentProofStats_approved,
    rejected: paymentProofStats_rejected,
    pendingProofsCount,
    recentPayments,
    monthlyPaymentBars,
  } = usePaymentStats(data.payments);

  const paymentProofStats = useMemo(
    () => ({
      submitted: paymentProofStats_submitted,
      approved: paymentProofStats_approved,
      rejected: paymentProofStats_rejected,
    }),
    [paymentProofStats_submitted, paymentProofStats_approved, paymentProofStats_rejected],
  );

  // ── Payments screen state ────────────────────────────────────────────────────
  const [paymentsInitialOption, setPaymentsInitialOption] = useState<
    "menu" | "fees_all" | "fees_paid" | "fees_unpaid" | "proofs" | "reminders" | "expenses"
  >("menu");
  const [renterSearch, setRenterSearch] = useState("");

  // ── RENDER: 1. Initial session check ────────────────────────────────────────
  if (auth.initializing) {
    return <AuthLoadingScreen mode="init" />;
  }

  // ── RENDER: 2. Mid-auth token verification ───────────────────────────────────
  if (auth.token && !auth.currentUser) {
    return (
      <AuthLoadingScreen
        mode="resolving"
        error={auth.error}
        onCancel={() => void auth.logout()}
      />
    );
  }

  // ── RENDER: 3. Unauthenticated login ────────────────────────────────────────
  if (!auth.token) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
          translucent={Platform.OS === "android"}
        />
        <GlobalAlertBanner
          banner={platformStatus?.alertBanner}
          dismissed={dismissedBanner}
          onDismiss={() => setDismissedBanner(true)}
        />
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
      </View>
    );
  }

  // ── RENDER: 4. Biometric lock guard ─────────────────────────────────────────
  if (biometrics.isBiometricsEnabled && biometrics.isLocked) {
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

  // ── RENDER: 5. Super Admin governance console ────────────────────────────────
  if (auth.currentUser?.role === "SUPER_ADMIN") {
    return (
      <SuperAdminScreen
        currentUser={auth.currentUser}
        token={auth.token}
        onLogout={auth.logout}
      />
    );
  }

  // ── RENDER: 6. Platform maintenance screen ───────────────────────────────────
  if (platformStatus?.maintenanceMode) {
    return (
      <MaintenanceScreen
        notice={platformStatus.maintenanceNotice}
        isChecking={checkingMaintenance}
        onCheckStatus={refreshStatus}
        onLogout={() => void auth.logout()}
      />
    );
  }

  // ── RENDER: 7. Renter resident portal ───────────────────────────────────────
  if (auth.currentUser?.role === "RENTER") {
    const renterTopBg = isDark ? "#060B1E" : "#0A1333";
    return (
      <View style={[styles.safeArea, { backgroundColor: renterTopBg, paddingTop: topInset }]}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={renterTopBg}
          translucent={Platform.OS === "android"}
        />
        <GlobalAlertBanner
          banner={platformStatus?.alertBanner}
          dismissed={dismissedBanner}
          onDismiss={() => setDismissedBanner(true)}
        />
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
      </View>
    );
  }

  // ── RENDER: 8. Maintenance technician portal ─────────────────────────────────
  if (auth.currentUser?.role === "REPAIR_PERSON") {
    return (
      <TechnicianPortalScreen
        currentUser={auth.currentUser}
        data={data}
        repairsHook={repairsHook}
        onLogout={() => void auth.logout()}
      />
    );
  }

  // ── RENDER: 9. Admin / Partner shell ────────────────────────────────────────
  if (auth.currentUser) {
    return (
      <AdminAppShell
        page={nav.page}
        setPage={nav.setPage}
        goBack={nav.goBack}
        containerWidth={nav.containerWidth}
        setContainerWidth={nav.setContainerWidth}
        pageScrollRef={nav.pageScrollRef}
        mountedTabs={nav.mountedTabs}
        subPageAnim={nav.subPageAnim}
        onPageScroll={nav.onPageScroll}
        onPageScrollEnd={nav.onPageScrollEnd}
        data={data}
        auth={{
          token: auth.token,
          currentUser: auth.currentUser,
          logout: auth.logout,
        }}
        rooms={rooms}
        renters={renters}
        fees={fees}
        payments={payments}
        repairsHook={repairsHook}
        notificationsHook={notificationsHook}
        biometrics={biometrics}
        paymentProofStats={paymentProofStats}
        recentPayments={recentPayments}
        monthlyPaymentBars={monthlyPaymentBars}
        pendingProofsCount={pendingProofsCount}
        renterSearch={renterSearch}
        setRenterSearch={setRenterSearch}
        paymentsInitialOption={paymentsInitialOption}
        setPaymentsInitialOption={setPaymentsInitialOption}
        platformStatus={platformStatus}
        dismissedBanner={dismissedBanner}
        setDismissedBanner={setDismissedBanner}
        onFlushOfflineQueue={() => void flushOfflineQueue(data.request)}
      />
    );
  }

  // Fallback while role is resolving
  return (
    <AuthLoadingScreen
      mode="resolving"
      onCancel={() => void auth.logout()}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [introVideoFinished, setIntroVideoFinished] = useState(false);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppContent />
            <ThemedAlertModal />
            {!introVideoFinished && (
              <IntroVideoScreen onFinish={() => setIntroVideoFinished(true)} />
            )}
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});