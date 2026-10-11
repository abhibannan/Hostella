import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  RefreshControl,
  Image,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Dashboard, Fee, Hostel, Payment, Renter, Tab } from "../types";
import { money } from "../utils/formatters";
import { StatCard, SectionTitle, EmptyState, AnimatedPressable, Reveal, CountUp } from "../components/common";
import {
  DonutChart,
  BarChart,
  RevenueTrendChart,
  OccupancyGauge,
  MonthOverMonthCard,
  MonthlyTrendData,
} from "../components/charts";
import { DashboardSkeleton } from "../components/Skeleton";
import { exportFinancialStatementPDF } from "../services/exportService";
import { GRADIENTS, GOLD, RADIUS, shadow } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { HostellaBrand } from "../components/HostellaBrand";
import { haptic } from "../utils/haptics";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}


/** Soft chart container with an icon header. */
function ChartCard({
  icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.chartCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        shadow(1, isDark),
      ]}
    >
      <View style={styles.chartHead}>
        <View style={[styles.chartIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.chartSubtitle, { color: colors.secondary }]}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

interface DashboardScreenProps {
  dashboard: Dashboard;
  selectedHostel?: Hostel;
  payments: Payment[];
  fees?: Fee[];
  renters?: Renter[];
  paymentProofStats: { submitted: number; approved: number; rejected: number };
  recentPayments: Payment[];
  monthlyPaymentBars: { key: string; label: string; value: number }[];
  onRefresh: () => void;
  onNavigate?: (page: Tab) => void;
  onNavigateToExpenses?: () => void;
  loading?: boolean;
}

