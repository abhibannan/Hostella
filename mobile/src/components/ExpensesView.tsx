import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";
import { Expense, ExpenseCategory, Fee, Payment } from "../types";
import { useExpenseActions } from "../hooks/useExpenseActions";
import { money } from "../utils/formatters";
import { EmptyState } from "./common";
import { generateAndShareFinancialPdf } from "../utils/pdfGenerator";

interface ExpensesViewProps {
  hostelId?: string;
  hostelName?: string;
  token: string | null;
  fees?: Fee[];
  payments?: Payment[];
  onBack?: () => void;
}

const CATEGORIES: Array<{
  key: ExpenseCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgLight: string;
  bgDark: string;
}> = [
  {
    key: "ELECTRICITY",
    label: "Electricity",
    icon: "flash-outline",
    color: "#F59E0B",
    bgLight: "rgba(245, 158, 11, 0.12)",
    bgDark: "rgba(245, 158, 11, 0.20)",
  },
  {
    key: "WATER",
    label: "Water Tanker",
    icon: "water-outline",
    color: "#0EA5E9",
    bgLight: "rgba(14, 165, 233, 0.12)",
    bgDark: "rgba(14, 165, 233, 0.20)",
  },
  {
    key: "SALARY",
    label: "Staff Salary",
    icon: "people-outline",
    color: "#8B5CF6",
    bgLight: "rgba(139, 92, 246, 0.12)",
    bgDark: "rgba(139, 92, 246, 0.20)",
  },
  {
    key: "INTERNET",
    label: "Internet & WiFi",
    icon: "wifi-outline",
    color: "#3B82F6",
    bgLight: "rgba(59, 130, 246, 0.12)",
    bgDark: "rgba(59, 130, 246, 0.20)",
  },
  {
    key: "MAINTENANCE",
    label: "Maintenance",
    icon: "construct-outline",
    color: "#EC4899",
    bgLight: "rgba(236, 72, 153, 0.12)",
    bgDark: "rgba(236, 72, 153, 0.20)",
  },
  {
    key: "FOOD",
    label: "Food & Mess",
    icon: "restaurant-outline",
    color: "#10B981",
    bgLight: "rgba(16, 185, 129, 0.12)",
    bgDark: "rgba(16, 185, 129, 0.20)",
  },
  {
    key: "OTHER",
    label: "Other",
    icon: "ellipsis-horizontal-circle-outline",
    color: "#64748B",
    bgLight: "rgba(100, 116, 139, 0.12)",
    bgDark: "rgba(100, 116, 139, 0.20)",
  },
];

