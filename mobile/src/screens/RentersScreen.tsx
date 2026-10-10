import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../constants/theme";
import { Hostel, Renter, Room } from "../types";
import { getName, getEmail, money } from "../utils/formatters";
import { Header, EmptyState, SectionTitle } from "../components/common";
import { HostellaBrand } from "../components/HostellaBrand";
import { CalendarPickerModal } from "../components/CalendarPickerModal";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { haptic } from "../utils/haptics";
import { RenterOnboardingQRModal } from "../components/RenterOnboardingQRModal";
import { shareRenterDetails } from "../utils/shareUtils";
import { exportRenterListPDF, exportToCSV } from "../services/exportService";
import { ListSkeleton } from "../components/Skeleton";
import { RefreshControl } from "react-native";

interface RentersScreenProps {
  renters: Renter[];
  activeRenters: Renter[];
  rooms: Room[];
  activeRooms: Room[];
  selectedHostel?: Hostel;
  renterSearch: string;
  setRenterSearch: (text: string) => void;
  // Detail Modal
  showRenterDetailsModal: boolean;
  setShowRenterDetailsModal: (show: boolean) => void;
  selectedRenter: Renter | null;
  renterDetailsLoading: boolean;
  onOpenRenterDetails: (renter: Renter) => void;
  onOpenEditRenter: (renter: Renter) => void;
  onRemoveRenter: (renter: Renter) => void;
  // Add Renter Modal
  showRenterModal: boolean;
  setShowRenterModal: (show: boolean) => void;
  onOpenRenterModal: () => void;
  firstName: string;
  setFirstName: (text: string) => void;
  lastName: string;
  setLastName: (text: string) => void;
  renterEmail: string;
  setRenterEmail: (text: string) => void;
  renterPhone: string;
  setRenterPhone: (text: string) => void;
  guardianName: string;
  setGuardianName: (text: string) => void;
  guardianPhone: string;
  setGuardianPhone: (text: string) => void;
  address: string;
  setAddress: (text: string) => void;
  city: string;
  setCity: (text: string) => void;
  state: string;
  setState: (text: string) => void;
  pincode: string;
  setPincode: (text: string) => void;
  renterPassword: string;
  setRenterPassword: (text: string) => void;
  showRenterPassword: boolean;
  setShowRenterPassword: (show: boolean | ((v: boolean) => boolean)) => void;
  renterRoomId: string;
  setRenterRoomId: (id: string) => void;
  joiningDate: string;
  setJoiningDate: (date: string) => void;
  monthlyFee: string;
  setMonthlyFee: (fee: string) => void;
  securityDeposit: string;
  setSecurityDeposit: (deposit: string) => void;
  renterSaving: boolean;
  onAddRenter: () => void;
  renterRoomPickerOpen: boolean;
  setRenterRoomPickerOpen: (open: boolean) => void;
  // Edit Renter Modal
  showEditRenterModal: boolean;
  setShowEditRenterModal: (show: boolean) => void;
  editingRenterId: string;
  editFirstName: string;
  setEditFirstName: (text: string) => void;
  editLastName: string;
  setEditLastName: (text: string) => void;
  editPhone: string;
  setEditPhone: (text: string) => void;
  editGuardianName: string;
  setEditGuardianName: (text: string) => void;
  editGuardianPhone: string;
  setEditGuardianPhone: (phone: string) => void;
  editAddress: string;
  setEditAddress: (text: string) => void;
  editCity: string;
  setEditCity: (text: string) => void;
  editState: string;
  setEditState: (text: string) => void;
  editPincode: string;
  setEditPincode: (text: string) => void;
  editRenterRoomId: string;
  setEditRenterRoomId: (id: string) => void;
  editJoiningDate: string;
  setEditJoiningDate: (date: string) => void;
  editMonthlyFee: string;
  setEditMonthlyFee: (fee: string) => void;
  editSecurityDeposit: string;
  setEditSecurityDeposit: (deposit: string) => void;
  editRenterStatus: string;
  setEditRenterStatus: (status: string) => void;
  editRenterSaving: boolean;
  onUpdateRenter: () => void;
  editRenterRoomPickerOpen: boolean;
  setEditRenterRoomPickerOpen: (open: boolean) => void;
  onRefresh: () => void;
}

function RenterDetail({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors?: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.detailItem}>
      <Text style={[styles.detailLabel, colors && { color: colors.secondary }]}>{label}</Text>
      <Text style={[styles.detailValue, colors && { color: colors.text }]}>{value || "-"}</Text>
    </View>
  );
}

