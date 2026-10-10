import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  FlatList,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../constants/theme";
import { Fee, Hostel, Payment, Renter, Room } from "../types";
import { getName, getEmail, money, statusLabel, currentMonth } from "../utils/formatters";
import { Header, EmptyState } from "../components/common";
import { useTheme } from "../contexts/ThemeContext";
import { ExpensesView } from "../components/ExpensesView";
import { API_URL } from "../services/api";
import * as Clipboard from "expo-clipboard";
import { haptic } from "../utils/haptics";
import { SwipeableRow } from "../components/SwipeableRow";
import { HostellaBrand } from "../components/HostellaBrand";

interface PaymentsScreenProps {
  fees: Fee[];
  payments: Payment[];
  renters: Renter[];
  activeRenters?: Renter[];
  rooms?: Room[];
  selectedHostel?: Hostel;
  token?: string | null;

  // Fee actions
  showFeeModal: boolean;
  setShowFeeModal: (show: boolean) => void;
  feeRenterId: string;
  setFeeRenterId: (id: string) => void;
  feeMonth: string;
  setFeeMonth: (month: string) => void;
  feeAmount: string;
  setFeeAmount: (amount: string) => void;
  feeDueDate: string;
  setFeeDueDate: (date: string) => void;
  feeDescription: string;
  setFeeDescription: (desc: string) => void;
  feeSaving: boolean;
  feeRenterPickerOpen: boolean;
  setFeeRenterPickerOpen: (open: boolean) => void;
  onOpenFeeModal: () => void;
  onAddFee: () => void;
  onDeleteFee?: (feeId: string) => void;

  // Auto-generate fees
  showGenerateModal?: boolean;
  setShowGenerateModal?: (v: boolean) => void;
  generateMonth?: string;
  setGenerateMonth?: (m: string) => void;
  generateDueDate?: string;
  setGenerateDueDate?: (d: string) => void;
  generateSaving?: boolean;
  onGenerateMonthlyFees?: () => void;
  onMarkOverdue?: () => void;

  // Payment proof actions
  paymentActionId: string;
  onReviewPayment: (paymentId: string, status: "APPROVED" | "REJECTED", hostelId?: string) => void;
  onDeletePayment?: (paymentId: string, hostelId?: string) => void;

  // Reminder actions
  onRemindFee?: (feeId: string, renterName: string, customMessage?: string) => void;
  onRemindAllUnpaid?: () => void;

  onRefresh: () => void;
  onBack?: () => void;
  initialOption?: "menu" | "fees_all" | "fees_paid" | "fees_unpaid" | "proofs" | "reminders" | "expenses";
}

export function getFullProofUrl(
  proofUrl?: string | null,
  proofUploadId?: string | null,
): string | null {
  if (proofUrl && typeof proofUrl === "string" && proofUrl.trim().length > 0) {
    const trimmed = proofUrl.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      const serverBase = API_URL.replace(/\/api\/v1\/?$/, "");
      return `${serverBase}${trimmed.startsWith("/api/v1") ? trimmed : `/api/v1${trimmed}`}`;
    }
  }
  if (proofUploadId && typeof proofUploadId === "string" && proofUploadId.trim().length > 0) {
    return `${API_URL}/uploads/${proofUploadId.trim()}/file`;
  }
  return null;
}