export function ExpensesView({
  hostelId,
  hostelName = "Hostella Property",
  token,
  fees = [],
  payments = [],
  onBack,
}: ExpensesViewProps) {
  const { colors, isDark } = useTheme();
  const {
    expenses,
    financialSummary,
    loading,
    selectedMonth,
    setSelectedMonth,
    addExpense,
    deleteExpense,
  } = useExpenseActions({ selectedHostelId: hostelId, token });

  // View mode: "overview" | "log"
  const [viewMode, setViewMode] = useState<"overview" | "log">("overview");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Add Expense Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("ELECTRICITY");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // ── Live calculations from real fee/payment props ────────────────────────────
  const relevantFees = useMemo(() => {
    if (!selectedMonth) return fees;
    return fees.filter(
      (f) =>
        f.month === selectedMonth ||
        String(f.dueDate || "").slice(0, 7) === selectedMonth,
    );
  }, [fees, selectedMonth]);

  const totalPaymentInflow = useMemo(() => {
    const relevantPayments = payments.filter((p) => {
      const pStatus = String(p.status || "").toUpperCase();
      if (pStatus !== "APPROVED" && pStatus !== "COMPLETED") return false;
      if (!selectedMonth) return true;
      const pDate = String(
        p.paymentDate || p.submittedAt || p.createdAt || "",
      ).slice(0, 7);
      return pDate === selectedMonth;
    });
    return relevantPayments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );
  }, [payments, selectedMonth]);

  const totalFeeCollected = useMemo(
    () => relevantFees.reduce((sum, f) => sum + Number(f.paidAmount || 0), 0),
    [relevantFees],
  );

  const totalCollected = useMemo(() => {
    const liveIncome = Math.max(totalFeeCollected, totalPaymentInflow);
    if (liveIncome > 0) return liveIncome;
    if (fees.length > 0 || payments.length > 0) return liveIncome;
    return financialSummary?.collection?.totalPaid ?? 0;
  }, [totalFeeCollected, totalPaymentInflow, fees, payments, financialSummary]);

  const pendingDues = useMemo(() => {
    if (fees && fees.length > 0) {
      return relevantFees.reduce((sum, f) => {
        if (String(f.status || "").toUpperCase() === "CANCELLED") return sum;
        return sum + Math.max(0, Number(f.amount || 0) - Number(f.paidAmount || 0));
      }, 0);
    }
    return financialSummary?.dues?.totalPending ?? 0;
  }, [fees, relevantFees, financialSummary]);

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (selectedCategory !== "ALL" && e.category !== selectedCategory)
          return false;
        return true;
      }),
    [expenses, selectedCategory],
  );

  const totalExpenseAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [expenses],
  );

  // Category totals for breakdown
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    });
    return map;
  }, [expenses]);

  const netProfit = totalCollected - totalExpenseAmount;
  const isSurplus = netProfit >= 0;

  async function handleAddExpense() {
    if (!title.trim()) {
      return Alert.alert(
        "Title required",
        "Please enter a description or vendor name.",
      );
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return Alert.alert(
        "Invalid Amount",
        "Please enter a valid expense amount.",
      );
    }

    setSaving(true);
    const success = await addExpense({
      title: title.trim(),
      amount: parsedAmount,
      category,
      date,
      notes: notes.trim() || undefined,
    });
    setSaving(false);

    if (success) {
      setTitle("");
      setAmount("");
      setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
      setShowAddModal(false);
    }
  }

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      await generateAndShareFinancialPdf({
        hostelName,
        month: selectedMonth || undefined,
        summary: {
          month: selectedMonth || "All Time",
          collection: {
            totalPaid: totalCollected,
            count: relevantFees.length,
          },
          dues: {
            totalPending: pendingDues,
            count: relevantFees.filter(
              (f) => Number(f.amount || 0) > Number(f.paidAmount || 0),
            ).length,
          },
          expenses: {
            totalExpenses: totalExpenseAmount,
            byCategory: categoryTotals,
            count: expenses.length,
          },
          netCashFlow: netProfit,
        },
        expenses: filteredExpenses,
      });
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ── Month pill options ───────────────────────────────────────────────────────
  const lastThreeMonths = useMemo(() => {
    const result: string[] = [];
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return result;
  }, []);

  const catMeta = (key: string) =>
    CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

  // ─────────────────────────────────────────────────────────────────────────────
  // OVERVIEW MODE
  // ─────────────────────────────────────────────────────────────────────────────
  if (viewMode === "overview") {
    return (
      <View style={styles.container}>
        {/* ── Month Filter Pills ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillScroll}
        >
          <TouchableOpacity
            style={[
              styles.pill,
              { backgroundColor: colors.card, borderColor: colors.border },
              !selectedMonth && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setSelectedMonth("")}
          >
            <Text style={[styles.pillText, { color: !selectedMonth ? "#FFFFFF" : colors.secondary }]}>
              All Time
            </Text>
          </TouchableOpacity>

          {lastThreeMonths.map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.pill,
                { backgroundColor: colors.card, borderColor: colors.border },
                selectedMonth === m && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setSelectedMonth(m)}
            >
              <Text style={[styles.pillText, { color: selectedMonth === m ? "#FFFFFF" : colors.secondary }]}>
                {m === currentMonthStr ? `This Month` : m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── KPI Summary Bar (matches PaymentsScreen pattern) ── */}
        <View
          style={[
            styles.kpiContainer,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiLabel, { color: colors.secondary }]}>
              Collected
            </Text>
            <Text style={[styles.kpiValue, { color: colors.success }]}>
              {money(totalCollected)}
            </Text>
          </View>
          <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiLabel, { color: colors.secondary }]}>
              Expenses
            </Text>
            <Text style={[styles.kpiValue, { color: colors.danger }]}>
              {money(totalExpenseAmount)}
            </Text>
          </View>
          <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiLabel, { color: colors.secondary }]}>
              Net Flow
            </Text>
            <Text
              style={[
                styles.kpiValue,
                { color: isSurplus ? colors.success : colors.danger },
              ]}
            >
              {money(netProfit)}
            </Text>
          </View>
        </View>

        {/* ── Section header ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>
            FINANCIAL TRACKER
          </Text>
          <Text style={[styles.sectionHeaderSub, { color: colors.secondary }]}>
            Select a module below
          </Text>
        </View>

        {/* ── Menu Cards (matches PaymentsScreen menu hub exactly) ── */}
        <View style={styles.menuList}>

          {/* Card 1: Expense Log */}
          <TouchableOpacity
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => setViewMode("log")}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.menuIconBox,
                {
                  backgroundColor: isDark
                    ? "rgba(245, 158, 11, 0.20)"
                    : "rgba(245, 158, 11, 0.12)",
                },
              ]}
            >
              <Ionicons name="receipt-outline" size={22} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuCardTitle, { color: colors.text }]}>
                Expense Log
              </Text>
              <Text style={[styles.menuCardDesc, { color: colors.secondary }]}>
                Electricity, water, salaries & maintenance
              </Text>
            </View>
            <View
              style={[
                styles.menuCountBadge,
                {
                  backgroundColor: isDark
                    ? "rgba(245, 158, 11, 0.20)"
                    : "rgba(245, 158, 11, 0.12)",
                },
              ]}
            >
              <Text style={[styles.menuCountText, { color: "#F59E0B" }]}>
                {expenses.length} entries
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </TouchableOpacity>

          {/* Card 2: Pending Dues */}
          <TouchableOpacity
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            activeOpacity={0.75}
            onPress={() => {
              Alert.alert(
                "Pending Dues",
                `Total uncollected rent: ${money(pendingDues)}\n\nManage individual fees in the Fees section of Payments.`,
              );
            }}
          >
            <View
              style={[
                styles.menuIconBox,
                { backgroundColor: isDark ? colors.dangerLight : colors.dangerLight },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuCardTitle, { color: colors.text }]}>
                Pending Dues
              </Text>
              <Text style={[styles.menuCardDesc, { color: colors.secondary }]}>
                Uncollected rent & fee balances
              </Text>
            </View>
            <View
              style={[
                styles.menuCountBadge,
                { backgroundColor: colors.dangerLight },
              ]}
            >
              <Text style={[styles.menuCountText, { color: colors.danger }]}>
                {money(pendingDues)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </TouchableOpacity>

          {/* Card 3: Net Cash Flow */}
          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: isSurplus
                  ? isDark
                    ? "rgba(34, 197, 94, 0.10)"
                    : colors.successLight
                  : isDark
                  ? "rgba(244, 63, 94, 0.10)"
                  : colors.dangerLight,
                borderColor: isSurplus
                  ? isDark
                    ? "rgba(34, 197, 94, 0.30)"
                    : "#BBF7D0"
                  : isDark
                  ? "rgba(244, 63, 94, 0.30)"
                  : "#FECACA",
              },
            ]}
          >
            <View
              style={[
                styles.menuIconBox,
                {
                  backgroundColor: isSurplus
                    ? isDark
                      ? "rgba(34, 197, 94, 0.20)"
                      : "#DCFCE7"
                    : isDark
                    ? "rgba(244, 63, 94, 0.20)"
                    : "#FEE2E2",
                },
              ]}
            >
              <Ionicons
                name={isSurplus ? "trending-up" : "trending-down"}
                size={22}
                color={isSurplus ? colors.success : colors.danger}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuCardTitle, { color: colors.text }]}>
                Net Operating Flow
              </Text>
              <Text style={[styles.menuCardDesc, { color: colors.secondary }]}>
                {isSurplus ? "Surplus — Inflow exceeds expenses" : "Deficit — Expenses exceed inflow"}
              </Text>
            </View>
            <Text
              style={[
                styles.netFlowValue,
                { color: isSurplus ? colors.success : colors.danger },
              ]}
            >
              {money(netProfit)}
            </Text>
          </View>

          {/* Card 4: Download PDF Statement */}
          <TouchableOpacity
            style={[
              styles.menuCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={handleDownloadPdf}
            disabled={generatingPdf}
            activeOpacity={0.75}
          >
            <View
              style={[
                styles.menuIconBox,
                { backgroundColor: isDark ? colors.primaryLight : colors.primaryLight },
              ]}
            >
              {generatingPdf ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuCardTitle, { color: colors.text }]}>
                Download PDF Statement
              </Text>
              <Text style={[styles.menuCardDesc, { color: colors.secondary }]}>
                {generatingPdf
                  ? "Generating report…"
                  : `${selectedMonth || "All Time"} Financial Report`}
              </Text>
            </View>
            <View
              style={[
                styles.menuCountBadge,
                { backgroundColor: colors.primaryLight },
              ]}
            >
              <Text style={[styles.menuCountText, { color: colors.primary }]}>
                PDF
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── Expense Category Breakdown ── */}
        {expenses.length > 0 && (
          <>
            <Text
              style={[
                styles.sectionLabel,
                { color: colors.secondary, marginTop: 20 },
              ]}
            >
              EXPENSE BREAKDOWN BY CATEGORY
            </Text>
            <View
              style={[
                styles.breakdownCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {CATEGORIES.filter((c) => categoryTotals[c.key] > 0).map(
                (cat, i, arr) => {
                  const amt = categoryTotals[cat.key] || 0;
                  const pct = totalExpenseAmount > 0
                    ? Math.round((amt / totalExpenseAmount) * 100)
                    : 0;
                  const bg = isDark ? cat.bgDark : cat.bgLight;
                  return (
                    <View key={cat.key}>
                      <View style={styles.breakdownRow}>
                        <View
                          style={[styles.breakdownDot, { backgroundColor: bg }]}
                        >
                          <Ionicons
                            name={cat.icon}
                            size={14}
                            color={cat.color}
                          />
                        </View>
                        <Text
                          style={[
                            styles.breakdownLabel,
                            { color: colors.text, flex: 1 },
                          ]}
                        >
                          {cat.label}
                        </Text>
                        <Text
                          style={[
                            styles.breakdownPct,
                            { color: colors.secondary },
                          ]}
                        >
                          {pct}%
                        </Text>
                        <Text
                          style={[styles.breakdownAmt, { color: colors.danger }]}
                        >
                          {money(amt)}
                        </Text>
                      </View>
                      {/* Progress bar */}
                      <View
                        style={[
                          styles.barTrack,
                          { backgroundColor: colors.border },
                        ]}
                      >
                        <View
                          style={[
                            styles.barFill,
                            { width: `${pct}%`, backgroundColor: cat.color },
                          ]}
                        />
                      </View>
                      {i < arr.length - 1 && (
                        <View
                          style={[
                            styles.breakdownDivider,
                            { backgroundColor: colors.border },
                          ]}
                        />
                      )}
                    </View>
                  );
                },
              )}
            </View>
          </>
        )}
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOG MODE (list of expenses with filters)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Sub-navigation bar ── */}
      <View
        style={[
          styles.subNavBar,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={styles.subNavBack}
          onPress={() => {
            setSelectedCategory("ALL");
            setViewMode("overview");
          }}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={[styles.subNavBackText, { color: colors.text }]}>
            Back
          </Text>
        </TouchableOpacity>
        <Text style={[styles.subNavTitle, { color: colors.text }]}>
          Expense Log
        </Text>
        <TouchableOpacity
          style={[
            styles.addBtn,
            { backgroundColor: colors.primary },
          ]}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={17} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Log</Text>
        </TouchableOpacity>
      </View>

      {/* ── Category Filter Pills ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillScroll}
      >
        <TouchableOpacity
          style={[
            styles.pill,
            { backgroundColor: colors.card, borderColor: colors.border },
            selectedCategory === "ALL" && {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
            },
          ]}
          onPress={() => setSelectedCategory("ALL")}
        >
          <Text
            style={[
              styles.pillText,
              {
                color:
                  selectedCategory === "ALL" ? "#FFFFFF" : colors.secondary,
              },
            ]}
          >
            All ({expenses.length})
          </Text>
        </TouchableOpacity>

        {CATEGORIES.filter((c) => categoryTotals[c.key] > 0).map((cat) => {
          const isActive = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.pill,
                { backgroundColor: colors.card, borderColor: colors.border },
                isActive && {
                  backgroundColor: cat.color + "22",
                  borderColor: cat.color,
                },
              ]}
              onPress={() =>
                setSelectedCategory(isActive ? "ALL" : cat.key)
              }
            >
              <Ionicons
                name={cat.icon}
                size={12}
                color={isActive ? cat.color : colors.secondary}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: isActive ? cat.color : colors.secondary, marginLeft: 4 },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── KPI bar for this view ── */}
      <View
        style={[
          styles.kpiContainer,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.secondary }]}>
            {selectedCategory === "ALL" ? "Total Expenses" : catMeta(selectedCategory).label}
          </Text>
          <Text style={[styles.kpiValue, { color: colors.danger }]}>
            {money(
              selectedCategory === "ALL"
                ? totalExpenseAmount
                : categoryTotals[selectedCategory] || 0,
            )}
          </Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.secondary }]}>
            Entries
          </Text>
          <Text style={[styles.kpiValue, { color: colors.text }]}>
            {filteredExpenses.length}
          </Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.secondary }]}>
            Net Flow
          </Text>
          <Text
            style={[
              styles.kpiValue,
              { color: isSurplus ? colors.success : colors.danger },
            ]}
          >
            {money(netProfit)}
          </Text>
        </View>
      </View>

      {/* ── Expense Cards List ── */}
      {loading ? (
        <ActivityIndicator
          style={{ marginVertical: 32 }}
          size="large"
          color={colors.primary}
        />
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No Expenses Logged"
          description={
            selectedCategory !== "ALL"
              ? `No ${catMeta(selectedCategory).label} expenses recorded. Tap "Log" above to add one.`
              : "Track electricity bills, water tankers, staff salaries, and more. Tap the Log button above."
          }
        />
      ) : (
        filteredExpenses.map((expense) => {
          const cat = catMeta(expense.category);
          const bg = isDark ? cat.bgDark : cat.bgLight;
          return (
            <View
              key={expense.id}
              style={[
                styles.expenseCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Card header */}
              <View style={styles.expCardHeader}>
                <View style={[styles.expCatBadge, { backgroundColor: bg }]}>
                  <Ionicons name={cat.icon} size={13} color={cat.color} />
                  <Text style={[styles.expCatText, { color: cat.color }]}>
                    {cat.label}
                  </Text>
                </View>
                <Text style={[styles.expDate, { color: colors.secondary }]}>
                  {expense.date}
                </Text>
              </View>

              {/* Card body */}
              <View style={styles.expCardBody}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.expTitle, { color: colors.text }]}>
                    {expense.title}
                  </Text>
                  {expense.notes ? (
                    <Text style={[styles.expNotes, { color: colors.secondary }]}>
                      {expense.notes}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.expAmount, { color: colors.danger }]}>
                  -{money(expense.amount)}
                </Text>
              </View>

              {/* Card footer */}
              <View
                style={[
                  styles.expCardFooter,
                  { borderTopColor: colors.border },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons
                    name="sync-outline"
                    size={11}
                    color={colors.secondary}
                  />
                  <Text style={[styles.expFooterText, { color: colors.secondary }]}>
                    Auto-synced to P&L Ledger
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.deleteBtn,
                    { backgroundColor: colors.dangerLight },
                  ]}
                  onPress={() => deleteExpense(expense.id)}
                >
                  <Ionicons name="trash-outline" size={13} color={colors.danger} />
                  <Text style={[styles.deleteBtnText, { color: colors.danger }]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* ═══════════════════════════════════════════════════════════
         ADD EXPENSE MODAL — Matches PaymentsScreen modal style
         ═══════════════════════════════════════════════════════════ */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setShowAddModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: isDark ? 1 : 0,
                },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Modal header */}
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                      Log Hostel Expense
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>
                      Record operational bills, wages, or supplies.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setShowAddModal(false)}
                  >
                    <Ionicons name="close" size={22} color={colors.secondary} />
                  </TouchableOpacity>
                </View>

                {/* Category Picker */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Category *
                </Text>
                <View style={styles.catGrid}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.key;
                    const bg = isDark ? cat.bgDark : cat.bgLight;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        style={[
                          styles.catChip,
                          {
                            backgroundColor: isSelected
                              ? bg
                              : isDark
                              ? colors.surfaceSecondary
                              : colors.muted,
                            borderColor: isSelected
                              ? cat.color
                              : colors.border,
                          },
                        ]}
                        onPress={() => setCategory(cat.key)}
                      >
                        <Ionicons
                          name={cat.icon}
                          size={14}
                          color={isSelected ? cat.color : colors.secondary}
                        />
                        <Text
                          style={[
                            styles.catChipText,
                            {
                              color: isSelected ? cat.color : colors.secondary,
                              fontWeight: isSelected ? "700" : "500",
                            },
                          ]}
                        >
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Title */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Expense Title / Description *
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. BESCOM Electricity Bill, 5000L Water Tanker"
                  placeholderTextColor={colors.secondary}
                />

                {/* Amount */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Amount (₹) *
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="e.g. 6500"
                  placeholderTextColor={colors.secondary}
                  keyboardType="numeric"
                />

                {/* Date */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Expense Date *
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.secondary}
                />

                {/* Notes */}
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Notes / Vendor (Optional)
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.textArea,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Bill reference ID, meter reading, or vendor notes"
                  placeholderTextColor={colors.secondary}
                  multiline
                />

                {/* Action Row */}
                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.cancelBtn,
                      { borderColor: colors.border },
                    ]}
                    onPress={() => setShowAddModal(false)}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.cancelBtnText,
                        { color: colors.secondary },
                      ]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={handleAddExpense}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save Expense</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },

  // Pills
  pillScroll: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // KPI bar — identical to PaymentsScreen
  kpiContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  kpiItem: {
    flex: 1,
    alignItems: "center",
  },
  kpiDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 6,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: "800",
  },

  // Section header
  sectionHeaderRow: {
    marginBottom: 10,
    marginTop: 2,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sectionHeaderSub: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 2,
  },

  // Menu cards — identical to PaymentsScreen
  menuList: {
    gap: 10,
  },
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
  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  menuCardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  menuCardDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  menuCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  menuCountText: {
    fontSize: 11,
    fontWeight: "700",
  },
  netFlowValue: {
    fontSize: 16,
    fontWeight: "800",
    marginRight: 4,
  },

  // Breakdown card
  breakdownCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  breakdownDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  breakdownPct: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 32,
    textAlign: "right",
  },
  breakdownAmt: {
    fontSize: 13,
    fontWeight: "800",
    minWidth: 72,
    textAlign: "right",
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    marginBottom: 10,
    marginLeft: 38,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  breakdownDivider: {
    height: 1,
    marginBottom: 10,
  },

  // Sub-nav bar (Log mode)
  subNavBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  subNavBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  subNavBackText: {
    fontSize: 13,
    fontWeight: "700",
  },
  subNavTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    gap: 4,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Expense cards — matching RentersScreen/RoomsScreen card style
  expenseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  expCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  expCatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  expCatText: {
    fontSize: 11,
    fontWeight: "700",
  },
  expDate: {
    fontSize: 11,
    fontWeight: "500",
  },
  expCardBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  expTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  expNotes: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },
  expAmount: {
    fontSize: 16,
    fontWeight: "800",
  },
  expCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
  },
  expFooterText: {
    fontSize: 10,
    fontWeight: "500",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Modal — identical structure to PaymentsScreen modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 18,
  },
  modalKeyboard: {
    flex: 1,
    justifyContent: "center",
  },
  modalCard: {
    borderRadius: 22,
    padding: 20,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
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
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 2,
  },
  textArea: {
    height: 72,
    textAlignVertical: "top",
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 11,
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