export function DashboardScreen({
  dashboard,
  selectedHostel,
  payments,
  fees = [],
  renters = [],
  paymentProofStats,
  recentPayments,
  monthlyPaymentBars,
  onRefresh,
  onNavigate,
  onNavigateToExpenses,
  loading = false,
}: DashboardScreenProps) {
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const isTabletOrWide = screenWidth >= 600;
  const glanceColumns = isTabletOrWide ? 4 : 2;
  const glanceGap = 10;
  const availableContentWidth = Math.max(280, screenWidth - 32);
  const glanceCardWidth = Math.floor(
    (availableContentWidth - (glanceColumns - 1) * glanceGap) / glanceColumns,
  );
  const quickCellWidth = isTabletOrWide ? "12.5%" : "25%";

  const handleRefresh = async () => {
    haptic.light();
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleExportFinancialReport = async () => {
    haptic.medium();
    try {
      toast.info("Generating financial statement...", "Exporting PDF");
      const totalBilled = fees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const totalCollected = fees.reduce((sum, f) => sum + Number(f.paidAmount || 0), 0);
      const totalOutstanding = Math.max(0, totalBilled - totalCollected);
      const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

      await exportFinancialStatementPDF(
        fees,
        { totalBilled, totalCollected, totalOutstanding, collectionRate },
        selectedHostel?.name || "Hostella Property"
      );
      toast.success("Financial statement opened for download/sharing!", "Export Ready");
    } catch (e) {
      toast.error("Failed to generate financial statement.", "Export Error");
    }
  };

  // Month-over-month calculation
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  let thisMonthCollected = 0;
  let lastMonthCollected = 0;

  payments.forEach((p) => {
    if (String(p.status || "APPROVED").toUpperCase() !== "APPROVED") return;
    const key = String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 7);
    if (key === currentMonthKey) thisMonthCollected += Number(p.amount || 0);
    else if (key === lastMonthKey) lastMonthCollected += Number(p.amount || 0);
  });

  // Revenue trend: 6 months dual bars
  const revenueTrendData: MonthlyTrendData[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short" });

    let collected = 0;
    let outstanding = 0;

    payments.forEach((p) => {
      if (String(p.status || "APPROVED").toUpperCase() !== "APPROVED") return;
      if (String(p.paymentDate || p.submittedAt || p.createdAt || "").slice(0, 7) === key) {
        collected += Number(p.amount || 0);
      }
    });

    fees.forEach((f) => {
      if (String(f.dueDate || f.createdAt || "").slice(0, 7) === key) {
        const amt = Number(f.amount || 0);
        const paid = Number(f.paidAmount || 0);
        outstanding += Math.max(0, amt - paid);
      }
    });

    revenueTrendData.push({
      month: label,
      collected: Math.round(collected),
      outstanding: Math.round(outstanding),
    });
  }

  const occupancyRate =
    dashboard.totalRooms > 0
      ? Math.round((dashboard.occupiedRooms / dashboard.totalRooms) * 100)
      : 0;

  const roomChart = [
    { label: "Occupied", value: dashboard.occupiedRooms, color: colors.primary },
    { label: "Available", value: dashboard.availableRooms, color: colors.success },
  ];

  const feeChart = [
    { label: "Paid", value: dashboard.paidFees, color: colors.success },
    { label: "Pending", value: dashboard.pendingFees, color: colors.primary },
    { label: "Partial", value: dashboard.partiallyPaidFees, color: colors.warning },
    { label: "Overdue", value: dashboard.overdueFees, color: colors.danger },
  ];

  const repairChart = [
    { label: "Submitted", value: dashboard.submittedRepairs, color: colors.primary },
    { label: "Progress", value: dashboard.inProgressRepairs, color: colors.warning },
    { label: "Resolved", value: dashboard.resolvedRepairs, color: colors.success },
    { label: "Cancelled", value: dashboard.cancelledRepairs, color: colors.secondary },
  ];

  const collectedDelta =
    lastMonthCollected > 0
      ? ((thisMonthCollected - lastMonthCollected) / lastMonthCollected) * 100
      : thisMonthCollected > 0
        ? 100
        : 0;
  const deltaUp = collectedDelta >= 0;

  // Entrance animation for the hero
  const heroAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(heroAnim, { toValue: 1, speed: 12, bounciness: 6, useNativeDriver: true }).start();
  }, [heroAnim]);

  const occFill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(occFill, { toValue: Math.min(100, occupancyRate), duration: 1000, useNativeDriver: false }).start();
  }, [occFill, occupancyRate]);

  const heroColors = isDark ? GRADIENTS.heroDark : GRADIENTS.hero;
  const pendingProofs = paymentProofStats.submitted;
  const openRepairs = (dashboard.submittedRepairs || 0) + (dashboard.inProgressRepairs || 0);
  const insights = [
    { key: "overdue", n: dashboard.overdueFees || 0, label: "overdue fees", icon: "alert-circle" as const, fg: colors.danger, bg: colors.dangerLight, go: () => onNavigate?.("fees") },
    { key: "proofs", n: pendingProofs || 0, label: "proofs to review", icon: "receipt" as const, fg: colors.warning, bg: colors.warningLight, go: () => onNavigate?.("payments") },
    { key: "repairs", n: openRepairs, label: "open repairs", icon: "build" as const, fg: colors.primary, bg: colors.primaryLight, go: () => onNavigate?.("repairs") },
  ].filter((i) => i.n > 0);

  // Quick actions — preserved routes with exact pastel colors from mockup
  const quickActions = [
    { id: "rooms", title: "Rooms", icon: "bed-outline" as const, fg: "#6D28D9", bg: "#F3E8FF", onPress: () => onNavigate?.("rooms") },
    { id: "renters", title: "Renters", icon: "people-outline" as const, fg: "#059669", bg: "#D1FAE5", onPress: () => onNavigate?.("renters") },
    { id: "payments", title: "Payments", icon: "wallet-outline" as const, fg: "#D97706", bg: "#FEF3C7", badge: pendingProofs, onPress: () => onNavigate?.("payments") },
    { id: "repairs", title: "Repairs", icon: "build-outline" as const, fg: "#E11D48", bg: "#FFE4E6", onPress: () => onNavigate?.("repairs") },
    { id: "hostels", title: "Properties", icon: "business-outline" as const, fg: "#4338CA", bg: "#E0E7FF", onPress: () => onNavigate?.("hostels") },
    { id: "notices", title: "Notices", icon: "notifications-outline" as const, fg: "#0284C7", bg: "#E0F2FE", onPress: () => onNavigate?.("more") },
    { id: "expenses", title: "Expenses", icon: "pie-chart-outline" as const, fg: "#7C3AED", bg: "#EDE9FE", onPress: () => (onNavigateToExpenses ? onNavigateToExpenses() : onNavigate?.("payments")) },
    { id: "settings", title: "Settings", icon: "settings-outline" as const, fg: "#475569", bg: "#F1F5F9", onPress: () => onNavigate?.("more") },
  ];

  if (loading) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.screenContent}
      >
        <DashboardSkeleton />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled={true}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* ── Deep Royal Navy Hero Banner ── */}
      <View style={styles.heroContainer}>
        <LinearGradient
          colors={isDark ? ["#060B1E", "#0B163B", "#132357"] : ["#0A1333", "#122566", "#1E3A8A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.35, y: 1 }}
          style={styles.heroBannerGradient}
        >
          {/* Ambient Lighting Orbs */}
          <View style={[styles.ambientOrb, { top: -60, right: -40, width: 220, height: 220, backgroundColor: "rgba(59, 130, 246, 0.25)" }]} />
          <View style={[styles.ambientOrb, { top: 20, left: -60, width: 170, height: 170, backgroundColor: "rgba(139, 92, 246, 0.22)" }]} />

          {/* Top Row: App Logo + Title + Tagline */}
          <View style={styles.headerTopBar}>
            <View style={styles.brandRow}>
              <HostellaBrand variant="icon" size="medium" />
              <View style={{ marginLeft: 10 }}>
                <HostellaBrand variant="wordmark" colorScheme="dark" size="medium" style={{ alignItems: "flex-start" }} />
                <Text style={styles.brandSubtitle}>Hostel Management Made Simple</Text>
              </View>
            </View>
          </View>

          {/* Active Property Card */}
          <Animated.View
            style={{
              opacity: heroAnim,
              transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            }}
          >
            <TouchableOpacity
              style={styles.activePropertyCard}
              onPress={() => onNavigate?.("hostels")}
              activeOpacity={0.85}
            >
              <View style={styles.activePropertyLeft}>
                <View style={styles.activePropertyBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeBadgeText}>Active Property</Text>
                </View>
                <Text style={styles.activePropertyName} numberOfLines={1}>
                  {selectedHostel?.name || "Hostella Property"}
                </Text>
                <View style={styles.activePropertyLocRow}>
                  <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.75)" />
                  <Text style={styles.activePropertyLocText} numberOfLines={1}>
                    {selectedHostel?.city || selectedHostel?.address || selectedHostel?.type || "Tap to switch property"}
                  </Text>
                </View>
              </View>

              <View style={styles.activePropertyActionBox}>
                <View style={styles.propertyIconCircle}>
                  <Ionicons name="business" size={20} color="#FFFFFF" />
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.75)" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        </LinearGradient>

        {/* ── 3 Floating Metric Cards (Occupancy, Collected, Outstanding) ── */}
        <View style={styles.floatingKpiRow}>
          {/* Card 1: Occupancy */}
          <View style={[styles.floatingCard, { backgroundColor: colors.card, borderColor: colors.border }, shadow(2, isDark)]}>
            <Text style={[styles.floatingCardLabel, { color: colors.secondary }]}>Occupancy</Text>
            <Text style={[styles.floatingCardValue, { color: colors.text }]}>{occupancyRate}%</Text>
            <View style={styles.miniProgressBarTrack}>
              <Animated.View
                style={[
                  styles.miniProgressBarFill,
                  {
                    backgroundColor: "#6366F1",
                    width: occFill.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
                  },
                ]}
              />
            </View>
          </View>

          {/* Card 2: Collected this month */}
          <View style={[styles.floatingCard, { backgroundColor: colors.card, borderColor: colors.border }, shadow(2, isDark)]}>
            <Text style={[styles.floatingCardLabel, { color: colors.secondary }]}>Collected this month</Text>
            <Text style={[styles.floatingCardValue, { color: colors.text }]} numberOfLines={1}>
              ₹{Math.round(thisMonthCollected).toLocaleString()}
            </Text>
            <View style={[styles.statusTag, { backgroundColor: deltaUp ? "#DCFCE7" : "#FEE2E2" }]}>
              <Ionicons name={deltaUp ? "arrow-up" : "arrow-down"} size={9} color={deltaUp ? "#16A34A" : "#DC2626"} />
              <Text style={[styles.statusTagText, { color: deltaUp ? "#16A34A" : "#DC2626" }]}>
                {Math.abs(Math.round(collectedDelta))}%
              </Text>
            </View>
          </View>

          {/* Card 3: Outstanding */}
          <View style={[styles.floatingCard, { backgroundColor: colors.card, borderColor: colors.border }, shadow(2, isDark)]}>
            <Text style={[styles.floatingCardLabel, { color: colors.secondary }]}>Outstanding</Text>
            <Text style={[styles.floatingCardValue, { color: colors.text }]} numberOfLines={1}>
              ₹{Math.round(dashboard.outstandingFees || 0).toLocaleString()}
            </Text>
            <View style={[styles.statusTag, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="alert-circle" size={9} color="#DC2626" />
              <Text style={[styles.statusTagText, { color: "#DC2626" }]}>overdue</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.mainBodyContent}>
        {/* ── Needs attention ── */}
        {insights.length > 0 && (
          <Reveal delay={140}>
            <View style={styles.insightRow}>
              {insights.map((i) => (
                <Pressable
                  key={i.key}
                  onPress={() => {
                    haptic.cardPress();
                    i.go();
                  }}
                  style={[styles.insightChip, { backgroundColor: i.bg }]}
                >
                  <Ionicons name={i.icon} size={15} color={i.fg} />
                  <Text style={[styles.insightText, { color: i.fg }]}>
                    {i.n} {i.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={i.fg} />
                </Pressable>
              ))}
            </View>
          </Reveal>
        )}

        {/* ── Quick actions ── */}
        <Reveal delay={200}>
          <SectionTitle title="Quick Actions" />
          <View
            style={[
              styles.quickCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              shadow(1, isDark),
            ]}
          >
            <View style={styles.quickGrid}>
              {quickActions.map((a) => (
                <AnimatedPressable
                  key={a.id}
                  containerStyle={[styles.quickCell, { width: quickCellWidth }]}
                  style={{ alignItems: "center" }}
                  scaleTo={0.9}
                  onPress={a.onPress}
                >
                  <View style={[styles.quickIcon, { backgroundColor: a.bg }]}>
                    <Ionicons name={a.icon} size={22} color={a.fg} />
                    {"badge" in a && (a as any).badge > 0 ? (
                      <View style={[styles.quickBadge, { backgroundColor: colors.danger, borderColor: colors.card }]}>
                        <Text style={styles.quickBadgeText}>{(a as any).badge > 9 ? "9+" : (a as any).badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.quickLabel, { color: colors.text }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
        </Reveal>

        {/* ── At a Glance (Responsive Grid) ── */}
        <Reveal delay={280}>
          <SectionTitle title="At a Glance" />
          <View style={styles.atAGlanceGrid}>
            {/* Card 1: Total Rooms */}
            <Pressable
              style={[styles.glanceCard, { width: glanceCardWidth, backgroundColor: colors.card, borderColor: colors.border }, shadow(1, isDark)]}
              onPress={() => onNavigate?.("rooms")}
            >
              <View style={styles.glanceHeader}>
                <View style={[styles.glanceIconCircle, { backgroundColor: "#D1FAE5" }]}>
                  <Ionicons name="bed-outline" size={14} color="#059669" />
                </View>
                <Text style={[styles.glanceLabel, { color: colors.secondary }]} numberOfLines={1}>Total Rooms</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.secondary} style={{ marginLeft: "auto" }} />
              </View>
              <Text style={[styles.glanceValue, { color: colors.text }]}>{dashboard.totalRooms}</Text>
              <View style={styles.glanceSubRow}>
                <View style={[styles.glanceDot, { backgroundColor: "#8B5CF6" }]} />
                <Text style={[styles.glanceSubText, { color: colors.secondary }]}>
                  {dashboard.occupiedRooms} occupied
                </Text>
              </View>
            </Pressable>

            {/* Card 2: Total Renters */}
            <Pressable
              style={[styles.glanceCard, { width: glanceCardWidth, backgroundColor: colors.card, borderColor: colors.border }, shadow(1, isDark)]}
              onPress={() => onNavigate?.("renters")}
            >
              <View style={styles.glanceHeader}>
                <View style={[styles.glanceIconCircle, { backgroundColor: "#DBEAFE" }]}>
                  <Ionicons name="people-outline" size={14} color="#2563EB" />
                </View>
                <Text style={[styles.glanceLabel, { color: colors.secondary }]} numberOfLines={1}>Total Renters</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.secondary} style={{ marginLeft: "auto" }} />
              </View>
              <Text style={[styles.glanceValue, { color: colors.text }]}>{dashboard.activeRenters}</Text>
              <View style={styles.glanceSubRow}>
                <View style={[styles.glanceDot, { backgroundColor: "#3B82F6" }]} />
                <Text style={[styles.glanceSubText, { color: colors.secondary }]}>
                  {dashboard.activeRenters} active
                </Text>
              </View>
            </Pressable>

            {/* Card 3: Available Rooms */}
            <Pressable
              style={[styles.glanceCard, { width: glanceCardWidth, backgroundColor: colors.card, borderColor: colors.border }, shadow(1, isDark)]}
              onPress={() => onNavigate?.("rooms")}
            >
              <View style={styles.glanceHeader}>
                <View style={[styles.glanceIconCircle, { backgroundColor: "#DCFCE7" }]}>
                  <Ionicons name="checkmark-done-circle-outline" size={14} color="#16A34A" />
                </View>
                <Text style={[styles.glanceLabel, { color: colors.secondary }]} numberOfLines={1}>Available Rooms</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.secondary} style={{ marginLeft: "auto" }} />
              </View>
              <Text style={[styles.glanceValue, { color: colors.text }]}>
                {dashboard.availableRooms ?? Math.max(0, dashboard.totalRooms - dashboard.occupiedRooms)}
              </Text>
              <View style={styles.glanceSubRow}>
                <View style={[styles.glanceDot, { backgroundColor: "#16A34A" }]} />
                <Text style={[styles.glanceSubText, { color: colors.secondary }]}>
                  Ready for check-in
                </Text>
              </View>
            </Pressable>

            {/* Card 4: Pending Repairs */}
            <Pressable
              style={[styles.glanceCard, { width: glanceCardWidth, backgroundColor: colors.card, borderColor: colors.border }, shadow(1, isDark)]}
              onPress={() => onNavigate?.("repairs")}
            >
              <View style={styles.glanceHeader}>
                <View style={[styles.glanceIconCircle, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="build-outline" size={14} color="#D97706" />
                </View>
                <Text style={[styles.glanceLabel, { color: colors.secondary }]} numberOfLines={1}>Pending Repairs</Text>
              </View>
              <Text style={[styles.glanceValue, { color: colors.text }]}>{openRepairs}</Text>
              <View style={styles.glanceSubRow}>
                <Ionicons name="flash-outline" size={11} color="#EF4444" />
                <Text style={[styles.glanceSubText, { color: "#EF4444", fontWeight: "700" }]}>
                  {dashboard.submittedRepairs || 0} urgent
                </Text>
              </View>
            </Pressable>
          </View>
        </Reveal>

        {/* ── Full Rooms ── */}
        <SectionTitle title="Full Rooms overview" />
        <ChartCard
          icon="speedometer-outline"
          title="Real-time Room Fill Gauge"
          subtitle="Current resident occupancy rate"
          right={
            <View style={[styles.rateBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.rateValue, { color: colors.primary }]}>{occupancyRate}%</Text>
            </View>
          }
        >
          <OccupancyGauge
            percentage={occupancyRate}
            occupiedBeds={dashboard.occupiedRooms}
            totalBeds={dashboard.totalRooms}
          />
          <View style={{ height: 10 }} />
          <DonutChart data={roomChart} centerText={`${occupancyRate}%`} centerSub="occupied" />
        </ChartCard>

        {/* ── Revenue ── */}
        <SectionTitle title="Revenue trends & Growth" />
        <ChartCard
          icon="trending-up-outline"
          title="Collection vs To Collect"
          subtitle="Past 6 months"
          right={
            <Pressable
              style={[styles.exportBtn, { backgroundColor: colors.primaryLight }]}
              onPress={handleExportFinancialReport}
              hitSlop={6}
            >
              <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              <Text style={[styles.exportBtnText, { color: colors.primary }]}>Export PDF</Text>
            </Pressable>
          }
        >
          <RevenueTrendChart data={revenueTrendData} />
          <MonthOverMonthCard thisMonthAmount={thisMonthCollected} lastMonthAmount={lastMonthCollected} />
        </ChartCard>

        {/* ── Fees ── */}
        <SectionTitle title="Fee status" />
        <ChartCard icon="card-outline" title="Current fee collection" subtitle="Paid, pending, partial and overdue">
          <DonutChart
            data={feeChart}
            centerText={String(dashboard.paidFees + dashboard.pendingFees + dashboard.partiallyPaidFees + dashboard.overdueFees)}
            centerSub="fees"
          />
          <View style={[styles.outstandingBox, { backgroundColor: colors.dangerLight }]}>
            <View>
              <Text style={[styles.outstandingLabel, { color: colors.danger }]}>To Collect amount</Text>
              <Text style={[styles.outstandingAmount, { color: colors.danger }]}>{money(dashboard.outstandingFees)}</Text>
            </View>
            <Ionicons name="alert-circle" size={26} color={colors.danger} style={{ opacity: 0.55 }} />
          </View>
        </ChartCard>

        {/* ── Repairs ── */}
        <SectionTitle title="Repair requests" />
        <ChartCard icon="build-outline" title="Repair status" subtitle="Current request workflow">
          <DonutChart data={repairChart} centerText={String(dashboard.totalRepairRequests)} centerSub="requests" />
        </ChartCard>

        {/* ── Proofs ── */}
        <SectionTitle title="Payment proof review" />
        <ChartCard
          icon="shield-checkmark-outline"
          title="Proof status"
          subtitle="Payments are made outside Hostella; this dashboard reviews submitted proof."
        >
          <DonutChart
            data={[
              { label: "Submitted", value: paymentProofStats.submitted, color: colors.warning },
              { label: "Approved", value: paymentProofStats.approved, color: colors.success },
              { label: "Rejected", value: paymentProofStats.rejected, color: colors.danger },
            ]}
            centerText={String(payments.length)}
            centerSub="proofs"
          />
        </ChartCard>

        {/* ── Approved activity ── */}
        <SectionTitle title="Approved payment activity" />
        <ChartCard icon="bar-chart-outline" title="Approved payments by month" subtitle="Only approved payment proofs are included.">
          {monthlyPaymentBars.some((item) => item.value > 0) ? (
            <BarChart
              data={monthlyPaymentBars.map((item) => ({
                label: item.label,
                value: Math.round(item.value),
                color: colors.primary,
              }))}
            />
          ) : (
            <EmptyState
              icon="bar-chart-outline"
              title="No approved payment activity"
              description="Approved payment proofs will appear here."
            />
          )}
        </ChartCard>

        <View style={[styles.liveUpdateCard, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="sync-outline" size={18} color={colors.primary} />
          <Text style={[styles.liveUpdateText, { color: isDark ? colors.text : colors.primaryDark }]}>
            Dashboard auto-refreshes every 4 seconds and also refreshes immediately after changes.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingBottom: 36 },

  // Hero Section
  heroContainer: { width: "100%", overflow: "hidden" },
  heroBannerGradient: {
    paddingTop: Platform.OS === "ios" ? 18 : 14,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  ambientOrb: { position: "absolute", borderRadius: 999 },
  headerTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandLogoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  brandTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  brandSubtitle: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "500", marginTop: 1 },

  // Active Property Card
  activePropertyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.11)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  activePropertyLeft: { flex: 1, marginRight: 12 },
  activePropertyBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981" },
  activeBadgeText: { color: "#10B981", fontSize: 11, fontWeight: "700" },
  activePropertyName: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", letterSpacing: -0.4, marginBottom: 3 },
  activePropertyLocRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  activePropertyLocText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "500" },
  activePropertyActionBox: { flexDirection: "row", alignItems: "center", gap: 8 },
  propertyIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  // Floating KPI Row
  floatingKpiRow: {
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 16,
    marginTop: -26,
    zIndex: 10,
  },
  floatingCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    minHeight: 92,
    justifyContent: "space-between",
  },
  floatingCardLabel: { fontSize: 10.5, fontWeight: "600", marginBottom: 2 },
  floatingCardValue: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },
  miniProgressBarTrack: {
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: "#E2E8F0",
    marginTop: 6,
    overflow: "hidden",
  },
  miniProgressBarFill: { height: 4.5, borderRadius: 2.5 },
  statusTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  statusTagText: { fontSize: 9.5, fontWeight: "700" },

  // Main Body
  mainBodyContent: { paddingHorizontal: 16, marginTop: 14 },

  // At a Glance
  atAGlanceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 },
  glanceCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    minHeight: 90,
    justifyContent: "space-between",
  },
  glanceHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  glanceIconCircle: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  glanceLabel: { fontSize: 11, fontWeight: "600", flex: 1 },
  glanceValue: { fontSize: 19, fontWeight: "800", letterSpacing: -0.4, marginVertical: 3 },
  glanceSubRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  glanceDot: { width: 6, height: 6, borderRadius: 3 },
  glanceSubText: { fontSize: 11, fontWeight: "500" },

  // Quick Actions & Insights
  insightRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  insightChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
  },
  insightText: { fontSize: 12.5, fontWeight: "800" },
  quickCard: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: RADIUS.xl, paddingVertical: 14, paddingHorizontal: 6, marginBottom: 12 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap" },
  quickCell: { width: "25%", marginVertical: 7, paddingHorizontal: 2 },
  quickIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  quickLabel: { fontSize: 11.5, fontWeight: "700", textAlign: "center" },
  quickBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  quickBadgeText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: "900" },

  // Charts
  chartCard: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: RADIUS.xl, padding: 16, marginBottom: 14 },
  chartHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  chartIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  chartTitle: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  chartSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  rateBadge: { borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 12 },
  rateValue: { fontSize: 14, fontWeight: "800" },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  exportBtnText: { fontSize: 12, fontWeight: "800" },

  outstandingBox: {
    borderRadius: RADIUS.md,
    padding: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  outstandingLabel: { fontSize: 11.5, fontWeight: "700" },
  outstandingAmount: { marginTop: 3, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },

  liveUpdateCard: {
    borderRadius: RADIUS.lg,
    padding: 14,
    marginTop: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  liveUpdateText: { flex: 1, marginLeft: 10, fontSize: 12, lineHeight: 18, fontWeight: "500" },
});