export function RentersScreen(props: RentersScreenProps) {
  const { colors, isDark } = useTheme();
  const {
    renters,
    activeRenters,
    rooms,
    activeRooms,
    selectedHostel,
    renterSearch,
    setRenterSearch,
    showRenterDetailsModal,
    setShowRenterDetailsModal,
    selectedRenter,
    renterDetailsLoading,
    onOpenRenterDetails,
    onOpenEditRenter,
    onRemoveRenter,
    showRenterModal,
    setShowRenterModal,
    onOpenRenterModal,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    renterEmail,
    setRenterEmail,
    renterPhone,
    setRenterPhone,
    guardianName,
    setGuardianName,
    guardianPhone,
    setGuardianPhone,
    address,
    setAddress,
    city,
    setCity,
    state,
    setState,
    pincode,
    setPincode,
    renterPassword,
    setRenterPassword,
    showRenterPassword,
    setShowRenterPassword,
    renterRoomId,
    setRenterRoomId,
    joiningDate,
    setJoiningDate,
    monthlyFee,
    setMonthlyFee,
    securityDeposit,
    setSecurityDeposit,
    renterSaving,
    onAddRenter,
    renterRoomPickerOpen,
    setRenterRoomPickerOpen,
    showEditRenterModal,
    setShowEditRenterModal,
    editingRenterId,
    editFirstName,
    setEditFirstName,
    editLastName,
    setEditLastName,
    editPhone,
    setEditPhone,
    editGuardianName,
    setEditGuardianName,
    editGuardianPhone,
    setEditGuardianPhone,
    editAddress,
    setEditAddress,
    editCity,
    setEditCity,
    editState,
    setEditState,
    editPincode,
    setEditPincode,
    editRenterRoomId,
    setEditRenterRoomId,
    editJoiningDate,
    setEditJoiningDate,
    editMonthlyFee,
    setEditMonthlyFee,
    editSecurityDeposit,
    setEditSecurityDeposit,
    editRenterStatus,
    setEditRenterStatus,
    editRenterSaving,
    onUpdateRenter,
    editRenterRoomPickerOpen,
    setEditRenterRoomPickerOpen,
    onRefresh,
  } = props;

  const currentHostelRenters = selectedHostel?.id
    ? renters.filter((r) => !r.hostelId || r.hostelId === selectedHostel.id)
    : renters;

  const currentHostelRooms = selectedHostel?.id
    ? rooms.filter((r) => !r.hostelId || r.hostelId === selectedHostel.id)
    : rooms;

  const currentActiveRenters = useMemo(
    () => currentHostelRenters.filter((r) => String(r.status || "ACTIVE").toUpperCase() === "ACTIVE"),
    [currentHostelRenters]
  );

  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [calendarTarget, setCalendarTarget] = useState<"add" | "edit" | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const totalRentersCount = currentHostelRenters.length;
  const activeRentersCount = currentActiveRenters.length;
  const inactiveRentersCount = totalRentersCount - activeRentersCount;

  const handleRefresh = async () => {
    haptic.light();
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCall = useCallback((phone?: string) => {
    haptic.light();
    if (!phone) {
      toast.info("No phone number registered for this resident.", "Contact");
      return;
    }
    const clean = phone.replace(/[^0-9+]/g, "");
    Linking.openURL(`tel:${clean}`).catch(() => {
      toast.error("Unable to launch dialer.", "Call Failed");
    });
  }, [toast]);

  const handleWhatsApp = useCallback((phone?: string, name?: string) => {
    haptic.light();
    if (!phone) {
      toast.info("No phone number registered for this resident.", "Contact");
      return;
    }
    const clean = phone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(`Hi ${name || "Resident"}, messaging you from ${selectedHostel?.name || "Hostella"}.`);
    Linking.openURL(`https://wa.me/${clean}?text=${msg}`).catch(() => {
      toast.error("Could not open WhatsApp.", "WhatsApp Failed");
    });
  }, [selectedHostel, toast]);

  const handleExportRentersPDF = async () => {
    haptic.medium();
    try {
      toast.info("Generating resident directory PDF...", "Exporting");
      await exportRenterListPDF(currentHostelRenters, selectedHostel?.name || "Hostella Property");
      toast.success("Resident directory ready to save or share!", "Exported");
    } catch {
      toast.error("Failed to generate PDF", "Export Error");
    }
  };

  const handleExportRentersCSV = async () => {
    haptic.medium();
    try {
      toast.info("Generating resident directory CSV...", "Exporting");
      const headers = ["Name", "Room", "Phone", "Email", "Monthly Rent", "Security Deposit", "Status", "Joined"];
      const rows = currentHostelRenters.map((r) => [
        getName(r),
        r.room?.roomNumber || rooms.find((rm) => rm.id === r.roomId)?.roomNumber || "Unassigned",
        r.phone || r.user?.phone || "",
        getEmail(r) || "",
        r.monthlyFee || 0,
        r.securityDeposit || 0,
        r.status || "ACTIVE",
        r.joiningDate || "",
      ]);
      await exportToCSV(headers, rows, `Hostella_Residents_${Date.now()}`);
      toast.success("CSV directory export ready!", "Exported");
    } catch {
      toast.error("Failed to export CSV", "Export Error");
    }
  };

  const selectedRoom = currentHostelRooms.find((room) => room.id === renterRoomId);
  const editSelectedRoom = currentHostelRooms.find((room) => room.id === editRenterRoomId);

  const [localSearch, setLocalSearch] = useState(renterSearch);

  React.useEffect(() => {
    setLocalSearch(renterSearch);
  }, [renterSearch]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== renterSearch) {
        setRenterSearch(localSearch);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [localSearch, renterSearch, setRenterSearch]);

  const normalizedSearch = localSearch.trim().toLowerCase();

  const filteredRenters = useMemo(() => {
    let result = currentHostelRenters.filter((renter) => {
      const active = String(renter.status || "ACTIVE").toUpperCase() === "ACTIVE";
      if (statusFilter === "ACTIVE" && !active) return false;
      if (statusFilter === "INACTIVE" && active) return false;

      if (!normalizedSearch) return true;

      const roomNumber =
        renter.room?.roomNumber ||
        currentHostelRooms.find((room) => room.id === renter.roomId)?.roomNumber ||
        "";

      const searchableText = [
        getName(renter),
        getEmail(renter),
        renter.phone,
        renter.user?.phone,
        renter.guardianPhone,
        roomNumber,
        renter.roomId,
        renter.joiningDate,
        renter.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });

    // Sort alphabetically by name
    result.sort((a, b) => {
      const nameA = getName(a).toLowerCase();
      const nameB = getName(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [currentHostelRenters, currentHostelRooms, normalizedSearch, statusFilter]);

  const renderRenterCard = useCallback(({ item: renter }: { item: Renter }) => {
    const active = String(renter.status || "ACTIVE").toUpperCase() === "ACTIVE";
    const roomNumber =
      renter.room?.roomNumber ||
      rooms.find((room) => room.id === renter.roomId)?.roomNumber ||
      "-";
    const primaryPhone = renter.phone || renter.user?.phone;
    const renterEmailStr = getEmail(renter);
    const monthlyAmt = Number(renter.monthlyFee) || 0;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.renterCard,
          {
            backgroundColor: colors.card,
            borderColor: active ? colors.border : (isDark ? "#334155" : "#E2E8F0"),
            opacity: pressed ? 0.96 : 1,
          },
        ]}
        onPress={() => {
          haptic.light();
          onOpenRenterDetails(renter);
        }}
      >
        {/* Top Header: Avatar + Info + Rent/Status */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatar, { backgroundColor: active ? colors.primaryLight : colors.surfaceSecondary }]}>
              <Text style={[styles.avatarText, { color: active ? colors.primary : colors.secondary }]}>
                {getName(renter).charAt(0).toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: active ? colors.success : colors.secondary,
                  borderColor: colors.card,
                },
              ]}
            />
          </View>

          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
              {getName(renter)}
            </Text>

            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.roomBadge,
                  {
                    backgroundColor: isDark ? "rgba(59, 130, 246, 0.12)" : colors.primaryLight,
                    borderColor: isDark ? "rgba(59, 130, 246, 0.25)" : colors.primaryLight,
                  },
                ]}
              >
                <Ionicons name="home-outline" size={11} color={colors.primary} />
                <Text style={[styles.roomBadgeText, { color: colors.primary }]}>
                  {roomNumber !== "-" ? `Room ${roomNumber}` : "Unassigned"}
                </Text>
              </View>

              {renter.joiningDate ? (
                <View style={[styles.dateChip, { backgroundColor: colors.surfaceSecondary }]}>
                  <Ionicons name="calendar-outline" size={10} color={colors.secondary} />
                  <Text style={[styles.dateChipText, { color: colors.secondary }]}>
                    {renter.joiningDate}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Rent & Status */}
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            {monthlyAmt > 0 ? (
              <View style={[styles.rentPill, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5", borderColor: isDark ? "#065F46" : "#A7F3D0" }]}>
                <Text style={[styles.rentPillText, { color: colors.success }]}>
                  {money(monthlyAmt)}/mo
                </Text>
              </View>
            ) : null}

            <View
              style={[
                styles.statusBadge,
                { backgroundColor: active ? (isDark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5") : (isDark ? "rgba(239, 68, 68, 0.15)" : "#FEF2F2") },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: active ? colors.success : colors.danger },
                ]}
              >
                {active ? "ACTIVE" : "INACTIVE"}
              </Text>
            </View>
          </View>
        </View>

        {/* Secondary Contact Info */}
        {(primaryPhone || renterEmailStr) ? (
          <View style={[styles.renterSubRow, { borderTopColor: colors.border }]}>
            {primaryPhone ? (
              <View style={styles.infoMetaItem}>
                <Ionicons name="call-outline" size={12} color={colors.secondary} />
                <Text style={[styles.infoMetaText, { color: colors.secondary }]}>
                  {primaryPhone}
                </Text>
              </View>
            ) : null}
            {renterEmailStr ? (
              <View style={[styles.infoMetaItem, { flex: 1 }]}>
                <Ionicons name="mail-outline" size={12} color={colors.secondary} />
                <Text style={[styles.infoMetaText, { color: colors.secondary }]} numberOfLines={1}>
                  {renterEmailStr}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Action Footer: Call, WhatsApp on Left; Edit, Share on Right */}
        <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
          {/* Quick Contact */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {primaryPhone ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.contactActionPill,
                    {
                      backgroundColor: isDark ? "rgba(16, 185, 129, 0.12)" : "#ECFDF5",
                      borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#A7F3D0",
                    },
                  ]}
                  onPress={() => handleCall(primaryPhone)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="call" size={12} color="#10B981" />
                  <Text style={[styles.contactActionText, { color: "#10B981" }]}>Call</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.contactActionPill,
                    {
                      backgroundColor: isDark ? "rgba(37, 211, 102, 0.12)" : "#E8F8EE",
                      borderColor: isDark ? "rgba(37, 211, 102, 0.3)" : "#BBF7D0",
                    },
                  ]}
                  onPress={() => handleWhatsApp(primaryPhone, getName(renter))}
                  activeOpacity={0.7}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
                  <Text style={[styles.contactActionText, { color: "#16A34A" }]}>WhatsApp</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ fontSize: 11, color: colors.secondary, fontStyle: "italic" }}>
                No phone saved
              </Text>
            )}
          </View>

          {/* Clean Edit & Share Action Buttons */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <TouchableOpacity
              style={[
                styles.actionPillButton,
                {
                  backgroundColor: isDark ? "rgba(59, 130, 246, 0.12)" : "#EFF6FF",
                  borderColor: isDark ? "rgba(59, 130, 246, 0.3)" : "#BFDBFE",
                },
              ]}
              onPress={() => {
                haptic.light();
                onOpenEditRenter(renter);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons name="create-outline" size={13} color={colors.primary} />
              <Text style={[styles.actionPillText, { color: colors.primary }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionPillButton,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                haptic.light();
                void shareRenterDetails(renter, selectedHostel);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons name="share-social-outline" size={13} color={colors.text} />
              <Text style={[styles.actionPillText, { color: colors.text }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    );
  }, [colors, isDark, rooms, onOpenRenterDetails, onOpenEditRenter, selectedHostel, handleCall, handleWhatsApp]);

  const renterKeyExtractor = useCallback((item: Renter) => item.id, []);

  const ListHeader = (
    <View style={{ marginBottom: 10 }}>
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

          {/* Header Top Bar: Hostella Brand + Title + Property Badge + Action CTAs */}
          <View style={{ marginBottom: 8 }}>
            <HostellaBrand variant="full" colorScheme="dark" size="small" style={{ alignSelf: "flex-start" }} />
          </View>
          <View style={styles.heroHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Renters</Text>
              <View style={styles.heroPropertyBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.heroPropertyText} numberOfLines={1}>
                  {selectedHostel?.name || "Hostella Property"}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <TouchableOpacity
                style={styles.heroGlassBtn}
                onPress={handleExportRentersPDF}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={14} color="#FFFFFF" />
                <Text style={styles.heroGlassBtnText}>PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.heroGlassBtn}
                onPress={() => {
                  haptic.light();
                  setShowQRModal(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="qr-code-outline" size={14} color="#FFFFFF" />
                <Text style={styles.heroGlassBtnText}>QR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.heroAddBtn}
                onPress={() => {
                  haptic.medium();
                  onOpenRenterModal();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add" size={15} color="#FFFFFF" />
                <Text style={styles.heroAddBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 2 Clean Translucent Metric Cards */}
          <View style={styles.heroMetricsRow}>
            <View style={[styles.heroMetricCard, { backgroundColor: "rgba(255, 255, 255, 0.12)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={[styles.heroMetricIconWrap, { backgroundColor: "rgba(255, 255, 255, 0.18)" }]}>
                  <Ionicons name="people" size={16} color="#FFFFFF" />
                </View>
                <View style={[styles.miniStatBadge, { backgroundColor: "rgba(255, 255, 255, 0.18)" }]}>
                  <Text style={[styles.miniStatText, { color: "#FFFFFF" }]}>All</Text>
                </View>
              </View>
              <Text style={[styles.heroMetricNumber, { color: "#FFFFFF" }]}>{totalRentersCount}</Text>
              <Text style={[styles.heroMetricLabel, { color: "rgba(255, 255, 255, 0.72)" }]}>Total Renters</Text>
            </View>

            <View style={[styles.heroMetricCard, { backgroundColor: "rgba(16, 185, 129, 0.18)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={[styles.heroMetricIconWrap, { backgroundColor: "rgba(16, 185, 129, 0.28)" }]}>
                  <Ionicons name="shield-checkmark" size={16} color="#34D399" />
                </View>
                <View style={[styles.miniStatBadge, { backgroundColor: "rgba(16, 185, 129, 0.28)" }]}>
                  <Text style={[styles.miniStatText, { color: "#34D399" }]}>
                    {totalRentersCount > 0 ? `${Math.round((activeRentersCount / totalRentersCount) * 100)}%` : "0%"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroMetricNumber, { color: "#34D399" }]}>{activeRentersCount}</Text>
              <Text style={[styles.heroMetricLabel, { color: "rgba(255, 255, 255, 0.72)" }]}>Active Renters</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Floating Search Input Box */}
        <View style={styles.floatingSearchWrap}>
          <View style={[styles.renterSearchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.secondary} />
            <TextInput
              style={[styles.renterSearchInput, { color: colors.text }]}
              value={localSearch}
              onChangeText={setLocalSearch}
              placeholder="Search by name, room, phone, email, guardian..."
              placeholderTextColor={colors.secondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {localSearch.length > 0 ? (
              <TouchableOpacity onPress={() => { setLocalSearch(""); setRenterSearch(""); }} hitSlop={6}>
                <Ionicons name="close-circle" size={18} color={colors.secondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* Filter Tabs & Section Header */}
      <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
        {/* Filter Tabs: All, Active, Inactive */}
        <View style={styles.filterTabsRow}>
          {(["ALL", "ACTIVE", "INACTIVE"] as const).map((filter) => {
            const isSelected = statusFilter === filter;
            const count =
              filter === "ALL"
                ? totalRentersCount
                : filter === "ACTIVE"
                ? activeRentersCount
                : inactiveRentersCount;

            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterTabPill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  haptic.selection();
                  setStatusFilter(filter);
                }}
              >
                <Text
                  style={[
                    styles.filterTabPillText,
                    { color: isSelected ? "#FFFFFF" : colors.secondary, fontWeight: isSelected ? "800" : "600" },
                  ]}
                >
                  {filter === "ALL" ? "All" : filter === "ACTIVE" ? "Active" : "Inactive"}
                </Text>
                <View
                  style={[
                    styles.filterCountBadge,
                    {
                      backgroundColor: isSelected ? "rgba(255, 255, 255, 0.25)" : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountBadgeText,
                      { color: isSelected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <SectionTitle title={`Renters List (${filteredRenters.length})`} />
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredRenters}
        renderItem={renderRenterCard}
        keyExtractor={renterKeyExtractor}
        ListHeaderComponent={ListHeader}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          renters.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No renters found"
              description="Add a renter account and assign a room."
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No matching renters"
              description="Try a different name, phone number, email, guardian number or room number."
            />
          )
        }
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      />

      {/* RENTER DETAILS MODAL */}
      <Modal
        visible={showRenterDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRenterDetailsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Renter Details</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>
                      Complete renter account, room and financial information.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.closeButton, { backgroundColor: colors.grayFill }]}
                    onPress={() => {
                      haptic.light();
                      setShowRenterDetailsModal(false);
                    }}
                  >
                    <Ionicons name="close" size={22} color={colors.secondary} />
                  </TouchableOpacity>
                </View>

                {renterDetailsLoading ? (
                  <View style={styles.renterDetailsLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.itemSubtitle, { color: colors.secondary }]}>Loading latest renter details…</Text>
                  </View>
                ) : null}

                {selectedRenter ? (
                  <>
                    {/* Hero Passport Banner */}
                    <View style={[styles.renterDetailsHero, { borderBottomColor: colors.border }]}>
                      <View style={[styles.avatarLarge, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.avatarLargeText, { color: colors.primary }]}>
                          {getName(selectedRenter).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.renterDetailsName, { color: colors.text }]}>{getName(selectedRenter)}</Text>
                        <Text style={[styles.itemSubtitle, { color: colors.secondary }]}>
                          {getEmail(selectedRenter) || "No email registered"}
                        </Text>
                        {selectedRenter.room?.roomNumber ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                            <Ionicons name="home-outline" size={13} color={colors.primary} />
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                              Room {selectedRenter.room.roomNumber}
                              {selectedRenter.room.floor !== null && selectedRenter.room.floor !== undefined ? ` • Floor ${selectedRenter.room.floor}` : ""}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              String(selectedRenter.status || "ACTIVE").toUpperCase() === "ACTIVE"
                                ? colors.successLight
                                : colors.dangerLight,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color:
                                String(selectedRenter.status || "ACTIVE").toUpperCase() === "ACTIVE"
                                ? colors.success
                                : colors.danger,
                            },
                          ]}
                        >
                          {String(selectedRenter.status || "ACTIVE").toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Quick Contact, Edit & Share Action Bar */}
                    <View style={styles.heroActionsRow}>
                      {(selectedRenter.phone || selectedRenter.user?.phone) ? (
                        <>
                          <TouchableOpacity
                            style={[styles.heroActionButton, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5", borderColor: "#10B981" }]}
                            onPress={() => {
                              haptic.light();
                              handleCall(selectedRenter.phone || selectedRenter.user?.phone);
                            }}
                          >
                            <Ionicons name="call" size={15} color="#10B981" />
                            <Text style={[styles.heroActionText, { color: "#10B981" }]}>Call</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.heroActionButton, { backgroundColor: isDark ? "rgba(37, 211, 102, 0.15)" : "#E8F8EE", borderColor: "#25D366" }]}
                            onPress={() => {
                              haptic.light();
                              handleWhatsApp(selectedRenter.phone || selectedRenter.user?.phone, getName(selectedRenter));
                            }}
                          >
                            <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
                            <Text style={[styles.heroActionText, { color: "#25D366" }]}>WhatsApp</Text>
                          </TouchableOpacity>
                        </>
                      ) : null}

                      <TouchableOpacity
                        style={[styles.heroActionButton, { backgroundColor: isDark ? "rgba(59, 130, 246, 0.15)" : "#EFF6FF", borderColor: colors.primary }]}
                        onPress={() => {
                          haptic.light();
                          setShowRenterDetailsModal(false);
                          onOpenEditRenter(selectedRenter);
                        }}
                      >
                        <Ionicons name="create-outline" size={15} color={colors.primary} />
                        <Text style={[styles.heroActionText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.heroActionButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        onPress={() => {
                          haptic.light();
                          void shareRenterDetails(selectedRenter, selectedHostel);
                        }}
                      >
                        <Ionicons name="share-social-outline" size={15} color={colors.text} />
                        <Text style={[styles.heroActionText, { color: colors.text }]}>Share</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Section 1: Room & Occupancy */}
                    <View style={[styles.detailSectionPanel, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <Ionicons name="home-outline" size={15} color={colors.primary} />
                        <Text style={[styles.renterDetailSectionTitle, { color: colors.primary }]}>Room & Occupancy</Text>
                      </View>
                      <View style={styles.renterDetailsGrid}>
                        <RenterDetail
                          label="Assigned Room"
                          value={
                            selectedRenter.room?.roomNumber
                              ? `Room ${selectedRenter.room.roomNumber}`
                              : "Unassigned"
                          }
                          colors={colors}
                        />
                        <RenterDetail
                          label="Floor"
                          value={
                            selectedRenter.room?.floor !== null && selectedRenter.room?.floor !== undefined
                              ? `Floor ${selectedRenter.room.floor}`
                              : "-"
                          }
                          colors={colors}
                        />
                        <RenterDetail label="Joining Date" value={selectedRenter.joiningDate || "-"} colors={colors} />
                        {(() => {
                          const roommates = selectedRenter?.roomId
                            ? activeRenters.filter(
                                (r) =>
                                  r.id !== selectedRenter.id &&
                                  r.roomId === selectedRenter.roomId,
                              )
                            : [];
                          if (roommates.length === 0) return null;
                          return (
                            <RenterDetail
                              label="Roommates in same room"
                              value={roommates.map((r) => getName(r)).join(", ")}
                              colors={colors}
                            />
                          );
                        })()}
                      </View>
                    </View>

                    {/* Section 2: Financial Terms */}
                    <View style={[styles.detailSectionPanel, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <Ionicons name="cash-outline" size={15} color="#10B981" />
                        <Text style={[styles.renterDetailSectionTitle, { color: "#10B981" }]}>Financial Terms</Text>
                      </View>
                      <View style={styles.renterDetailsGrid}>
                        <RenterDetail label="Monthly Rent" value={money(Number(selectedRenter.monthlyFee || 0))} colors={colors} />
                        <RenterDetail label="Security Deposit" value={money(Number(selectedRenter.securityDeposit || 0))} colors={colors} />
                        <RenterDetail
                          label="Billing Schedule"
                          value={
                            selectedRenter.joiningDate
                              ? `Recurs monthly on Day ${parseInt(selectedRenter.joiningDate.slice(8, 10), 10) || 1}`
                              : "Standard 1st of month"
                          }
                          colors={colors}
                        />
                      </View>
                    </View>

                    {/* Section 3: Contact & Personal Details */}
                    <View style={[styles.detailSectionPanel, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <Ionicons name="person-circle-outline" size={15} color={colors.primary} />
                        <Text style={[styles.renterDetailSectionTitle, { color: colors.primary }]}>Contact & Personal Details</Text>
                      </View>
                      <View style={styles.renterDetailsGrid}>
                        <RenterDetail label="Full Name" value={getName(selectedRenter)} colors={colors} />
                        <RenterDetail label="Primary Phone" value={selectedRenter.phone || selectedRenter.user?.phone || "-"} colors={colors} />
                        <RenterDetail label="Email Address" value={getEmail(selectedRenter) || "-"} colors={colors} />
                        <RenterDetail label="Gender" value={selectedRenter.user?.gender || "-"} colors={colors} />
                        <RenterDetail label="Date of Birth" value={selectedRenter.user?.dateOfBirth || "-"} colors={colors} />
                      </View>
                    </View>

                    {/* Section 4: Guardian & Emergency Contact */}
                    <View style={[styles.detailSectionPanel, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <Ionicons name="shield-outline" size={15} color="#F59E0B" />
                        <Text style={[styles.renterDetailSectionTitle, { color: "#F59E0B" }]}>Guardian & Emergency</Text>
                      </View>
                      <View style={styles.renterDetailsGrid}>
                        <RenterDetail label="Guardian Name" value={selectedRenter.guardianName || "-"} colors={colors} />
                        <RenterDetail label="Guardian Phone" value={selectedRenter.guardianPhone || "-"} colors={colors} />
                        <RenterDetail label="Emergency Contact Person" value={selectedRenter.user?.emergencyContactName || "-"} colors={colors} />
                        <RenterDetail label="Emergency Contact Phone" value={selectedRenter.user?.emergencyContactPhone || "-"} colors={colors} />
                      </View>
                    </View>

                    {/* Section 5: Address */}
                    <View style={[styles.detailSectionPanel, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <Ionicons name="location-outline" size={15} color={colors.secondary} />
                        <Text style={[styles.renterDetailSectionTitle, { color: colors.secondary }]}>Permanent Address</Text>
                      </View>
                      <View style={styles.renterDetailsGrid}>
                        <RenterDetail label="Address" value={selectedRenter.user?.address || "-"} colors={colors} />
                        <RenterDetail label="City" value={selectedRenter.user?.city || "-"} colors={colors} />
                        <RenterDetail label="State" value={selectedRenter.user?.state || "-"} colors={colors} />
                        <RenterDetail label="Pincode" value={selectedRenter.user?.pincode || "-"} colors={colors} />
                      </View>
                    </View>

                    <View style={styles.renterDetailsActions}>
                      <TouchableOpacity
                        style={[styles.editButton, { flex: 1, justifyContent: "center", paddingVertical: 14, backgroundColor: colors.primary }]}
                        onPress={() => {
                          haptic.medium();
                          setShowRenterDetailsModal(false);
                          onOpenEditRenter(selectedRenter);
                        }}
                      >
                        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                        <Text style={[styles.editButtonText, { color: "#FFFFFF" }]}>Edit Resident</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.removeButton, { flex: 1, justifyContent: "center", paddingVertical: 14, backgroundColor: colors.dangerLight, borderColor: colors.danger }]}
                        onPress={() => {
                          haptic.heavy();
                          onRemoveRenter(selectedRenter);
                        }}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        <Text style={[styles.removeButtonText, { color: colors.danger }]}>Delete Resident</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <EmptyState
                    icon="person-outline"
                    title="Renter details unavailable"
                    description="Close this window and try again."
                  />
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ADD RENTER MODAL */}
      <Modal
        visible={showRenterModal}
        transparent
        animationType="slide"
        onRequestClose={() => !renterSaving && setShowRenterModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Add Renter</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>Create login, assign a room and save renter details.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.closeButton, { backgroundColor: colors.grayFill }]}
                    onPress={() => {
                      haptic.light();
                      setShowRenterModal(false);
                    }}
                  >
                    <Ionicons name="close" size={22} color={colors.secondary} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: colors.text }]}>First name *</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.secondary} />

                <Text style={[styles.label, { color: colors.text }]}>Last name</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.secondary} />

                <Text style={[styles.label, { color: colors.text }]}>Email *</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={renterEmail} onChangeText={setRenterEmail} placeholder="renter@example.com" placeholderTextColor={colors.secondary} keyboardType="email-address" autoCapitalize="none" />

                <Text style={[styles.label, { color: colors.text }]}>Phone (optional for first time)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={renterPhone} onChangeText={setRenterPhone} placeholder="Renter phone number (optional)" placeholderTextColor={colors.secondary} keyboardType="phone-pad" />

                <Text style={[styles.label, { color: colors.text }]}>Guardian name (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={guardianName} onChangeText={setGuardianName} placeholder="Guardian full name (optional)" placeholderTextColor={colors.secondary} />

                <Text style={[styles.label, { color: colors.text }]}>Guardian number (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={guardianPhone} onChangeText={setGuardianPhone} placeholder="Guardian phone number (optional)" placeholderTextColor={colors.secondary} keyboardType="phone-pad" />

                <Text style={[styles.label, { color: colors.text }]}>Initial Password (Optional)</Text>
                <View style={[styles.inputWithIcon, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.inputWithIconText, { color: colors.text }]}
                    value={renterPassword}
                    onChangeText={setRenterPassword}
                    placeholder="Leave blank or min 6 characters"
                    placeholderTextColor={colors.secondary}
                    secureTextEntry={!showRenterPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowRenterPassword((v) => !v)}>
                    <Ionicons name={showRenterPassword ? "eye-off-outline" : "eye-outline"} size={21} color={colors.secondary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.passwordHint, { color: colors.secondary }]}>
                  Optional. The resident can log in via Google or set/create their own password anytime.
                </Text>

                <Text style={[styles.label, { color: colors.text }]}>Room *</Text>
                <TouchableOpacity
                  style={[styles.selector, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  onPress={() => {
                    haptic.selection();
                    setRenterRoomPickerOpen(true);
                  }}
                >
                  <Text style={[styles.selectorText, { color: colors.text }, !selectedRoom && { color: colors.secondary }]}>
                    {selectedRoom ? `Room ${selectedRoom.roomNumber}` : "Select active room"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.secondary} />
                </TouchableOpacity>

                <Text style={[styles.label, { color: colors.text }]}>Joining & Recurring Due Date *</Text>
                <TouchableOpacity
                  style={[styles.dateSelector, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  onPress={() => {
                    haptic.selection();
                    setCalendarTarget("add");
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                    <Text style={[styles.dateSelectorText, { color: colors.text }]}>
                      {joiningDate || "Select recurring date"}
                    </Text>
                  </View>
                  <View style={[styles.dateBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.dateBadgeText, { color: colors.primary }]}>
                      {joiningDate ? `Day ${parseInt(joiningDate.slice(8, 10), 10) || 1} monthly` : "Pick Date"}
                    </Text>
                  </View>
                </TouchableOpacity>
                {joiningDate ? (
                  <View style={[styles.recurringHintBox, { backgroundColor: isDark ? "#064E3B" : "#F0FDF4", borderColor: isDark ? "#047857" : "#BBF7D0" }]}>
                    <Ionicons name="notifications-outline" size={15} color={colors.primary} />
                    <Text style={[styles.recurringHintText, { color: isDark ? "#A7F3D0" : "#166534" }]}>
                      Rent will automatically recur on Day {parseInt(joiningDate.slice(8, 10), 10) || 1} of every month with auto-notifications.
                    </Text>
                  </View>
                ) : null}

                <Text style={[styles.label, { color: colors.text }]}>Monthly fee *</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={monthlyFee} onChangeText={setMonthlyFee} placeholder="Example: 8000" placeholderTextColor={colors.secondary} keyboardType="decimal-pad" />

                <Text style={[styles.label, { color: colors.text }]}>Security deposit</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={securityDeposit} onChangeText={setSecurityDeposit} placeholder="Example: 8000" placeholderTextColor={colors.secondary} keyboardType="decimal-pad" />

                <Text style={[styles.label, { color: colors.text, marginTop: 16, fontWeight: "700" }]}>Resident Address (Optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={address} onChangeText={setAddress} placeholder="Street address (optional)" placeholderTextColor={colors.secondary} />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text }]}>City (optional)</Text>
                    <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text }]}>State (optional)</Text>
                    <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={state} onChangeText={setState} placeholder="State" placeholderTextColor={colors.secondary} />
                  </View>
                </View>

                <Text style={[styles.label, { color: colors.text }]}>Pincode (optional)</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={pincode} onChangeText={setPincode} placeholder="Pincode" placeholderTextColor={colors.secondary} keyboardType="numeric" />

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  disabled={renterSaving}
                  onPress={() => {
                    haptic.medium();
                    onAddRenter();
                  }}
                >
                  {renterSaving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Create Renter</Text>
                      <Ionicons name="checkmark" size={19} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* RENTER ROOM PICKER */}
      <Modal visible={renterRoomPickerOpen} transparent animationType="slide" onRequestClose={() => setRenterRoomPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select room</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>Active rooms in this hostel</Text>
              </View>
              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: colors.grayFill }]}
                onPress={() => {
                  haptic.light();
                  setRenterRoomPickerOpen(false);
                }}
              >
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            {activeRooms.length === 0 ? (
              <EmptyState icon="grid-outline" title="No active rooms" description="Add an active room before creating a renter." />
            ) : (
              activeRooms.map((room) => {
                const occupantsCount = activeRenters.filter((r) => r.roomId === room.id).length;
                const max = Number(room.maxOccupants) || 2;
                const isFull = occupantsCount >= max;
                const isSelected = room.id === renterRoomId;
                return (
                  <Pressable
                    key={room.id}
                    disabled={isFull}
                    style={[
                      styles.pickerRow,
                      { borderBottomColor: colors.border },
                      isSelected && [styles.pickerSelected, { backgroundColor: isDark ? "#1E2A4A" : colors.primaryLight }],
                      isFull && { opacity: 0.45 },
                    ]}
                    onPress={() => {
                      haptic.selection();
                      setRenterRoomId(room.id);
                      setRenterRoomPickerOpen(false);
                    }}
                  >
                    <View style={[styles.pickerIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="home-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>Room {room.roomNumber}</Text>
                      <Text style={[styles.itemSubtitle, { color: colors.secondary }]}>
                        {isFull
                          ? `Full (${occupantsCount}/${max} occupants)`
                          : `${occupantsCount}/${max} occupants • ${room.floor !== undefined && room.floor !== null ? `Floor ${room.floor}` : "Floor not set"}`}
                      </Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </Modal>

      {/* EDIT RENTER MODAL */}
      <Modal visible={showEditRenterModal} transparent animationType="slide" onRequestClose={() => !editRenterSaving && setShowEditRenterModal(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Renter</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>Update assignment and renter details.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.closeButton, { backgroundColor: colors.grayFill }]}
                    onPress={() => {
                      haptic.light();
                      setShowEditRenterModal(false);
                    }}
                  >
                    <Ionicons name="close" size={22} color={colors.secondary} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: colors.text }]}>Room *</Text>
                <TouchableOpacity
                  style={[styles.selector, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  onPress={() => {
                    haptic.selection();
                    setEditRenterRoomPickerOpen(true);
                  }}
                >
                  <Text style={[styles.selectorText, { color: colors.text }, !editSelectedRoom && { color: colors.secondary }]}>
                    {editSelectedRoom ? `Room ${editSelectedRoom.roomNumber}` : "Select active room"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.secondary} />
                </TouchableOpacity>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text }]}>First name</Text>
                    <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editFirstName} onChangeText={setEditFirstName} placeholder="First name" placeholderTextColor={colors.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text }]}>Last name</Text>
                    <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editLastName} onChangeText={setEditLastName} placeholder="Last name" placeholderTextColor={colors.secondary} />
                  </View>
                </View>

                <Text style={[styles.label, { color: colors.text }]}>Phone number</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editPhone} onChangeText={setEditPhone} placeholder="Renter phone number" placeholderTextColor={colors.secondary} keyboardType="phone-pad" />

                <Text style={[styles.label, { color: colors.text }]}>Guardian name</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editGuardianName} onChangeText={setEditGuardianName} placeholder="Guardian full name" placeholderTextColor={colors.secondary} />

                <Text style={[styles.label, { color: colors.text }]}>Guardian number</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editGuardianPhone} onChangeText={setEditGuardianPhone} placeholder="Guardian phone number" placeholderTextColor={colors.secondary} keyboardType="phone-pad" />

                <Text style={[styles.label, { color: colors.text, marginTop: 14, fontWeight: "700" }]}>Resident Address</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editAddress} onChangeText={setEditAddress} placeholder="Street address" placeholderTextColor={colors.secondary} />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text }]}>City</Text>
                    <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editCity} onChangeText={setEditCity} placeholder="City" placeholderTextColor={colors.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text }]}>State</Text>
                    <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editState} onChangeText={setEditState} placeholder="State" placeholderTextColor={colors.secondary} />
                  </View>
                </View>

                <Text style={[styles.label, { color: colors.text }]}>Pincode</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editPincode} onChangeText={setEditPincode} placeholder="Pincode" placeholderTextColor={colors.secondary} keyboardType="numeric" />

                <Text style={[styles.label, { color: colors.text }]}>Joining & Recurring Due Date *</Text>
                <TouchableOpacity
                  style={[styles.dateSelector, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  onPress={() => {
                    haptic.selection();
                    setCalendarTarget("edit");
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                    <Text style={[styles.dateSelectorText, { color: colors.text }]}>
                      {editJoiningDate || "Select recurring date"}
                    </Text>
                  </View>
                  <View style={[styles.dateBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.dateBadgeText, { color: colors.primary }]}>
                      {editJoiningDate ? `Day ${parseInt(editJoiningDate.slice(8, 10), 10) || 1} monthly` : "Pick Date"}
                    </Text>
                  </View>
                </TouchableOpacity>
                {editJoiningDate ? (
                  <View style={[styles.recurringHintBox, { backgroundColor: isDark ? "#064E3B" : "#F0FDF4", borderColor: isDark ? "#047857" : "#BBF7D0" }]}>
                    <Ionicons name="notifications-outline" size={15} color={colors.primary} />
                    <Text style={[styles.recurringHintText, { color: isDark ? "#A7F3D0" : "#166534" }]}>
                      Rent will automatically recur on Day {parseInt(editJoiningDate.slice(8, 10), 10) || 1} of every month with auto-notifications.
                    </Text>
                  </View>
                ) : null}

                <Text style={[styles.label, { color: colors.text }]}>Monthly fee *</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editMonthlyFee} onChangeText={setEditMonthlyFee} placeholder="Monthly fee" placeholderTextColor={colors.secondary} keyboardType="decimal-pad" />

                <Text style={[styles.label, { color: colors.text }]}>Security deposit</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]} value={editSecurityDeposit} onChangeText={setEditSecurityDeposit} placeholder="Security deposit" placeholderTextColor={colors.secondary} keyboardType="decimal-pad" />

                <Text style={[styles.label, { color: colors.text }]}>Status</Text>
                <View style={styles.statusSelectorRow}>
                  {["ACTIVE", "INACTIVE", "LEFT"].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[styles.statusSelectorButton, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }, editRenterStatus === status && styles.statusSelectorButtonActive]}
                      onPress={() => {
                        haptic.selection();
                        setEditRenterStatus(status);
                      }}
                    >
                      <Text style={[styles.statusSelectorText, { color: colors.secondary }, editRenterStatus === status && styles.statusSelectorTextActive]}>{status}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  disabled={editRenterSaving}
                  onPress={() => {
                    haptic.medium();
                    onUpdateRenter();
                  }}
                >
                  {editRenterSaving ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryButtonText}>Save Changes</Text><Ionicons name="checkmark" size={19} color="#FFFFFF" /></>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* EDIT RENTER ROOM PICKER */}
      <Modal visible={editRenterRoomPickerOpen} transparent animationType="slide" onRequestClose={() => setEditRenterRoomPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select room</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>Select an active room with available capacity.</Text>
              </View>
              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: colors.grayFill }]}
                onPress={() => {
                  haptic.light();
                  setEditRenterRoomPickerOpen(false);
                }}
              >
                <Ionicons name="close" size={22} color={colors.secondary} />
              </TouchableOpacity>
            </View>
            {activeRooms.length === 0 ? (
              <EmptyState icon="grid-outline" title="No active rooms" description="There are no active rooms available." />
            ) : (
              activeRooms.map((room) => {
                const otherOccupants = activeRenters.filter((r) => r.id !== editingRenterId && r.roomId === room.id).length;
                const max = Number(room.maxOccupants) || 2;
                const isFull = otherOccupants >= max;
                const selected = room.id === editRenterRoomId;
                return (
                  <Pressable
                    key={room.id}
                    disabled={isFull}
                    style={[
                      styles.pickerRow,
                      { borderBottomColor: colors.border },
                      selected && [styles.pickerSelected, { backgroundColor: isDark ? "#1E2A4A" : colors.primaryLight }],
                      isFull && { opacity: 0.45 },
                    ]}
                    onPress={() => {
                      haptic.selection();
                      setEditRenterRoomId(room.id);
                      setEditRenterRoomPickerOpen(false);
                    }}
                  >
                    <View style={[styles.pickerIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="home-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>Room {room.roomNumber}</Text>
                      <Text style={[styles.itemSubtitle, { color: colors.secondary }]}>
                        {isFull
                          ? `Full (${otherOccupants}/${max} occupants)`
                          : `${otherOccupants}/${max} occupants • ${room.floor !== undefined && room.floor !== null ? `Floor ${room.floor}` : "Floor not set"}`}
                      </Text>
                    </View>
                    {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </Modal>

      {/* CALENDAR PICKER MODAL */}
      <CalendarPickerModal
        visible={calendarTarget !== null}
        initialDate={calendarTarget === "add" ? joiningDate : editJoiningDate}
        onSelectDate={(selectedDate) => {
          haptic.selection();
          if (calendarTarget === "add") {
            setJoiningDate(selectedDate);
          } else if (calendarTarget === "edit") {
            setEditJoiningDate(selectedDate);
          }
          setCalendarTarget(null);
        }}
        onClose={() => {
          haptic.light();
          setCalendarTarget(null);
        }}
        title="Select Recurring Due Date"
      />

      {/* RENTER ONBOARDING QR MODAL */}
      <RenterOnboardingQRModal
        visible={showQRModal}
        onClose={() => {
          haptic.light();
          setShowQRModal(false);
        }}
        hostelId={selectedHostel?.id || ""}
        hostelName={selectedHostel?.name || "Hostella Resident Onboarding"}
        rooms={currentHostelRooms}
      />
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
  heroTitle: { fontSize: 26, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.6 },
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
  heroGlassBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },
  heroGlassBtnText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "700" },
  heroAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#3B5BFF",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  heroAddBtnText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  heroMetricsRow: { flexDirection: "row", gap: 10, marginTop: 2 },
  heroMetricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroMetricIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroMetricNumber: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  heroMetricLabel: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  floatingSearchWrap: { paddingHorizontal: 16, marginTop: -20, zIndex: 10 },

  // Metrics Banner (modal / legacy fallback)
  metricsContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  miniStatBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniStatText: {
    fontSize: 10,
    fontWeight: "700",
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  // Action Row
  actionRow: { marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  sectionSubtitle: { marginTop: 2, color: COLORS.secondary, fontSize: 11 },
  smallPrimaryButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
  smallPrimaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  outlineActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
  },
  outlineActionText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Filter Tabs
  filterTabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  filterTabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTabPillText: {
    fontSize: 12,
  },
  filterCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterCountBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  // Search Box
  renterSearchBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background, marginBottom: 12 },
  renterSearchInput: { flex: 1, marginLeft: 9, color: COLORS.text, fontSize: 13 },

  // Resident Card
  renterCard: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontWeight: "800",
    fontSize: 16,
  },
  statusDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  roomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  roomBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dateChipText: {
    fontSize: 10,
    fontWeight: "600",
  },
  rentPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  rentPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  renterSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  infoMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoMetaText: {
    fontSize: 11,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  contactActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  contactActionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  actionPillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  avatarLarge: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 13 },
  avatarLargeText: { color: COLORS.primary, fontWeight: "800", fontSize: 20 },
  itemSubtitle: { marginTop: 3, fontSize: 12, color: COLORS.secondary },
  roomTag: { marginTop: 5, alignSelf: "flex-start", backgroundColor: COLORS.grayFill, color: COLORS.primaryDark, fontSize: 11, fontWeight: "800", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  detailSectionPanel: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: COLORS.card,
  },
  heroActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
  },
  heroActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  heroActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", justifyContent: "flex-end" },
  modalKeyboard: { width: "100%" },
  modalCardLarge: { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  modalSubtitle: { marginTop: 3, fontSize: 12, color: COLORS.secondary },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.grayFill, alignItems: "center", justifyContent: "center" },
  renterDetailsLoading: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 12 },
  renterDetailsHero: { flexDirection: "row", alignItems: "center", paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 10 },
  renterDetailsName: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  renterDetailSectionTitle: { fontSize: 13, fontWeight: "800", color: COLORS.primaryDark, textTransform: "uppercase", letterSpacing: 0.5 },
  renterDetailsGrid: { gap: 10, marginBottom: 4 },
  detailItem: { paddingVertical: 4 },
  detailLabel: { fontSize: 11, color: COLORS.secondary, fontWeight: "600" },
  detailValue: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginTop: 2 },
  renterDetailsActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  editButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12 },
  editButtonText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  removeButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: COLORS.danger, borderRadius: 12, backgroundColor: COLORS.dangerLight },
  removeButtonText: { color: COLORS.danger, fontWeight: "700", fontSize: 13 },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.background },
  inputWithIcon: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background },
  inputWithIconText: { flex: 1, fontSize: 14, color: COLORS.text },
  selector: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.background },
  selectorText: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  primaryButton: { marginTop: 18, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  pickerCard: { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36, maxHeight: "80%" },
  pickerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerSelected: { backgroundColor: COLORS.primaryLight, borderRadius: 12, paddingHorizontal: 8 },
  pickerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 11 },
  statusSelectorRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  statusSelectorButton: { flex: 1, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  statusSelectorButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statusSelectorText: { fontSize: 12, fontWeight: "700", color: COLORS.secondary },
  statusSelectorTextActive: { color: "#FFFFFF" },
  dateSelector: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.background,
  },
  dateSelectorText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "600",
  },
  dateBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  recurringHintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
    padding: 9,
    marginTop: 6,
  },
  recurringHintText: {
    flex: 1,
    fontSize: 11,
    color: "#166534",
    fontWeight: "600",
    lineHeight: 15,
  },
  passwordHint: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: "500",
    marginTop: 5,
    marginBottom: 2,
    fontStyle: "italic",
  },
});