export function PaymentsScreen(props: PaymentsScreenProps) {
  const {
    fees,
    payments,
    renters,
    activeRenters = [],
    rooms = [],
    selectedHostel,
    showFeeModal,
    setShowFeeModal,
    feeRenterId,
    setFeeRenterId,
    feeMonth,
    setFeeMonth,
    feeAmount,
    setFeeAmount,
    feeDueDate,
    setFeeDueDate,
    feeDescription,
    setFeeDescription,
    feeSaving,
    feeRenterPickerOpen,
    setFeeRenterPickerOpen,
    onOpenFeeModal,
    onAddFee,
    onDeleteFee,
    showGenerateModal = false,
    setShowGenerateModal,
    generateMonth = currentMonth(),
    setGenerateMonth,
    generateDueDate = "",
    setGenerateDueDate,
    generateSaving = false,
    onGenerateMonthlyFees,
    onMarkOverdue,
    paymentActionId,
    onReviewPayment,
    onDeletePayment,
    onRemindFee,
    onRemindAllUnpaid,
    onRefresh,
    onBack,
    token,
    initialOption = "menu",
  } = props;
  const { colors, isDark } = useTheme();

  // Options menu: "menu" | "fees_all" | "fees_paid" | "fees_unpaid" | "proofs" | "reminders" | "expenses"
  const [activeOption, setActiveOption] = useState<"menu" | "fees_all" | "fees_paid" | "fees_unpaid" | "proofs" | "reminders" | "expenses">(initialOption);

  React.useEffect(() => {
    if (initialOption) {
      setActiveOption(initialOption);
    }
  }, [initialOption]);
  const [showMenuSheet, setShowMenuSheet] = useState(false);
  const [infoModalText, setInfoModalText] = useState<{ title: string; desc: string } | null>(null);

  // Sub-filter for Fees: "all" | "paid" | "unpaid"
  const [feeFilter, setFeeFilter] = useState<"all" | "paid" | "unpaid">("all");

  // Sub-filter for Proofs: "all" | "submitted" | "approved" | "rejected"
  const [proofFilter, setProofFilter] = useState<"all" | "submitted" | "approved" | "rejected">("all");

  // Proof image preview modal
  const [proofPreviewUrl, setProofPreviewUrl] = useState("");
  const [proofPreviewReference, setProofPreviewReference] = useState<string | undefined>(undefined);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  // Custom reminder modal state
  const [showCustomRemindModal, setShowCustomRemindModal] = useState(false);
  const [remindTargetFee, setRemindTargetFee] = useState<{ id: string; renterName: string; amount: number; month: string } | null>(null);
  const [customRemindMessage, setCustomRemindMessage] = useState("");

  const currentHostelFees = selectedHostel?.id
    ? fees.filter((f) => !f.hostelId || f.hostelId === selectedHostel.id)
    : fees;

  const currentHostelPayments = selectedHostel?.id
    ? payments.filter((p) => !p.hostelId || p.hostelId === selectedHostel.id)
    : payments;

  // Aggregated KPI calculations
  const totalCollected = currentHostelFees.reduce((sum, f) => sum + Number(f.paidAmount || 0), 0);
  const totalFeeAmount = currentHostelFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
  const totalOutstanding = Math.max(0, totalFeeAmount - totalCollected);
  const pendingProofsCount = currentHostelPayments.filter(
    (p) => String(p.status || "").toUpperCase() === "SUBMITTED" || String(p.status || "").toUpperCase() === "PENDING"
  ).length;

  const paidFees = currentHostelFees.filter((f) => String(f.status || "").toUpperCase() === "PAID");
  const unpaidFees = currentHostelFees.filter((f) => String(f.status || "").toUpperCase() !== "PAID");

  // Filtered fees based on menu selection and sub-filter
  const displayedFees = currentHostelFees.filter((f) => {
    const isPaid = String(f.status || "").toUpperCase() === "PAID";
    const currentFilter = activeOption === "fees_paid" ? "paid" : activeOption === "fees_unpaid" ? "unpaid" : feeFilter;
    if (currentFilter === "paid") return isPaid;
    if (currentFilter === "unpaid") return !isPaid;
    return true;
  });

  // Filtered payment proofs
  const displayedProofs = currentHostelPayments.filter((p) => {
    const st = String(p.status || "APPROVED").toUpperCase();
    if (proofFilter === "submitted") return st === "SUBMITTED" || st === "PENDING";
    if (proofFilter === "approved") return st === "APPROVED";
    if (proofFilter === "rejected") return st === "REJECTED";
    return true;
  });

  function openCustomReminder(fee: Fee, renterName: string) {
    const rem = Math.max(0, Number(fee.amount || 0) - Number(fee.paidAmount || 0));
    setRemindTargetFee({ id: fee.id, renterName, amount: rem, month: fee.month });
    setCustomRemindMessage(
      `Notice from Hostel Admin: Your fee of ₹${rem} for ${fee.month} is pending. Due date: ${fee.dueDate}. Please clear your payment promptly.`
    );
    setShowCustomRemindModal(true);
  }

  function handleSendCustomReminder() {
    if (!remindTargetFee) return;
    onRemindFee?.(remindTargetFee.id, remindTargetFee.renterName, customRemindMessage.trim());
    setShowCustomRemindModal(false);
    setRemindTargetFee(null);
  }

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Deep Royal Navy Hero Banner (Matching Dashboard Theme) ── */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={isDark ? ["#060B1E", "#0B163B", "#132357"] : ["#0A1333", "#122566", "#1E3A8A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.35, y: 1 }}
            style={styles.heroBannerGradient}
          >
            {/* Ambient Lighting Orbs */}
            <View style={[styles.ambientOrb, { top: -30, right: -20, width: 160, height: 160, backgroundColor: "rgba(59, 130, 246, 0.22)" }]} />
            <View style={[styles.ambientOrb, { top: 20, left: -40, width: 130, height: 130, backgroundColor: "rgba(139, 92, 246, 0.2)" }]} />

            {/* Header Top Bar: Hostella Brand + Back Btn + Title + Property Badge + Menu Action */}
            <View style={{ marginBottom: 8 }}>
              <HostellaBrand variant="full" colorScheme="dark" size="small" style={{ alignSelf: "flex-start" }} />
            </View>
            <View style={styles.heroHeaderRow}>
              {(onBack || activeOption !== "menu") ? (
                <TouchableOpacity
                  style={styles.heroBackBtn}
                  onPress={() => {
                    if (activeOption !== "menu") {
                      setActiveOption("menu");
                    } else if (onBack) {
                      onBack();
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={19} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}

              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle} numberOfLines={1}>
                  {activeOption === "menu"
                    ? "Payments & Billing"
                    : activeOption === "fees_all"
                    ? "Fees (All Records)"
                    : activeOption === "fees_paid"
                    ? "Paid People"
                    : activeOption === "fees_unpaid"
                    ? "Unpaid People"
                    : activeOption === "proofs"
                    ? "Receipt Photos"
                    : activeOption === "expenses"
                    ? "Expenses & Financials"
                    : "Remind Option"}
                </Text>
                <View style={styles.heroPropertyBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.heroPropertyText} numberOfLines={1}>
                    {selectedHostel?.name || "Hostella Property"}
                  </Text>
                </View>
              </View>

              {activeOption !== "menu" ? (
                <TouchableOpacity
                  style={styles.heroMenuSwitchBtn}
                  onPress={() => setActiveOption("menu")}
                  activeOpacity={0.8}
                >
                  <Ionicons name="grid-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.heroMenuSwitchText}>Hub</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Quick Stat Chips inside Hero */}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                <Ionicons name="receipt-outline" size={13} color="#FFFFFF" />
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#FFFFFF" }}>{fees.length} Bills</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(16, 185, 129, 0.22)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                <Ionicons name="cash-outline" size={13} color="#34D399" />
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#34D399" }}>{payments.length} Payments</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(245, 158, 11, 0.22)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                <Ionicons name="time-outline" size={13} color="#FBBF24" />
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#FBBF24" }}>{pendingProofsCount} Proofs</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Floating Financial KPI Summary Bar */}
          {activeOption !== "expenses" && (
            <View style={styles.floatingKpiWrap}>
              <View style={[styles.kpiContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.kpiItem}>
                  <Text style={[styles.kpiLabel, { color: colors.secondary }]}>Received</Text>
                  <Text style={[styles.kpiValue, { color: "#10B981" }]}>{money(totalCollected)}</Text>
                </View>
                <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
                <View style={styles.kpiItem}>
                  <Text style={[styles.kpiLabel, { color: colors.secondary }]}>Pending Rent</Text>
                  <Text style={[styles.kpiValue, { color: "#EF4444" }]}>{money(totalOutstanding)}</Text>
                </View>
                <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
                <View style={styles.kpiItem}>
                  <Text style={[styles.kpiLabel, { color: colors.secondary }]}>Receipt Photos</Text>
                  <Text style={[styles.kpiValue, { color: pendingProofsCount > 0 ? "#F59E0B" : colors.secondary }]}>
                    {pendingProofsCount}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.mainPaymentsBody}>

        {/* ── Payments Menu Hub (When in Menu Mode) ── */}
        {activeOption === "menu" ? (
          <View style={styles.menuContainer}>
            <View style={styles.menuHeaderRow}>
              <View>
                <Text style={[styles.menuHeaderTitle, { color: colors.text }]}>CHOOSE AN ACTION</Text>
                <Text style={[styles.menuHeaderSub, { color: colors.secondary }]}>Tap below to view bills, payments, or costs</Text>
              </View>
            </View>

            <View style={styles.menuGridContainer}>
              {/* Option 1: All Bills */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  haptic.cardPress();
                  setFeeFilter("all");
                  setActiveOption("fees_all");
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(59,130,246,0.18)" : COLORS.primaryLight }]}>
                  <Ionicons name="receipt-outline" size={24} color={COLORS.primary} />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>All Bills</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{fees.length} Total</Text>
              </TouchableOpacity>

              {/* Option 2: Paid Rent */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  haptic.cardPress();
                  setFeeFilter("paid");
                  setActiveOption("fees_paid");
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(16,185,129,0.18)" : COLORS.successLight }]}>
                  <Ionicons name="checkmark-circle-outline" size={24} color={COLORS.success} />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Paid Rent</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{paidFees.length} Paid</Text>
              </TouchableOpacity>

              {/* Option 3: Pending Rent */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  haptic.cardPress();
                  setFeeFilter("unpaid");
                  setActiveOption("fees_unpaid");
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(239,68,68,0.18)" : COLORS.dangerLight }]}>
                  <Ionicons name="alert-circle-outline" size={24} color={COLORS.danger} />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Unpaid People</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{unpaidFees.length} Due</Text>
              </TouchableOpacity>

              {/* Option 4: Receipt Photos */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  haptic.cardPress();
                  setActiveOption("proofs");
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(245,158,11,0.18)" : COLORS.warningLight }]}>
                  <Ionicons name="images-outline" size={24} color={COLORS.warning} />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Receipt Photos</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{pendingProofsCount > 0 ? `${pendingProofsCount} New` : "View photos"}</Text>
              </TouchableOpacity>

              {/* Option 5: Reminders */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  haptic.cardPress();
                  setActiveOption("reminders");
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(139,92,246,0.18)" : COLORS.purpleLight }]}>
                  <Ionicons name="notifications-outline" size={24} color={COLORS.purple} />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Reminders</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{unpaidFees.length} To remind</Text>
              </TouchableOpacity>

              {/* Option 6: Expenses & Bills */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  haptic.cardPress();
                  setActiveOption("expenses");
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(245,158,11,0.18)" : "rgba(245, 158, 11, 0.12)" }]}>
                  <Ionicons name="analytics-outline" size={24} color="#F59E0B" />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Expenses</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>Bills & Profit</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Actions Header */}
            <Text style={[styles.menuSectionDividerText, { color: colors.secondary }]}>QUICK SHORTCUTS</Text>

            {/* Action: Auto-Generate */}
            {onGenerateMonthlyFees && (
              <TouchableOpacity
                style={[styles.menuActionCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                onPress={() => {
                  haptic.medium();
                  setShowGenerateModal?.(true);
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuActionIconBox, { backgroundColor: COLORS.primaryLight }]}>
                  <Ionicons name="flash" size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.menuActionTitle, { color: colors.text }]}>Auto-Bill Monthly Rent</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
              </TouchableOpacity>
            )}

            {/* Action: Create Custom Fee */}
            <TouchableOpacity
              style={[styles.menuActionCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => {
                haptic.medium();
                onOpenFeeModal();
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.menuActionIconBox, { backgroundColor: COLORS.successLight }]}>
                <Ionicons name="add" size={18} color={COLORS.success} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuActionTitle, { color: colors.text }]}>Add Single Bill</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
            </TouchableOpacity>
          </View>
        ) : (
          /* ── In-Section Top Navigation Bar (When an option is open) ── */
          <View style={[styles.menuActiveNavRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.menuOptionSelectorBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, flex: 1 }]}
              onPress={() => setShowMenuSheet(true)}
            >
              <Ionicons name="options-outline" size={15} color={colors.text} />
              <Text style={[styles.menuOptionSelectorText, { color: colors.text }]} numberOfLines={1}>
                {activeOption === "fees_all" && "All Fees"}
                {activeOption === "fees_paid" && "Paid People"}
                {activeOption === "fees_unpaid" && "Unpaid People"}
                {activeOption === "proofs" && "Receipts"}
                {activeOption === "reminders" && "Reminders"}
                {activeOption === "expenses" && "Expenses & Financials"}
              </Text>
              <Ionicons name="chevron-down" size={13} color={colors.secondary} />
            </TouchableOpacity>

            {/* Info 'i' button replacing the option description */}
            <TouchableOpacity
              style={[styles.infoIconBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginLeft: 10 }]}
              onPress={() => {
                if (activeOption === "expenses") {
                  setInfoModalText({
                    title: "Expenses & Financials",
                    desc: "Track monthly operational expenses (electricity, water, staff salaries, internet) and download full CSV ledger reports.",
                  });
                } else if (activeOption === "fees_all") {
                  setInfoModalText({
                    title: "Fees (All Records)",
                    desc: "View all resident invoices, dues, and payment logs across all tenants.",
                  });
                } else if (activeOption === "fees_paid") {
                  setInfoModalText({
                    title: "Paid People",
                    desc: "Residents who have cleared their rental fees and have zero outstanding dues.",
                  });
                } else if (activeOption === "fees_unpaid") {
                  setInfoModalText({
                    title: "Unpaid People",
                    desc: "Residents with outstanding balances or overdue rent collections.",
                  });
                } else if (activeOption === "proofs") {
                  setInfoModalText({
                    title: "Payment Receipts (Proofs)",
                    desc: "Review screenshot receipts submitted by residents for UPI or cash payments.",
                  });
                } else if (activeOption === "reminders") {
                  setInfoModalText({
                    title: "Remind Option",
                    desc: "Automatic reminders trigger 5 days before due date, plus manual WhatsApp/App notifications.",
                  });
                }
              }}
              accessibilityLabel="Option Details"
            >
              <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════
           TAB 1: FEES (with Paid People & Unpaid sub-filters)
           ════════════════════════════════════════════════════════════════════ */}
        {(activeOption === "fees_all" || activeOption === "fees_paid" || activeOption === "fees_unpaid") && (
          <View>
            {/* Sub-filter tabs & Action buttons */}
            <View style={styles.filterActionRow}>
              <View style={styles.pillGroup}>
                <TouchableOpacity
                  style={[styles.filterPill, { backgroundColor: colors.card, borderColor: colors.border }, feeFilter === "all" && styles.filterPillActive]}
                  onPress={() => {
                    haptic.selection();
                    setFeeFilter("all");
                  }}
                >
                  <Text style={[styles.filterPillText, { color: colors.secondary }, feeFilter === "all" && styles.filterPillTextActive]}>
                    All ({fees.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterPill, { backgroundColor: colors.card, borderColor: colors.border }, feeFilter === "paid" && styles.filterPillPaidActive]}
                  onPress={() => {
                    haptic.selection();
                    setFeeFilter("paid");
                  }}
                >
                  <Ionicons name="checkmark-circle" size={12} color={feeFilter === "paid" ? "#FFFFFF" : COLORS.success} />
                  <Text style={[styles.filterPillText, { color: colors.secondary }, feeFilter === "paid" && styles.filterPillTextActive]}>
                    Paid ({paidFees.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterPill, { backgroundColor: colors.card, borderColor: colors.border }, feeFilter === "unpaid" && styles.filterPillUnpaidActive]}
                  onPress={() => {
                    haptic.selection();
                    setFeeFilter("unpaid");
                  }}
                >
                  <Ionicons name="alert-circle" size={12} color={feeFilter === "unpaid" ? "#FFFFFF" : COLORS.danger} />
                  <Text style={[styles.filterPillText, { color: colors.secondary }, feeFilter === "unpaid" && styles.filterPillTextActive]}>
                    Unpaid ({unpaidFees.length})
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.headerBtnGroup}>
                {onGenerateMonthlyFees && (
                  <TouchableOpacity
                    style={[styles.generateButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                    onPress={() => {
                      haptic.light();
                      setShowGenerateModal?.(true);
                    }}
                  >
                    <Ionicons name="flash-outline" size={13} color={colors.primary} />
                    <Text style={[styles.generateButtonText, { color: colors.primary }]}>Auto</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.smallPrimaryButton, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    haptic.medium();
                    onOpenFeeModal();
                  }}
                >
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.smallPrimaryText}>Add Fee</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Top of Unpaid Section: Remind All Banner */}
            {(feeFilter === "unpaid" || activeOption === "fees_unpaid") && unpaidFees.length > 0 && (
              <View style={[styles.remindBanner, { backgroundColor: colors.card, borderColor: isDark ? "#78350F" : "#FDE68A", marginTop: 4, marginBottom: 14 }]}>
                <View style={styles.remindBannerLeft}>
                  <View style={styles.bellIconWrap}>
                    <Ionicons name="notifications" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.remindBannerTitle, { color: colors.text }]}>
                      {unpaidFees.length} Resident{unpaidFees.length === 1 ? "" : "s"} With Pending Dues
                    </Text>
                    <Text style={[styles.remindBannerSub, { color: colors.secondary }]}>
                      Total outstanding: ₹{totalOutstanding}. Send rent due reminder alerts to all unpaid residents.
                    </Text>
                  </View>
                </View>

                {onRemindAllUnpaid && (
                  <TouchableOpacity
                    style={styles.remindAllBannerBtn}
                    onPress={() => {
                      haptic.medium();
                      onRemindAllUnpaid();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="paper-plane" size={14} color="#FFFFFF" />
                    <Text style={styles.remindAllBannerBtnText}>Remind All Unpaid ({unpaidFees.length})</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Fee Cards List */}
            {displayedFees.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title={feeFilter === "paid" ? "No Paid Records Found" : feeFilter === "unpaid" ? "No Unpaid Records" : "No Fees Created"}
                description={feeFilter === "paid" ? "Settled payments will appear here." : "All fees are up to date."}
              />
            ) : (
              displayedFees.map((fee) => {
                const renter = renters.find((r) => r.id === fee.renterId);
                const renterTitle = renter ? getName(renter) : (fee as any).renterName || "Former Resident";
                const paid = Number(fee.paidAmount || 0);
                const total = Number(fee.amount || 0);
                const remaining = Math.max(total - paid, 0);
                const status = String(fee.status || "PENDING").toUpperCase();
                const isPaid = status === "PAID";
                const isOverdue = status === "OVERDUE";
                const isPartial = status === "PARTIALLY_PAID";

                const badgeBg = isDark
                  ? isPaid ? "rgba(16,185,129,0.18)" : isOverdue ? "rgba(239,68,68,0.18)" : isPartial ? "rgba(245,158,11,0.18)" : "rgba(59,130,246,0.18)"
                  : isPaid ? COLORS.successLight : isOverdue ? COLORS.dangerLight : isPartial ? COLORS.warningLight : COLORS.primaryLight;
                const badgeFg = isPaid ? COLORS.success : isOverdue ? COLORS.danger : isPartial ? COLORS.warning : COLORS.primary;

                return (
                  <View key={fee.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{renterTitle}</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.secondary }]}>
                          {fee.month} · Due {fee.dueDate || "N/A"}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeFg }]}>
                          {statusLabel(status)}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.metricsGrid, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
                      <View style={styles.metricItem}>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Total Amount</Text>
                        <Text style={[styles.metricValue, { color: colors.text }]}>{money(total)}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Amount Paid</Text>
                        <Text style={[styles.metricValue, { color: COLORS.success }]}>{money(paid)}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Remaining Dues</Text>
                        <Text style={[styles.metricValue, { color: remaining > 0 ? COLORS.danger : colors.secondary }]}>
                          {money(remaining)}
                        </Text>
                      </View>
                    </View>

                    {fee.description ? (
                      <Text style={[styles.descriptionText, { color: colors.secondary }]}>{fee.description}</Text>
                    ) : null}

                    {/* Attached Payment Proof Receipt (if submitted) */}
                    {(() => {
                      const feePayment = payments.find(
                        (p) =>
                          (p.feeId === fee.id ||
                            (p.renterId === fee.renterId && Number(p.amount) === Number(fee.paidAmount)) ||
                            (p.renterId === fee.renterId && Math.abs(Number(p.amount) - Number(fee.amount)) < 1)) &&
                          (p.proofUrl || p.proofUploadId),
                      );
                      const currentProofUrl = getFullProofUrl(
                        feePayment?.proofUrl,
                        feePayment?.proofUploadId,
                      );

                      if (!currentProofUrl) return null;

                      const isApproved = String(feePayment?.status).toUpperCase() === "APPROVED";

                      return (
                        <TouchableOpacity
                          style={[
                            styles.feeProofBanner,
                            {
                              backgroundColor: isDark ? colors.surfaceSecondary : "#f0fdf4",
                              borderColor: isDark ? colors.border : "#bbf7d0",
                            },
                          ]}
                          onPress={() => {
                            setProofPreviewUrl(currentProofUrl);
                            setProofPreviewReference(feePayment?.reference);
                            haptic.light();
                          }}
                          activeOpacity={0.8}
                        >
                          <Image
                            source={{ uri: currentProofUrl }}
                            style={styles.feeProofThumb}
                            resizeMode="cover"
                          />
                          <View style={{ flex: 1, marginLeft: 10, justifyContent: "center" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                              <Ionicons
                                name="image-outline"
                                size={14}
                                color={isApproved ? COLORS.success : COLORS.warning}
                              />
                              <Text
                                style={[
                                  styles.feeProofTitle,
                                  { color: colors.text },
                                ]}
                              >
                                Payment Proof Screenshot
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.feeProofSubtitle,
                                { color: colors.secondary },
                              ]}
                              numberOfLines={1}
                            >
                              {feePayment?.reference
                                ? `Ref: ${feePayment.reference} · `
                                : ""}
                              Tap to inspect receipt photo
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.feeProofBadge,
                              {
                                backgroundColor: isApproved
                                  ? COLORS.successLight
                                  : COLORS.warningLight,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.feeProofBadgeText,
                                {
                                  color: isApproved
                                    ? COLORS.success
                                    : COLORS.warning,
                                },
                              ]}
                            >
                              {isApproved ? "Verified" : "Pending Review"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })()}

                    <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                      <Text style={[styles.footerNote, { color: colors.secondary }]}>
                        {(fee as any).isArchivedRenter ? "Historical Record" : isPaid ? "Settled in full" : `₹${remaining} balance due`}
                      </Text>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        {remaining > 0 ? (
                          <>
                            <TouchableOpacity
                              style={[styles.remindBtn, { backgroundColor: isDark ? "rgba(239,68,68,0.15)" : COLORS.dangerLight, borderColor: isDark ? "rgba(239,68,68,0.3)" : "#FECACA" }]}
                              onPress={() => {
                                haptic.light();
                                if (onRemindFee) {
                                  onRemindFee(fee.id, renterTitle);
                                } else {
                                  openCustomReminder(fee, renterTitle);
                                }
                              }}
                            >
                              <Ionicons name="notifications" size={13} color={COLORS.danger} />
                              <Text style={[styles.remindBtnText, { color: COLORS.danger, fontWeight: "700" }]}>Remind</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.remindBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                              onPress={() => {
                                haptic.light();
                                openCustomReminder(fee, renterTitle);
                              }}
                            >
                              <Ionicons name="create-outline" size={13} color={colors.primary} />
                              <Text style={[styles.remindBtnText, { color: colors.primary }]}>Customize</Text>
                            </TouchableOpacity>

                            {(() => {
                              const renterPhone = renter?.phone || renter?.user?.phone;
                              if (!renterPhone) return null;
                              return (
                                <TouchableOpacity
                                  style={[styles.remindBtn, { backgroundColor: isDark ? "rgba(37,211,102,0.14)" : "#E8F8EE", borderColor: isDark ? "rgba(37,211,102,0.3)" : "#BBF7D0" }]}
                                  onPress={() => {
                                    haptic.light();
                                    const msg = `Hi ${renterTitle}, this is a payment reminder from ${selectedHostel?.name || "Hostel Management"}. Your pending fee of ₹${remaining} for ${fee.month} is due (Due: ${fee.dueDate || "N/A"}). Please clear your dues promptly.`;
                                    const cleanPhone = renterPhone.replace(/\D/g, "");
                                    Linking.openURL(`whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`).catch(() => {
                                      Linking.openURL(`sms:${cleanPhone}?body=${encodeURIComponent(msg)}`);
                                    });
                                  }}
                                >
                                  <Ionicons name="logo-whatsapp" size={13} color="#16A34A" />
                                  <Text style={[styles.remindBtnText, { color: "#16A34A", fontWeight: "700" }]}>WhatsApp</Text>
                                </TouchableOpacity>
                              );
                            })()}
                          </>
                        ) : null}

                        {onDeleteFee ? (
                          <TouchableOpacity
                            style={[styles.deleteBtn, { backgroundColor: colors.dangerLight }]}
                            onPress={() => {
                              haptic.heavy();
                              onDeleteFee(fee.id);
                            }}
                          >
                            <Ionicons name="trash-outline" size={15} color={colors.danger} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════
           TAB 2: PAYMENT RECEIPTS (Payment Proofs)
           ════════════════════════════════════════════════════════════════════ */}
        {activeOption === "proofs" && (
          <View>
            {/* Filter pills */}
            <View style={styles.pillGroupScroll}>
              <TouchableOpacity
                style={[styles.filterPill, { backgroundColor: colors.card, borderColor: colors.border }, proofFilter === "all" && styles.filterPillActive]}
                onPress={() => {
                  haptic.selection();
                  setProofFilter("all");
                }}
              >
                <Text style={[styles.filterPillText, { color: colors.secondary }, proofFilter === "all" && styles.filterPillTextActive]}>
                  All ({payments.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, { backgroundColor: colors.card, borderColor: colors.border }, proofFilter === "submitted" && styles.filterPillActive]}
                onPress={() => {
                  haptic.selection();
                  setProofFilter("submitted");
                }}
              >
                <Text style={[styles.filterPillText, { color: colors.secondary }, proofFilter === "submitted" && styles.filterPillTextActive]}>
                  Needs Review ({pendingProofsCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, { backgroundColor: colors.card, borderColor: colors.border }, proofFilter === "approved" && styles.filterPillPaidActive]}
                onPress={() => {
                  haptic.selection();
                  setProofFilter("approved");
                }}
              >
                <Text style={[styles.filterPillText, { color: colors.secondary }, proofFilter === "approved" && styles.filterPillTextActive]}>
                  Approved
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, { backgroundColor: colors.card, borderColor: colors.border }, proofFilter === "rejected" && styles.filterPillUnpaidActive]}
                onPress={() => {
                  haptic.selection();
                  setProofFilter("rejected");
                }}
              >
                <Text style={[styles.filterPillText, { color: colors.secondary }, proofFilter === "rejected" && styles.filterPillTextActive]}>
                  Rejected
                </Text>
              </TouchableOpacity>
            </View>

            {/* Proof cards */}
            {displayedProofs.length === 0 ? (
              <EmptyState
                icon="image-outline"
                title="No Payment Receipts"
                description="Submitted payment proofs from residents will appear here for verification."
              />
            ) : (
              displayedProofs.map((payment) => {
                const status = String(payment.status || "APPROVED").toUpperCase();
                const displayStatus = status === "PENDING" ? "SUBMITTED" : status;
                const linkedRenter = renters.find((r) => r.id === payment.renterId);
                const residentName = linkedRenter ? getName(linkedRenter) : (payment as any).renterName || "Resident";

                const isApproved = displayStatus === "APPROVED";
                const isRejected = displayStatus === "REJECTED";
                const isSubmitted = displayStatus === "SUBMITTED";

                const statusBg = isDark
                  ? isApproved ? "rgba(16,185,129,0.18)" : isRejected ? "rgba(239,68,68,0.18)" : "rgba(245,158,11,0.18)"
                  : isApproved ? COLORS.successLight : isRejected ? COLORS.dangerLight : COLORS.warningLight;
                const statusFg = isApproved ? COLORS.success : isRejected ? COLORS.danger : COLORS.warning;

                const proofCardContent = (
                  <View key={payment.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.proofIconBox, { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight }]}>
                        <Ionicons name="receipt-outline" size={20} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{money(Number(payment.amount || 0))}</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.secondary }]}>{residentName}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                          <Text style={[styles.statusBadgeText, { color: statusFg }]}>
                            {statusLabel(displayStatus)}
                          </Text>
                        </View>
                        {onDeletePayment ? (
                          <TouchableOpacity
                            style={[styles.deleteBtn, { backgroundColor: colors.dangerLight }]}
                            onPress={() => {
                              haptic.heavy();
                              onDeletePayment(payment.id, payment.hostelId || selectedHostel?.id);
                            }}
                          >
                            <Ionicons name="trash-outline" size={15} color={colors.danger} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>

                    <View style={[styles.proofDetailsRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
                      <View style={styles.proofDetailCol}>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Payment Date</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>{payment.paymentDate || "N/A"}</Text>
                      </View>
                      <View style={styles.proofDetailCol}>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Submitted</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>
                          {payment.submittedAt ? new Date(payment.submittedAt).toLocaleDateString() : "N/A"}
                        </Text>
                      </View>
                      <View style={styles.proofDetailCol}>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Reference</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>{payment.reference || "None"}</Text>
                      </View>
                    </View>

                    {/* Screenshot Preview */}
                    {(() => {
                      const proofImageSource = getFullProofUrl(
                        payment.proofUrl,
                        payment.proofUploadId,
                      );

                      return proofImageSource ? (
                        <TouchableOpacity
                          style={styles.proofImageContainer}
                          onPress={() => {
                            setProofPreviewUrl(proofImageSource);
                            setProofPreviewReference(payment.reference);
                            haptic.light();
                          }}
                          activeOpacity={0.85}
                        >
                          <Image
                            source={{ uri: proofImageSource }}
                            style={styles.proofImage}
                            resizeMode="cover"
                          />
                          <View style={styles.proofOverlay}>
                            <Ionicons name="expand-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.proofOverlayText}>View Proof Screenshot</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.noProofBox, { backgroundColor: colors.surfaceSecondary }]}>
                          <Ionicons name="image-outline" size={18} color={colors.secondary} />
                          <Text style={[styles.noProofText, { color: colors.secondary }]}>No receipt photo attached.</Text>
                        </View>
                      );
                    })()}

                    {payment.reviewNote ? (
                      <View style={[styles.reviewNoteBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
                        <Text style={[styles.reviewNoteLabel, { color: colors.secondary }]}>Admin Note:</Text>
                        <Text style={[styles.reviewNoteText, { color: colors.text }]}>{payment.reviewNote}</Text>
                      </View>
                    ) : null}

                    {/* Action buttons for submitted proofs */}
                    {isSubmitted ? (
                      <View style={styles.reviewActions}>
                        <TouchableOpacity
                          style={[
                            styles.reviewBtn,
                            styles.rejectBtn,
                            {
                              backgroundColor: colors.dangerLight,
                              borderColor: isDark ? "rgba(239,68,68,0.3)" : "#FECACA",
                            },
                          ]}
                          disabled={paymentActionId === payment.id}
                          onPress={() => {
                            haptic.medium();
                            onReviewPayment(payment.id, "REJECTED", payment.hostelId || selectedHostel?.id);
                          }}
                        >
                          {paymentActionId === payment.id ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                          ) : (
                            <>
                              <Ionicons name="close-circle-outline" size={17} color={colors.danger} />
                              <Text style={[styles.rejectBtnText, { color: colors.danger }]}>Reject</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.reviewBtn, styles.approveBtn, { backgroundColor: colors.primary }]}
                          disabled={paymentActionId === payment.id}
                          onPress={async () => {
                            haptic.success();
                            await onReviewPayment(payment.id, "APPROVED", payment.hostelId || selectedHostel?.id);
                            setProofFilter("all");
                          }}
                        >
                          {paymentActionId === payment.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
                              <Text style={styles.approveBtnText}>Approve & Credit Fee</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );

                if (isSubmitted) {
                  return (
                    <SwipeableRow
                      key={payment.id}
                      leftActions={[
                        {
                          label: "Approve",
                          icon: "checkmark-circle-outline",
                          backgroundColor: "#10B981",
                          onPress: async () => {
                            await onReviewPayment(
                              payment.id,
                              "APPROVED",
                              payment.hostelId || selectedHostel?.id
                            );
                            setProofFilter("all");
                          },
                        },
                      ]}
                      rightActions={[
                        {
                          label: "Reject",
                          icon: "close-circle-outline",
                          backgroundColor: "#EF4444",
                          onPress: () =>
                            onReviewPayment(
                              payment.id,
                              "REJECTED",
                              payment.hostelId || selectedHostel?.id
                            ),
                        },
                      ]}
                    >
                      {proofCardContent}
                    </SwipeableRow>
                  );
                }

                return proofCardContent;
              })
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════
           TAB 3: REMINDERS (All people who did not pay & bulk remind)
           ════════════════════════════════════════════════════════════════════ */}
        {activeOption === "reminders" && (
          <View>
            {/* 5-Day Auto-Reminder Status Pill */}
            <View style={[styles.autoReminderInfoCard, { backgroundColor: isDark ? colors.surfaceSecondary : "#EFF6FF", borderColor: isDark ? colors.border : "#BFDBFE" }]}>
              <Ionicons name="time" size={18} color={COLORS.primary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.autoReminderInfoTitle, { color: colors.text }]}>Automated 5-Day Reminders Active</Text>
                <Text style={[styles.autoReminderInfoSub, { color: colors.secondary }]}>
                  Residents automatically receive push alerts starting 5 days before their payment due date.
                </Text>
              </View>
            </View>

            {/* Bulk Reminder Trigger Banner */}
            <View style={[styles.remindBanner, { backgroundColor: colors.card, borderColor: isDark ? "#78350F" : "#FDE68A" }]}>
              <View style={styles.remindBannerLeft}>
                <View style={styles.bellIconWrap}>
                  <Ionicons name="notifications" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.remindBannerTitle, { color: colors.text }]}>
                    {unpaidFees.length} Resident{unpaidFees.length === 1 ? "" : "s"} Have Pending Dues
                  </Text>
                  <Text style={[styles.remindBannerSub, { color: colors.secondary }]}>
                    Total pending: ₹{totalOutstanding}. Send phone notification alerts directly to their devices.
                  </Text>
                </View>
              </View>

              {onRemindAllUnpaid && (
                <TouchableOpacity
                  style={styles.remindAllBannerBtn}
                  onPress={onRemindAllUnpaid}
                >
                  <Ionicons name="paper-plane" size={14} color="#FFFFFF" />
                  <Text style={styles.remindAllBannerBtnText}>Remind All Unpaid ({unpaidFees.length})</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.sectionHeaderLabel, { color: colors.secondary }]}>UNPAID RESIDENTS LIST</Text>

            {unpaidFees.length === 0 ? (
              <EmptyState
                icon="checkmark-done-circle-outline"
                title="All Dues Cleared!"
                description="Every resident has paid their rental fees. No pending reminders required."
              />
            ) : (
              unpaidFees.map((fee) => {
                const renter = renters.find((r) => r.id === fee.renterId);
                const renterName = renter ? getName(renter) : (fee as any).renterName || "Former Resident";
                const renterRoom = rooms.find((rm) => rm.id === renter?.roomId);
                const paid = Number(fee.paidAmount || 0);
                const remaining = Math.max(0, Number(fee.amount || 0) - paid);
                const isOverdue = fee.status === "OVERDUE" || (fee.dueDate && new Date().toISOString().slice(0, 10) > fee.dueDate);

                const statusBg = isDark
                  ? isOverdue ? "rgba(239,68,68,0.18)" : "rgba(245,158,11,0.18)"
                  : isOverdue ? COLORS.dangerLight : COLORS.warningLight;

                return (
                  <View key={`remind-${fee.id}`} style={[styles.remindCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.remindCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>{renterName}</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.secondary }]}>
                          {renterRoom ? `Room ${renterRoom.roomNumber}` : "Room N/A"} · Month: {fee.month}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                        <Text style={[styles.statusBadgeText, { color: isOverdue ? COLORS.danger : COLORS.warning }]}>
                          {isOverdue ? "OVERDUE" : "PENDING"}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.remindDetailsRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
                      <View>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Due Date</Text>
                        <Text style={[styles.detailValue, { color: colors.text }, isOverdue ? { color: COLORS.danger } : {}]}>
                          {fee.dueDate}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.metricLabel, { color: colors.secondary }]}>Pending Amount</Text>
                        <Text style={[styles.kpiValue, { color: COLORS.danger, fontSize: 16 }]}>
                          ₹{remaining}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.remindCardActions}>
                      <TouchableOpacity
                        style={[styles.customMessageBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        onPress={() => openCustomReminder(fee, renterName)}
                      >
                        <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                        <Text style={[styles.customMessageBtnText, { color: colors.text }]}>Customize</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.sendDirectRemindBtn}
                        onPress={() => onRemindFee?.(fee.id, renterName)}
                      >
                        <Ionicons name="notifications" size={14} color="#FFFFFF" />
                        <Text style={styles.sendDirectRemindBtnText}>Send Reminder</Text>
                      </TouchableOpacity>

                      {(() => {
                        const rPhone = renter?.phone || renter?.user?.phone;
                        if (!rPhone) return null;
                        return (
                          <TouchableOpacity
                            style={[
                              styles.customMessageBtn,
                              {
                                backgroundColor: isDark ? "rgba(37,211,102,0.16)" : "#E8F8EE",
                                borderColor: isDark ? "rgba(37,211,102,0.3)" : "#BBF7D0",
                              },
                            ]}
                            onPress={() => {
                              haptic.light();
                              const msg = `Hi ${renterName}, this is a payment reminder from ${selectedHostel?.name || "Hostel"}. Your fee of ₹${remaining} for ${fee.month} is pending. Due date: ${fee.dueDate || "promptly"}. Please clear your payment at your earliest convenience.`;
                              const cleanPhone = rPhone.replace(/\D/g, "");
                              Linking.openURL(`whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`).catch(() => {
                                Linking.openURL(`sms:${cleanPhone}?body=${encodeURIComponent(msg)}`);
                              });
                            }}
                          >
                            <Ionicons name="logo-whatsapp" size={14} color="#16A34A" />
                            <Text style={[styles.customMessageBtnText, { color: "#16A34A", fontWeight: "700" }]}>WhatsApp</Text>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════
           TAB 4: EXPENSES & FINANCIAL TRACKER (P&L, Monthly Bills, CSV Export)
           ════════════════════════════════════════════════════════════════════ */}
        {activeOption === "expenses" && (
          <ExpensesView
            hostelId={selectedHostel?.id}
            hostelName={selectedHostel?.name}
            token={token || null}
            fees={currentHostelFees}
            payments={currentHostelPayments}
            onBack={() => setActiveOption("menu")}
          />
        )}
        </View>
      </ScrollView>

      {/* ─────────────────────────────────────────────────────────────
         MODAL 1: ADD FEE
         ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={showFeeModal}
        transparent
        animationType="slide"
        onRequestClose={() => !feeSaving && setShowFeeModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Add Fee Record</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>Assign rent fee schedule to a resident.</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setShowFeeModal(false)}
                  >
                    <Ionicons name="close" size={22} color={colors.secondary} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.inputLabel, { color: colors.text }]}>Active resident *</Text>
                <TouchableOpacity
                  style={[styles.selector, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  onPress={() => setFeeRenterPickerOpen(!feeRenterPickerOpen)}
                >
                  <Text style={[styles.selectorText, { color: colors.text }, !feeRenterId && { color: colors.secondary }]}>
                    {feeRenterId
                      ? renters.find((r) => r.id === feeRenterId)
                        ? getName(renters.find((r) => r.id === feeRenterId)!)
                        : "Resident"
                      : "Choose resident…"}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.secondary} />
                </TouchableOpacity>

                {feeRenterPickerOpen && (
                  <View style={[styles.pickerDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
                      {activeRenters.map((renter) => (
                        <TouchableOpacity
                          key={renter.id}
                          style={[styles.pickerOption, { borderBottomColor: colors.border }]}
                          onPress={() => {
                            setFeeRenterId(renter.id);
                            if (renter.monthlyFee && !feeAmount) {
                              setFeeAmount(String(renter.monthlyFee));
                            }
                            setFeeRenterPickerOpen(false);
                          }}
                        >
                          <Text style={[styles.pickerOptionTitle, { color: colors.text }]}>{getName(renter)}</Text>
                          <Text style={[styles.pickerOptionSub, { color: colors.secondary }]}>
                            {getEmail(renter)} {renter.monthlyFee ? `• ₹${renter.monthlyFee}/mo` : ""}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={[styles.inputLabel, { color: colors.text }]}>Month (YYYY-MM) *</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                  value={feeMonth}
                  onChangeText={setFeeMonth}
                  placeholder="2026-10"
                  placeholderTextColor={colors.secondary}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>Amount (₹) *</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                  value={feeAmount}
                  onChangeText={setFeeAmount}
                  placeholder="e.g. 6500"
                  keyboardType="numeric"
                  placeholderTextColor={colors.secondary}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>Due date (YYYY-MM-DD) *</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                  value={feeDueDate}
                  onChangeText={setFeeDueDate}
                  placeholder="2026-10-10"
                  placeholderTextColor={colors.secondary}
                />

                <Text style={[styles.inputLabel, { color: colors.text }]}>Description (optional)</Text>
                <TextInput
                  style={[styles.textInput, { height: 70, textAlignVertical: "top", backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                  value={feeDescription}
                  onChangeText={setFeeDescription}
                  placeholder="Notes or deductions…"
                  multiline
                  placeholderTextColor={colors.secondary}
                />

                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[styles.cancelModalBtn, { borderColor: colors.border }]}
                    onPress={() => setShowFeeModal(false)}
                    disabled={feeSaving}
                  >
                    <Text style={[styles.cancelModalBtnText, { color: colors.secondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveModalBtn}
                    onPress={onAddFee}
                    disabled={feeSaving}
                  >
                    {feeSaving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveModalBtnText}>Create Fee</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
         MODAL 2: AUTO-GENERATE MONTHLY FEES
         ───────────────────────────────────────────────────────────── */}
      {setShowGenerateModal && onGenerateMonthlyFees && (
        <Modal
          visible={showGenerateModal}
          transparent
          animationType="slide"
          onRequestClose={() => !generateSaving && setShowGenerateModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Auto-Generate Rent Fees</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>Batch generates fees for all active residents.</Text>
                </View>
                <TouchableOpacity onPress={() => setShowGenerateModal(false)}>
                  <Ionicons name="close" size={22} color={colors.secondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Target Month (YYYY-MM) *</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={generateMonth}
                onChangeText={setGenerateMonth}
                placeholder="2026-10"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Payment Due Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={generateDueDate}
                onChangeText={setGenerateDueDate}
                placeholder="2026-10-10"
                placeholderTextColor={colors.secondary}
              />

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.cancelModalBtn, { borderColor: colors.border }]}
                  onPress={() => setShowGenerateModal(false)}
                  disabled={generateSaving}
                >
                  <Text style={[styles.cancelModalBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveModalBtn}
                  onPress={onGenerateMonthlyFees}
                  disabled={generateSaving}
                >
                  {generateSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveModalBtnText}>Generate Fees</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────
         MODAL 3: FULL SCREEN PROOF PREVIEW
         ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={Boolean(proofPreviewUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setProofPreviewUrl("");
          setProofPreviewReference(undefined);
        }}
      >
        <View style={styles.proofBackdrop}>
          {/* Top Bar */}
          <View style={styles.proofHeaderBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.proofHeaderTitle}>Payment Receipt Inspector</Text>
              <Text style={styles.proofHeaderSubtitle}>Pinch with 2 fingers to zoom & pan details</Text>
            </View>
            <TouchableOpacity
              style={styles.proofCloseBtn}
              onPress={() => {
                haptic.light();
                setProofPreviewUrl("");
                setProofPreviewReference(undefined);
              }}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Pinch-to-zoom container */}
          <ScrollView
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={styles.zoomScrollContent}
            maximumZoomScale={5}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent
          >
            {proofPreviewUrl ? (
              <Image
                source={{ uri: proofPreviewUrl }}
                style={styles.fullProofImage}
                resizeMode="contain"
              />
            ) : null}
          </ScrollView>

          {/* Bottom Bar with 1-Tap Copy UTR */}
          {proofPreviewReference ? (
            <View style={styles.proofBottomBar}>
              <TouchableOpacity
                style={[
                  styles.copyRefBtn,
                  copiedFeedback && { backgroundColor: COLORS.success },
                ]}
                onPress={async () => {
                  await Clipboard.setStringAsync(proofPreviewReference);
                  haptic.success();
                  setCopiedFeedback(true);
                  setTimeout(() => setCopiedFeedback(false), 2500);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={copiedFeedback ? "checkmark-circle" : "copy-outline"}
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.copyRefBtnText}>
                  {copiedFeedback
                    ? "Copied Reference to Clipboard!"
                    : `Copy UTR: ${proofPreviewReference}`}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
         MODAL 4: CUSTOM REMINDER MESSAGE
         ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={showCustomRemindModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomRemindModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Send Fee Reminder</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>To: {remindTargetFee?.renterName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCustomRemindModal(false)}>
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Notification Message:</Text>
            <TextInput
              style={[styles.textInput, { height: 90, textAlignVertical: "top", backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
              value={customRemindMessage}
              onChangeText={setCustomRemindMessage}
              multiline
              placeholderTextColor={colors.secondary}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.cancelModalBtn, { borderColor: colors.border }]}
                onPress={() => setShowCustomRemindModal(false)}
              >
                <Text style={[styles.cancelModalBtnText, { color: colors.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveModalBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleSendCustomReminder}
              >
                <Ionicons name="paper-plane" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.saveModalBtnText}>Send Notification</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Slide-up Options Menu Modal ── */}
      <Modal
        visible={showMenuSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuSheet(false)}
      >
        <TouchableOpacity
          style={styles.menuSheetOverlay}
          activeOpacity={1}
          onPress={() => setShowMenuSheet(false)}
        >
          <View
            style={[
              styles.menuSheetContent,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.menuSheetHeader}>
              <View>
                <Text style={[styles.menuSheetTitle, { color: colors.text }]}>Payment Options</Text>
                <Text style={[styles.menuSheetSubtitle, { color: colors.secondary }]}>Switch payment module or action</Text>
              </View>
              <TouchableOpacity
                style={[styles.menuSheetCloseBtn, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => setShowMenuSheet(false)}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.menuSheetItem, activeOption === "fees_all" && { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight }]}
              onPress={() => { setActiveOption("fees_all"); setFeeFilter("all"); setShowMenuSheet(false); }}
            >
              <View style={[styles.menuSheetIconBox, { backgroundColor: isDark ? "rgba(59,130,246,0.18)" : COLORS.primaryLight }]}>
                <Ionicons name="receipt-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuSheetItemTitle, { color: colors.text }]}>Fees (All Records)</Text>
                <Text style={[styles.menuSheetItemSub, { color: colors.secondary }]}>{fees.length} Total records</Text>
              </View>
              {activeOption === "fees_all" && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuSheetItem, activeOption === "fees_paid" && { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight }]}
              onPress={() => { setActiveOption("fees_paid"); setFeeFilter("paid"); setShowMenuSheet(false); }}
            >
              <View style={[styles.menuSheetIconBox, { backgroundColor: isDark ? "rgba(16,185,129,0.18)" : COLORS.successLight }]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuSheetItemTitle, { color: colors.text }]}>Paid People</Text>
                <Text style={[styles.menuSheetItemSub, { color: colors.secondary }]}>{paidFees.length} Paid in full</Text>
              </View>
              {activeOption === "fees_paid" && <Ionicons name="checkmark" size={18} color={COLORS.success} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuSheetItem, activeOption === "fees_unpaid" && { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight }]}
              onPress={() => { setActiveOption("fees_unpaid"); setFeeFilter("unpaid"); setShowMenuSheet(false); }}
            >
              <View style={[styles.menuSheetIconBox, { backgroundColor: isDark ? "rgba(239,68,68,0.18)" : COLORS.dangerLight }]}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuSheetItemTitle, { color: colors.text }]}>Unpaid People</Text>
                <Text style={[styles.menuSheetItemSub, { color: colors.secondary }]}>{unpaidFees.length} Pending dues</Text>
              </View>
              {activeOption === "fees_unpaid" && <Ionicons name="checkmark" size={18} color={COLORS.danger} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuSheetItem, activeOption === "proofs" && { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight }]}
              onPress={() => { setActiveOption("proofs"); setShowMenuSheet(false); }}
            >
              <View style={[styles.menuSheetIconBox, { backgroundColor: isDark ? "rgba(245,158,11,0.18)" : COLORS.warningLight }]}>
                <Ionicons name="images-outline" size={18} color={COLORS.warning} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuSheetItemTitle, { color: colors.text }]}>Payment Receipts (Proofs)</Text>
                <Text style={[styles.menuSheetItemSub, { color: colors.secondary }]}>{pendingProofsCount} Pending review</Text>
              </View>
              {activeOption === "proofs" && <Ionicons name="checkmark" size={18} color={COLORS.warning} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuSheetItem, activeOption === "reminders" && { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight }]}
              onPress={() => { setActiveOption("reminders"); setShowMenuSheet(false); }}
            >
              <View style={[styles.menuSheetIconBox, { backgroundColor: isDark ? "rgba(139,92,246,0.18)" : COLORS.purpleLight }]}>
                <Ionicons name="notifications-outline" size={18} color={COLORS.purple} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuSheetItemTitle, { color: colors.text }]}>Remind Option</Text>
                <Text style={[styles.menuSheetItemSub, { color: colors.secondary }]}>Auto-starts 5 days before due date</Text>
              </View>
              {activeOption === "reminders" && <Ionicons name="checkmark" size={18} color={COLORS.purple} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuSheetItem, activeOption === "expenses" && { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight }]}
              onPress={() => { setActiveOption("expenses"); setShowMenuSheet(false); }}
            >
              <View style={[styles.menuSheetIconBox, { backgroundColor: isDark ? "rgba(245,158,11,0.18)" : "rgba(245, 158, 11, 0.12)" }]}>
                <Ionicons name="pie-chart-outline" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuSheetItemTitle, { color: colors.text }]}>Expenses & Financial Tracker</Text>
                <Text style={[styles.menuSheetItemSub, { color: colors.secondary }]}>P&L Ledger & 1-Click CSV Export</Text>
              </View>
              {activeOption === "expenses" && <Ionicons name="checkmark" size={18} color="#F59E0B" />}
            </TouchableOpacity>

            <View style={[styles.menuSheetDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.menuSheetItem}
              onPress={() => { setShowMenuSheet(false); setActiveOption("menu"); }}
            >
              <View style={[styles.menuSheetIconBox, { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.grayFill }]}>
                <Ionicons name="grid-outline" size={18} color={colors.text} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuSheetItemTitle, { color: colors.text }]}>Payments Menu Dashboard</Text>
                <Text style={[styles.menuSheetItemSub, { color: colors.secondary }]}>View full menu with options and metrics</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Option Info Modal ('i' icon) ── */}
      <Modal visible={!!infoModalText} transparent animationType="fade">
        <TouchableOpacity
          style={styles.infoModalBackdrop}
          activeOpacity={1}
          onPress={() => setInfoModalText(null)}
        >
          <View style={[styles.infoModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="information-circle" size={22} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text, flex: 1 }}>
                {infoModalText?.title}
              </Text>
              <TouchableOpacity onPress={() => setInfoModalText(null)}>
                <Ionicons name="close" size={20} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, color: colors.secondary, lineHeight: 21 }}>
              {infoModalText?.desc}
            </Text>
            <TouchableOpacity
              style={[styles.smallPrimaryButton, { marginTop: 16, alignSelf: "flex-end" }]}
              onPress={() => setInfoModalText(null)}
            >
              <Text style={styles.smallPrimaryText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingBottom: 110 },

  // Hero Section
  heroContainer: { width: "100%", overflow: "hidden" },
  heroBannerGradient: {
    paddingTop: Platform.OS === "ios" ? 18 : 14,
    paddingBottom: 40,
    paddingHorizontal: 16,
    minHeight: 180,
  },
  ambientOrb: { position: "absolute", borderRadius: 999 },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heroBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 },
  heroPropertyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  heroPropertyText: { fontSize: 11.5, fontWeight: "600", color: "#FFFFFF" },
  heroMenuSwitchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  heroMenuSwitchText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  floatingKpiWrap: { paddingHorizontal: 16, marginTop: -26, zIndex: 10 },
  mainPaymentsBody: { paddingHorizontal: 16, marginTop: 10 },

  topNavRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: COLORS.card,
  },

  // KPI Bar
  kpiContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  kpiItem: { flex: 1, alignItems: "center" },
  kpiLabel: { fontSize: 11, fontWeight: "600", color: COLORS.secondary, textTransform: "uppercase" },
  kpiValue: { fontSize: 16, fontWeight: "800", marginTop: 3 },
  kpiDivider: { width: 1, height: 28, backgroundColor: COLORS.border },

  // Segmented Tabs
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.grayFill,
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 2,
  },
  segmentText: { fontSize: 12, fontWeight: "700", color: COLORS.secondary },
  segmentTextActive: { color: "#FFFFFF" },
  segmentBadge: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  segmentBadgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  segmentBadgeText: { fontSize: 10, fontWeight: "700", color: COLORS.secondary },
  segmentBadgeTextActive: { color: "#FFFFFF" },

  // Info Bar
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
    gap: 8,
  },
  infoBarText: { flex: 1, fontSize: 12, color: COLORS.primaryDark || "#1E40AF", fontWeight: "500", lineHeight: 17 },

  // Filter & Action row
  filterActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 6,
  },
  pillGroup: { flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 },
  pillGroupScroll: { flexDirection: "row", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterPillPaidActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  filterPillUnpaidActive: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  filterPillText: { fontSize: 11, fontWeight: "700", color: COLORS.secondary },
  filterPillTextActive: { color: "#FFFFFF" },

  headerBtnGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 4,
  },
  generateButtonText: { fontSize: 11, fontWeight: "700", color: COLORS.primary },
  smallPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
    gap: 4,
  },
  smallPrimaryText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },

  // Card Styles
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  cardSubtitle: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },

  feeProofBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 4,
  },
  feeProofThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.muted,
  },
  feeProofTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  feeProofSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  feeProofBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "center",
  },
  feeProofBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },

  metricsGrid: {
    flexDirection: "row",
    backgroundColor: COLORS.grayFill,
    borderRadius: 11,
    padding: 10,
    marginBottom: 10,
  },
  metricItem: { flex: 1, alignItems: "center" },
  metricLabel: { fontSize: 10, color: COLORS.secondary, fontWeight: "600" },
  metricValue: { fontSize: 13, fontWeight: "800", color: COLORS.text, marginTop: 2 },

  descriptionText: { fontSize: 12, color: COLORS.text, marginBottom: 10, fontStyle: "italic" },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    marginTop: 2,
  },
  footerNote: { fontSize: 11, color: COLORS.secondary, flex: 1, marginRight: 8 },
  remindBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  remindBtnText: { fontSize: 11, fontWeight: "700", color: COLORS.primary },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Proof specific
  proofIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  proofDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: COLORS.grayFill,
    borderRadius: 11,
    padding: 10,
    marginBottom: 10,
  },
  proofDetailCol: { flex: 1 },
  detailValue: { fontSize: 12, fontWeight: "700", color: COLORS.text, marginTop: 2 },
  proofImageContainer: {
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.muted,
    marginBottom: 10,
    position: "relative",
  },
  proofImage: { width: "100%", height: "100%" },
  proofOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 8,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  proofOverlayText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  noProofBox: {
    borderRadius: 11,
    backgroundColor: COLORS.muted,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  noProofText: { color: COLORS.secondary, fontSize: 12 },
  reviewNoteBox: {
    backgroundColor: COLORS.grayFill,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  reviewNoteLabel: { fontSize: 10, fontWeight: "800", color: COLORS.secondary, textTransform: "uppercase" },
  reviewNoteText: { fontSize: 12, color: COLORS.text, marginTop: 2 },
  reviewActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  reviewBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  rejectBtn: { backgroundColor: COLORS.dangerLight, borderWidth: 1, borderColor: "#FECACA" },
  rejectBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.danger },
  approveBtn: { backgroundColor: COLORS.success },
  approveBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },

  // Reminders Tab
  remindBanner: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 14,
    marginBottom: 14,
  },
  remindBannerLeft: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  bellIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
  },
  remindBannerTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  remindBannerSub: { fontSize: 12, color: COLORS.secondary, marginTop: 2, lineHeight: 17 },
  remindAllBannerBtn: {
    backgroundColor: "#D97706",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  remindAllBannerBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  sectionHeaderLabel: { fontSize: 11, fontWeight: "800", color: COLORS.secondary, marginBottom: 8, letterSpacing: 0.5 },

  remindCard: {
    backgroundColor: COLORS.card,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  remindCardTop: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  remindDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.grayFill,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  remindCardActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  customMessageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: COLORS.background,
  },
  customMessageBtnText: { fontSize: 12, fontWeight: "600", color: COLORS.text },
  sendDirectRemindBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9,
  },
  sendDirectRemindBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 18,
  },
  modalKeyboard: { flex: 1, justifyContent: "center" },
  modalCardLarge: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  modalSubtitle: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  closeBtn: { padding: 4 },
  inputLabel: { fontSize: 12, fontWeight: "700", color: COLORS.text, marginBottom: 5, marginTop: 10 },
  selector: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.grayFill,
  },
  selectorText: { fontSize: 14, color: COLORS.text },
  pickerDropdown: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    marginTop: 4,
    overflow: "hidden",
  },
  pickerOption: { padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerOptionTitle: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  pickerOptionSub: { fontSize: 11, color: COLORS.secondary, marginTop: 1 },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  cancelModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelModalBtnText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  saveModalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
  },
  saveModalBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  // Proof Viewer
  proofBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" },
  proofCloseBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 30,
    right: 18,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullProofImage: { width: "100%", height: "80%" },

  // Menu Hub & In-Section Navigation Styles
  menuContainer: { marginTop: 14, marginBottom: 10 },
  menuHeaderRow: { marginBottom: 12 },
  menuHeaderTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.6 },
  menuHeaderSub: { fontSize: 12, marginTop: 2 },
  menuGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  menuGridItem: {
    width: "48%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "flex-start",
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuGridIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  menuGridTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  menuGridSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  menuCardsList: { gap: 10 },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  menuCardTitle: { fontSize: 15, fontWeight: "700" },
  menuCardDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  menuCounterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  menuCounterBadgeText: { fontSize: 11, fontWeight: "700" },
  menuSectionDividerText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 4,
  },
  menuActionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  menuActionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuActionTitle: { fontSize: 14, fontWeight: "700" },
  menuActionDesc: { fontSize: 11, marginTop: 2 },
  menuActiveNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 12,
  },
  menuBackToMenuBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  menuBackToMenuText: { fontSize: 12, fontWeight: "700" },
  menuOptionSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  menuOptionSelectorText: { fontSize: 12, fontWeight: "700" },
  autoReminderInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  autoReminderInfoTitle: { fontSize: 13, fontWeight: "700" },
  autoReminderInfoSub: { fontSize: 11, marginTop: 2, lineHeight: 16 },

  // Menu Sheet Modal
  menuSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  menuSheetContent: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  menuSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  menuSheetTitle: { fontSize: 17, fontWeight: "800" },
  menuSheetSubtitle: { fontSize: 12, marginTop: 2 },
  menuSheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  menuSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginVertical: 2,
  },
  menuSheetIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuSheetItemTitle: { fontSize: 14, fontWeight: "700" },
  menuSheetItemSub: { fontSize: 11, marginTop: 1 },
  menuSheetDivider: { height: 1, marginVertical: 8 },
  infoIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  infoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  infoModalCard: {
    width: "88%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  proofHeaderBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  proofHeaderTitle: {
    fontSize: 17,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  proofHeaderSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 3,
  },
  zoomScrollContent: {
    flexGrow: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  proofBottomBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  copyRefBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  copyRefBtnText: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
});
