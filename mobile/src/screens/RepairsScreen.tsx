import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";
import { Hostel, MaintenanceTask, Renter, Repair, RepairPerson, Room } from "../types";
import { Header, EmptyState } from "../components/common";
import { HostellaBrand } from "../components/HostellaBrand";
import { getName } from "../utils/formatters";
import { useTheme } from "../contexts/ThemeContext";
import { setSuspendBiometrics } from "../hooks/useBiometrics";
import { haptic } from "../utils/haptics";

interface RepairsScreenProps {
  repairs: Repair[];
  renters: Renter[];
  rooms: Room[];
  selectedHostel?: Hostel;
  showStatusModal: boolean;
  setShowStatusModal: (v: boolean) => void;
  showCreateModal: boolean;
  setShowCreateModal: (v: boolean) => void;
  selectedRepair: Repair | null;
  repairStatus: "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  setRepairStatus: (s: "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED") => void;
  adminNotes: string;
  setAdminNotes: (n: string) => void;
  resolvedPhotoUri?: string | null;
  setResolvedPhotoUri?: (uri: string | null) => void;
  repairSaving: boolean;
  onOpenStatusModal: (repair: Repair) => void;
  onUpdateStatus: (repairId?: string, overrideStatus?: "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED", notes?: string) => Promise<void>;
  // Create repair form
  newTitle: string;
  setNewTitle: (t: string) => void;
  newDescription: string;
  setNewDescription: (d: string) => void;
  newPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  setNewPriority: (p: "LOW" | "MEDIUM" | "HIGH" | "URGENT") => void;
  newRenterId: string;
  setNewRenterId: (id: string) => void;
  newRoomId: string;
  setNewRoomId: (id: string) => void;
  repairPersons?: RepairPerson[];
  showAddPersonModal?: boolean;
  setShowAddPersonModal?: (v: boolean) => void;
  personSaving?: boolean;
  onAddRepairPerson?: (data: { name: string; email: string; phone: string; specialty: string; password?: string }) => Promise<void>;
  onRemoveRepairPerson?: (personId: string, name: string) => Promise<void>;
  onLoadRepairPersons?: () => void;
  // Maintenance Tasks
  maintenanceTasks?: MaintenanceTask[];
  onAddMaintenanceTask?: (task: {
    title: string;
    description?: string;
    category?: string;
    frequency: "ONE_TIME" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "ANNUAL";
    scheduledDate: string;
    assignedTo?: string;
    assignedPersonName?: string;
    notes?: string;
  }) => Promise<void>;
  onUpdateMaintenanceTaskStatus?: (taskId: string, status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED", notes?: string) => Promise<void>;
  onDeleteMaintenanceTask?: (taskId: string, title: string) => Promise<void>;
  onLoadMaintenanceTasks?: () => void;
  maintenanceSaving?: boolean;
  onAddRepair: () => Promise<void>;
  onDeleteRepair?: (repairId: string, title?: string) => Promise<void> | void;
  onRefresh: () => void;
  onBack?: () => void;
  isRepairPerson?: boolean;
  onUpdateRepairPerson?: (
    personId: string,
    data: { name?: string; phone?: string; specialty?: string; status?: "ACTIVE" | "INACTIVE" }
  ) => Promise<void>;
}

export function RepairsScreen({
  repairs,
  renters,
  rooms,
  selectedHostel,
  showStatusModal,
  setShowStatusModal,
  showCreateModal,
  setShowCreateModal,
  selectedRepair,
  repairStatus,
  setRepairStatus,
  adminNotes,
  setAdminNotes,
  resolvedPhotoUri,
  setResolvedPhotoUri,
  repairSaving,
  onOpenStatusModal,
  onUpdateStatus,
  newTitle,
  setNewTitle,
  newDescription,
  setNewDescription,
  newPriority,
  setNewPriority,
  repairPersons = [],
  showAddPersonModal = false,
  setShowAddPersonModal,
  personSaving = false,
  onAddRepairPerson,
  onRemoveRepairPerson,
  onLoadRepairPersons,
  maintenanceTasks = [],
  onAddMaintenanceTask,
  onUpdateMaintenanceTaskStatus,
  onDeleteMaintenanceTask,
  onLoadMaintenanceTasks,
  maintenanceSaving = false,
  onAddRepair,
  onDeleteRepair,
  onRefresh,
  onBack,
  isRepairPerson = false,
  onUpdateRepairPerson,
}: RepairsScreenProps) {
  const { colors, isDark } = useTheme();
  const [activeOption, setActiveOption] = useState<"menu" | "repairs" | "maintenance" | "personnel">("menu");
  const [showMenuSheet, setShowMenuSheet] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [maintenanceFilter, setMaintenanceFilter] = useState<string>("ALL");

  // Local add repair person state
  const [localAddPersonModal, setLocalAddPersonModal] = useState(false);
  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [personPhone, setPersonPhone] = useState("");
  const [personSpecialty, setPersonSpecialty] = useState("General Maintenance");
  const [personPassword, setPersonPassword] = useState("Repair@123");

  // Local edit repair person state
  const [editingPerson, setEditingPerson] = useState<RepairPerson | null>(null);
  const [editPersonName, setEditPersonName] = useState("");
  const [editPersonPhone, setEditPersonPhone] = useState("");
  const [editPersonSpecialty, setEditPersonSpecialty] = useState("General Maintenance");
  const [editPersonStatus, setEditPersonStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [editPersonSaving, setEditPersonSaving] = useState(false);

  // Info modal state (for 'i' icon)
  const [infoModalText, setInfoModalText] = useState<{ title: string; desc: string } | null>(null);

  // Local schedule maintenance task state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskCategory, setTaskCategory] = useState("General Upkeep");
  const [taskFrequency, setTaskFrequency] = useState<"ONE_TIME" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "ANNUAL">("MONTHLY");
  const [taskDate, setTaskDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taskAssignedId, setTaskAssignedId] = useState("");

  const isAddPersonVisible = showAddPersonModal || localAddPersonModal;
  const setAddPersonVisible = (v: boolean) => {
    setLocalAddPersonModal(v);
    setShowAddPersonModal?.(v);
  };

  const SPECIALTIES = [
    "General Maintenance",
    "Plumbing",
    "Electrical",
    "Carpentry",
    "Painting",
    "Appliance / AC",
    "Masonry",
  ];

  const MAINTENANCE_CATEGORIES = [
    "General Upkeep",
    "AC / HVAC Servicing",
    "Water Tank Cleaning",
    "Pest Control",
    "Electrical Inspection",
    "Fire Safety Check",
    "Deep Cleaning",
  ];

  const currentHostelRepairs = selectedHostel?.id
    ? repairs.filter((r) => !r.hostelId || r.hostelId === selectedHostel.id)
    : repairs;

  const currentHostelMaintenance = selectedHostel?.id
    ? maintenanceTasks.filter((m) => !m.hostelId || m.hostelId === selectedHostel.id)
    : maintenanceTasks;

  const filteredRepairs = currentHostelRepairs.filter((r) => {
    if (filterStatus === "ALL") return true;
    return (r.status || "SUBMITTED").toUpperCase() === filterStatus;
  });

  const filteredMaintenance = currentHostelMaintenance.filter((m) => {
    if (maintenanceFilter === "ALL") return true;
    return (m.status || "SCHEDULED").toUpperCase() === maintenanceFilter;
  });

  const countSubmitted = currentHostelRepairs.filter((r) => (r.status || "SUBMITTED") === "SUBMITTED").length;
  const countInProgress = currentHostelRepairs.filter((r) => r.status === "IN_PROGRESS").length;
  const countResolved = currentHostelRepairs.filter((r) => r.status === "RESOLVED").length;

  const countScheduledMaint = currentHostelMaintenance.filter((m) => (m.status || "SCHEDULED") === "SCHEDULED").length;
  const countInProgressMaint = currentHostelMaintenance.filter((m) => m.status === "IN_PROGRESS").length;
  const countCompletedMaint = currentHostelMaintenance.filter((m) => m.status === "COMPLETED").length;

  function getPriorityColor(priority?: string) {
    switch (priority) {
      case "URGENT":
        return { bg: isDark ? "rgba(239,68,68,0.2)" : COLORS.dangerLight, text: COLORS.danger, border: isDark ? "rgba(239,68,68,0.35)" : "#FECACA" };
      case "HIGH":
        return { bg: isDark ? "rgba(249,115,22,0.2)" : COLORS.orangeLight, text: COLORS.orange, border: isDark ? "rgba(249,115,22,0.35)" : "#FED7AA" };
      case "LOW":
        return { bg: isDark ? colors.surfaceSecondary : COLORS.grayFill, text: colors.secondary, border: colors.border };
      default:
        return { bg: isDark ? "rgba(59,130,246,0.2)" : COLORS.primaryLight, text: COLORS.primary, border: isDark ? "rgba(59,130,246,0.35)" : "#BFDBFE" };
    }
  }

  function getStatusColor(status?: string) {
    switch (status) {
      case "RESOLVED":
      case "COMPLETED":
        return { bg: isDark ? "rgba(16,185,129,0.2)" : COLORS.successLight, text: COLORS.success, border: isDark ? "rgba(16,185,129,0.35)" : "#BBF7D0", label: "Resolved" };
      case "IN_PROGRESS":
        return { bg: isDark ? "rgba(139,92,246,0.2)" : COLORS.purpleLight, text: COLORS.purple, border: isDark ? "rgba(139,92,246,0.35)" : "#DDD6FE", label: "In Progress" };
      case "CANCELLED":
      case "SKIPPED":
        return { bg: isDark ? colors.surfaceSecondary : COLORS.grayFill, text: colors.secondary, border: colors.border, label: "Cancelled" };
      default:
        return { bg: isDark ? "rgba(245,158,11,0.2)" : COLORS.warningLight, text: COLORS.warning, border: isDark ? "rgba(245,158,11,0.35)" : "#FDE68A", label: "Scheduled" };
    }
  }

  async function handleAddPersonSubmit() {
    if (onAddRepairPerson) {
      await onAddRepairPerson({
        name: personName,
        email: personEmail,
        phone: personPhone,
        specialty: personSpecialty,
        password: personPassword,
      });
      setPersonName("");
      setPersonEmail("");
      setPersonPhone("");
      setPersonSpecialty("General Maintenance");
      setPersonPassword("Repair@123");
      setAddPersonVisible(false);
    }
  }

  async function handleScheduleTaskSubmit() {
    if (onAddMaintenanceTask) {
      const selectedPerson = repairPersons.find((p) => p.id === taskAssignedId);
      await onAddMaintenanceTask({
        title: taskTitle,
        description: taskDescription,
        category: taskCategory,
        frequency: taskFrequency,
        scheduledDate: taskDate,
        assignedTo: taskAssignedId || undefined,
        assignedPersonName: selectedPerson?.name || undefined,
      });
      setTaskTitle("");
      setTaskDescription("");
      setShowScheduleModal(false);
    }
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

            {/* Header Top Bar: Hostella Brand + Back Btn + Title + Property Badge + Add CTA */}
            <View style={{ marginBottom: 8 }}>
              <HostellaBrand variant="full" colorScheme="dark" size="small" style={{ alignSelf: "flex-start" }} />
            </View>
            <View style={styles.heroHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
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
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Repairs & Care</Text>
                  <View style={styles.heroPropertyBadge}>
                    <View style={styles.activeDot} />
                    <Text style={styles.heroPropertyText} numberOfLines={1}>
                      {selectedHostel?.name || "Hostella Property"}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.heroAddBtn}
                onPress={() => {
                  haptic.medium();
                  setShowCreateModal(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={17} color="#FFFFFF" />
                <Text style={styles.heroAddBtnText}>Report Issue</Text>
              </TouchableOpacity>
            </View>

            {/* Bento Box of Needs Fix, Routine Tasks, and Staff */}
            <View style={styles.heroBentoCard}>
              <TouchableOpacity
                style={styles.heroBentoItem}
                onPress={() => setActiveOption("repairs")}
                activeOpacity={0.75}
              >
                <View style={styles.heroBentoLabelRow}>
                  <View style={[styles.bentoDot, { backgroundColor: countSubmitted + countInProgress > 0 ? "#EF4444" : "#10B981" }]} />
                  <Text style={styles.heroBentoLabel}>Needs Fix</Text>
                </View>
                <Text style={[styles.heroBentoVal, { color: countSubmitted + countInProgress > 0 ? "#F87171" : "#34D399" }]}>
                  {countSubmitted + countInProgress}
                </Text>
                <Text style={styles.heroBentoSub}>Complaints</Text>
              </TouchableOpacity>

              <View style={styles.heroBentoDivider} />

              <TouchableOpacity
                style={styles.heroBentoItem}
                onPress={() => {
                  setActiveOption("maintenance");
                  onLoadMaintenanceTasks?.();
                }}
                activeOpacity={0.75}
              >
                <View style={styles.heroBentoLabelRow}>
                  <Ionicons name="calendar" size={11} color="#FBBF24" />
                  <Text style={styles.heroBentoLabel}>Routine</Text>
                </View>
                <Text style={[styles.heroBentoVal, { color: countScheduledMaint > 0 ? "#FBBF24" : "rgba(255,255,255,0.7)" }]}>
                  {countScheduledMaint}
                </Text>
                <Text style={styles.heroBentoSub}>Tasks</Text>
              </TouchableOpacity>

              <View style={styles.heroBentoDivider} />

              <TouchableOpacity
                style={styles.heroBentoItem}
                onPress={() => {
                  if (!isRepairPerson) {
                    setActiveOption("personnel");
                    onLoadRepairPersons?.();
                  }
                }}
                activeOpacity={0.75}
              >
                <View style={styles.heroBentoLabelRow}>
                  <Ionicons name="people" size={11} color="#93C5FD" />
                  <Text style={styles.heroBentoLabel}>Workers</Text>
                </View>
                <Text style={[styles.heroBentoVal, { color: "#FFFFFF" }]}>
                  {repairPersons.length}
                </Text>
                <Text style={styles.heroBentoSub}>Staff</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* ── Main Repairs Body ── */}
        <View style={styles.mainRepairsBody}>

        {/* ── Care & Operations Menu Hub (When in Menu Mode) ── */}
        {activeOption === "menu" ? (
          <View style={styles.menuContainer}>

            <View style={styles.menuHeaderRow}>
              <Text style={[styles.menuHeaderTitle, { color: colors.text }]}>CHOOSE AN ACTION</Text>
              <Text style={[styles.menuHeaderSub, { color: colors.secondary }]}>Tap below to view complaints or workers</Text>
            </View>

            <View style={styles.menuGridContainer}>
              {/* Option 1: Repairs */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setActiveOption("repairs")}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(239,68,68,0.18)" : COLORS.dangerLight }]}>
                  <Ionicons name="build-outline" size={24} color={COLORS.danger} />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Complaints</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{repairs.length} Total</Text>
              </TouchableOpacity>

              {/* Option 2: Maintenance */}
              <TouchableOpacity
                style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  setActiveOption("maintenance");
                  onLoadMaintenanceTasks?.();
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(245,158,11,0.18)" : COLORS.warningLight }]}>
                  <Ionicons name="calendar-outline" size={24} color={COLORS.warning} />
                </View>
                <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Routine Check</Text>
                <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{maintenanceTasks.length} Tasks</Text>
              </TouchableOpacity>

              {/* Option 3: Personnel (Hidden for repair person) */}
              {!isRepairPerson && (
                <TouchableOpacity
                  style={[styles.menuGridItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => {
                    setActiveOption("personnel");
                    onLoadRepairPersons?.();
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.menuGridIcon, { backgroundColor: isDark ? "rgba(59,130,246,0.18)" : COLORS.primaryLight }]}>
                    <Ionicons name="people-outline" size={24} color={COLORS.primary} />
                  </View>
                  <Text style={[styles.menuGridTitle, { color: colors.text }]} numberOfLines={1}>Workers</Text>
                  <Text style={[styles.menuGridSub, { color: colors.secondary }]}>{repairPersons.length} Staff</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Actions Header */}
            <Text style={[styles.menuSectionDividerText, { color: colors.secondary }]}>QUICK SHORTCUTS</Text>

            {/* Action 1: Report Problem */}
            <TouchableOpacity
              style={[styles.menuActionCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => {
                haptic.medium();
                setShowCreateModal(true);
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.menuActionIconBox, { backgroundColor: COLORS.dangerLight }]}>
                <Ionicons name="add" size={18} color={COLORS.danger} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuActionTitle, { color: colors.text }]}>Report a Problem</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
            </TouchableOpacity>

            {/* Action 2: Schedule Task */}
            <TouchableOpacity
              style={[styles.menuActionCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginTop: 8 }]}
              onPress={() => {
                haptic.medium();
                setShowScheduleModal(true);
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.menuActionIconBox, { backgroundColor: COLORS.warningLight }]}>
                <Ionicons name="calendar" size={18} color={COLORS.warning} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuActionTitle, { color: colors.text }]}>Schedule Routine Task</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
            </TouchableOpacity>
          </View>
        ) : (
          /* ── In-Section Top Navigation Bar (When an option is open) ── */
          <View style={[styles.menuActiveNavRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.menuBackToMenuBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onPress={() => setActiveOption("menu")}
            >
              <Ionicons name="arrow-back" size={16} color={colors.primary} />
              <Text style={[styles.menuBackToMenuText, { color: colors.primary }]}>Care Menu</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                style={[styles.menuOptionSelectorBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                onPress={() => setShowMenuSheet(true)}
              >
                <Ionicons name="options-outline" size={14} color={colors.text} />
                <Text style={[styles.menuOptionSelectorText, { color: colors.text }]} numberOfLines={1}>
                  {activeOption === "repairs" && "Repairs"}
                  {activeOption === "maintenance" && "Maintenance"}
                  {activeOption === "personnel" && "Personnel"}
                </Text>
                <Ionicons name="chevron-down" size={13} color={colors.secondary} />
              </TouchableOpacity>

              {/* Info 'i' button replacing the option description */}
              <TouchableOpacity
                style={[styles.infoIconBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                onPress={() => {
                  if (activeOption === "repairs") {
                    setInfoModalText({
                      title: "Repair Complaints",
                      desc: "Resident tickets, breakdown fixes, plumbing & electrical requests submitted by tenants.",
                    });
                  } else if (activeOption === "maintenance") {
                    setInfoModalText({
                      title: "Scheduled Maintenance",
                      desc: "Routine servicing, water tank cleaning, pest control & facility preventive checks.",
                    });
                  } else if (activeOption === "personnel") {
                    setInfoModalText({
                      title: "Technicians & Personnel",
                      desc: "Contact directory of electricians, plumbers, carpenters & staff assigned to this property.",
                    });
                  }
                }}
                accessibilityLabel="Section Info"
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─────────────────────────────────────────────────────────────
           TAB 1: REPAIRS ONLY (Complaints & Breakage tickets)
           ───────────────────────────────────────────────────────────── */}
        {activeOption === "repairs" && (
          <View>
            <View style={styles.actionRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Repair Complaints</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
                  {repairs.length} tickets • {countSubmitted} pending inspection
                </Text>
              </View>
              <TouchableOpacity
                style={styles.smallPrimaryButton}
                onPress={() => setShowCreateModal(true)}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.smallPrimaryText}>New Ticket</Text>
              </TouchableOpacity>
            </View>

            {/* Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {[
                { key: "ALL", label: `All (${repairs.length})` },
                { key: "SUBMITTED", label: `Reported (${countSubmitted})` },
                { key: "IN_PROGRESS", label: `In Progress (${countInProgress})` },
                { key: "RESOLVED", label: `Resolved (${countResolved})` },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.filterPill,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    filterStatus === item.key && {
                      backgroundColor: isDark ? "rgba(59,130,246,0.2)" : COLORS.primaryLight,
                      borderColor: COLORS.primary,
                    },
                  ]}
                  onPress={() => {
                    haptic.selection();
                    setFilterStatus(item.key);
                  }}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      { color: colors.secondary },
                      filterStatus === item.key && { color: isDark ? "#60A5FA" : COLORS.primary, fontWeight: "700" },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Repairs List */}
            {filteredRepairs.length === 0 ? (
              <EmptyState
                icon="construct-outline"
                title="No repair requests"
                description={
                  filterStatus === "ALL"
                    ? "No room breakdown complaints registered in this hostel."
                    : `No complaints found with status ${filterStatus.toLowerCase()}.`
                }
              />
            ) : (
              filteredRepairs.map((repair) => {
                const renter = renters.find((r) => r.id === repair.renterId);
                const renterName = renter ? getName(renter) : "Resident";
                const room = rooms.find((rm) => rm.id === (repair.roomId || renter?.roomId));
                const priorityStyle = getPriorityColor(repair.priority);
                const statusStyle = getStatusColor(repair.status);

                return (
                  <TouchableOpacity
                    key={repair.id}
                    activeOpacity={0.82}
                    onPress={() => {
                      haptic.cardPress();
                      onOpenStatusModal(repair);
                    }}
                    style={[styles.repairCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.repairCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.repairTitle, { color: colors.text }]}>{repair.title}</Text>
                        <View style={styles.repairSubRow}>
                          <Ionicons name="person-outline" size={13} color={colors.secondary} />
                          <Text style={[styles.repairSubText, { color: colors.secondary }]}>{renterName}</Text>
                          {room && (
                            <>
                              <Text style={[styles.repairDot, { color: colors.secondary }]}>•</Text>
                              <Ionicons name="grid-outline" size={13} color={colors.secondary} />
                              <Text style={[styles.repairSubText, { color: colors.secondary }]}>Room {room.roomNumber}</Text>
                            </>
                          )}
                        </View>
                      </View>
                      <View style={styles.badgeCol}>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: priorityStyle.bg,
                              borderColor: priorityStyle.border,
                            },
                          ]}
                        >
                          <Text style={[styles.badgeText, { color: priorityStyle.text }]}>
                            {repair.priority || "MEDIUM"}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: statusStyle.bg,
                              borderColor: statusStyle.border,
                              marginTop: 4,
                            },
                          ]}
                        >
                          <Text style={[styles.badgeText, { color: statusStyle.text }]}>
                            {statusStyle.label}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text style={[styles.repairDescription, { color: colors.text }]}>{repair.description}</Text>

                    {repair.adminNotes ? (
                      <View style={[styles.adminNoteBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
                        <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.primary} />
                        <Text style={[styles.adminNoteText, { color: colors.text }]}>
                          <Text style={{ fontWeight: "700" }}>Warden Note: </Text>
                          {repair.adminNotes}
                        </Text>
                      </View>
                    ) : null}

                    <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                      <Text style={[styles.dateText, { color: colors.secondary }]}>
                        {repair.createdAt ? new Date(repair.createdAt).toLocaleDateString() : ""}
                      </Text>
                      <View style={styles.footerActions}>
                        {(repair.status || "SUBMITTED") === "SUBMITTED" && (
                          <TouchableOpacity
                            style={[
                              styles.actionBtnOutline,
                              {
                                backgroundColor: colors.purpleLight,
                                borderColor: isDark ? "rgba(168,85,247,0.35)" : "#DDD6FE",
                              },
                            ]}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              haptic.medium();
                              onUpdateStatus(repair.id, "IN_PROGRESS");
                            }}
                          >
                            <Ionicons name="play-outline" size={14} color={colors.purple} />
                            <Text style={[styles.actionBtnText, { color: colors.purple }]}>
                              Start Work
                            </Text>
                          </TouchableOpacity>
                        )}
                        {repair.status !== "RESOLVED" && (
                          <TouchableOpacity
                            style={[
                              styles.actionBtnGreen,
                              {
                                backgroundColor: colors.successLight,
                                borderColor: isDark ? "rgba(34,197,94,0.35)" : "#BBF7D0",
                              },
                            ]}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              haptic.success();
                              onUpdateStatus(repair.id, "RESOLVED");
                            }}
                          >
                            <Ionicons name="checkmark-done-outline" size={14} color={colors.success} />
                            <Text style={[styles.actionBtnText, { color: colors.success }]}>
                              Resolve
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.manageBtn, { backgroundColor: colors.surfaceSecondary }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            haptic.light();
                            onOpenStatusModal(repair);
                          }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={16} color={colors.secondary} />
                        </TouchableOpacity>
                        {!isRepairPerson && onDeleteRepair ? (
                          <TouchableOpacity
                            style={[styles.cardDeleteBtn, { backgroundColor: colors.dangerLight }]}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              haptic.heavy();
                              onDeleteRepair(repair.id, repair.title);
                            }}
                          >
                            <Ionicons name="trash-outline" size={15} color={colors.danger} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ─────────────────────────────────────────────────────────────
           TAB 2: MAINTENANCE ONLY (Preventative & Scheduled Servicing)
           ───────────────────────────────────────────────────────────── */}
        {activeOption === "maintenance" && (
          <View>
            <View style={styles.actionRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Preventative Maintenance</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
                  {maintenanceTasks.length} cycles • {countScheduledMaint} scheduled
                </Text>
              </View>
              <TouchableOpacity
                style={styles.smallPrimaryButton}
                onPress={() => setShowScheduleModal(true)}
              >
                <Ionicons name="calendar-outline" size={16} color="#FFFFFF" />
                <Text style={styles.smallPrimaryText}>Schedule Task</Text>
              </TouchableOpacity>
            </View>

            {/* Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {[
                { key: "ALL", label: `All (${maintenanceTasks.length})` },
                { key: "SCHEDULED", label: `Scheduled (${countScheduledMaint})` },
                { key: "IN_PROGRESS", label: `In Progress (${countInProgressMaint})` },
                { key: "COMPLETED", label: `Completed (${countCompletedMaint})` },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.filterPill,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    maintenanceFilter === item.key && {
                      backgroundColor: isDark ? "rgba(59,130,246,0.2)" : COLORS.primaryLight,
                      borderColor: COLORS.primary,
                    },
                  ]}
                  onPress={() => setMaintenanceFilter(item.key)}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      { color: colors.secondary },
                      maintenanceFilter === item.key && { color: isDark ? "#60A5FA" : COLORS.primary, fontWeight: "700" },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredMaintenance.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                title="No maintenance scheduled"
                description="Keep your hostel running smoothly by scheduling recurring maintenance like AC filter checks, water tank cleaning, or pest control."
              />
            ) : (
              filteredMaintenance.map((task) => {
                const isCompleted = task.status === "COMPLETED";
                const isInProgress = task.status === "IN_PROGRESS";

                return (
                  <View key={task.id} style={[styles.repairCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.repairCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.repairTitle, { color: colors.text }]}>{task.title}</Text>
                        <View style={styles.repairSubRow}>
                          <Ionicons name="time-outline" size={13} color={colors.secondary} />
                          <Text style={[styles.repairSubText, { color: colors.secondary }]}>
                            Due: {task.scheduledDate}
                          </Text>
                          <Text style={[styles.repairDot, { color: colors.secondary }]}>•</Text>
                          <Ionicons name="sync-outline" size={13} color={colors.secondary} />
                          <Text style={[styles.repairSubText, { color: colors.secondary }]}>{task.frequency}</Text>
                        </View>
                      </View>
                      <View style={styles.badgeCol}>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isDark ? "rgba(59,130,246,0.2)" : COLORS.primaryLight,
                              borderColor: isDark ? "rgba(59,130,246,0.35)" : "#BFDBFE",
                            },
                          ]}
                        >
                          <Text style={[styles.badgeText, { color: COLORS.primary }]}>
                            {task.category || "General"}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isDark
                                ? isCompleted ? "rgba(16,185,129,0.2)" : isInProgress ? "rgba(139,92,246,0.2)" : "rgba(245,158,11,0.2)"
                                : isCompleted ? COLORS.successLight : isInProgress ? COLORS.purpleLight : COLORS.warningLight,
                              borderColor: isDark
                                ? isCompleted ? "rgba(16,185,129,0.35)" : isInProgress ? "rgba(139,92,246,0.35)" : "rgba(245,158,11,0.35)"
                                : isCompleted ? "#BBF7D0" : isInProgress ? "#DDD6FE" : "#FDE68A",
                              marginTop: 4,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              {
                                color: isCompleted ? COLORS.success : isInProgress ? COLORS.purple : COLORS.warning,
                              },
                            ]}
                          >
                            {task.status || "SCHEDULED"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {task.description ? (
                      <Text style={[styles.repairDescription, { color: colors.text }]}>{task.description}</Text>
                    ) : null}

                    {task.assignedPersonName ? (
                      <View style={[styles.adminNoteBox, { backgroundColor: isDark ? colors.surfaceSecondary : "#F0FDF4", borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
                        <Ionicons name="person" size={13} color={COLORS.success} />
                        <Text style={[styles.adminNoteText, { color: isDark ? colors.text : "#166534" }]}>
                          <Text style={{ fontWeight: "700" }}>Assigned Tech: </Text>
                          {task.assignedPersonName}
                        </Text>
                      </View>
                    ) : null}

                    <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                      {!isRepairPerson && onDeleteMaintenanceTask ? (
                        <TouchableOpacity
                          onPress={() => onDeleteMaintenanceTask?.(task.id, task.title)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                        >
                          <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                          <Text style={{ fontSize: 12, color: COLORS.danger, fontWeight: "600" }}>Remove</Text>
                        </TouchableOpacity>
                      ) : <View />}

                      <View style={styles.footerActions}>
                        {!isCompleted && !isInProgress && (
                          <TouchableOpacity
                            style={[
                              styles.actionBtnOutline,
                              {
                                backgroundColor: colors.purpleLight,
                                borderColor: isDark ? "rgba(168,85,247,0.35)" : "#DDD6FE",
                              },
                            ]}
                            onPress={() => onUpdateMaintenanceTaskStatus?.(task.id, "IN_PROGRESS")}
                          >
                            <Ionicons name="play-outline" size={14} color={colors.purple} />
                            <Text style={[styles.actionBtnText, { color: colors.purple }]}>Start</Text>
                          </TouchableOpacity>
                        )}
                        {!isCompleted && (
                          <TouchableOpacity
                            style={[
                              styles.actionBtnGreen,
                              {
                                backgroundColor: colors.successLight,
                                borderColor: isDark ? "rgba(34,197,94,0.35)" : "#BBF7D0",
                              },
                            ]}
                            onPress={() => onUpdateMaintenanceTaskStatus?.(task.id, "COMPLETED")}
                          >
                            <Ionicons name="checkmark-done-outline" size={14} color={colors.success} />
                            <Text style={[styles.actionBtnText, { color: colors.success }]}>Complete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ─────────────────────────────────────────────────────────────
           TAB 3: PERSONNEL ONLY (Technicians & Crew)
           ───────────────────────────────────────────────────────────── */}
        {activeOption === "personnel" && (
          <View>
            <View style={styles.actionRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Repair Personnel</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
                  {repairPersons.length} technicians registered for this hostel
                </Text>
              </View>
              {!isRepairPerson && (
                <TouchableOpacity
                  style={styles.smallPrimaryButton}
                  onPress={() => setAddPersonVisible(true)}
                >
                  <Ionicons name="person-add" size={17} color="#FFFFFF" />
                  <Text style={styles.smallPrimaryText}>Add Technician</Text>
                </TouchableOpacity>
              )}
            </View>

            {repairPersons.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No repair personnel added"
                description="Add your plumbers, electricians, or carpenters so they can log in to view and resolve repair tickets."
              />
            ) : (
              repairPersons.map((p) => (
                <View key={p.id} style={[styles.personCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.personCardHeader}>
                    <View style={[styles.personAvatar, { backgroundColor: colors.surfaceSecondary }]}>
                      <Text style={[styles.personAvatarText, { color: colors.primary }]}>
                        {(p.name || "T").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.personName, { color: colors.text }]}>{p.name}</Text>
                      <View style={[styles.specialtyBadge, { backgroundColor: colors.surfaceSecondary }]}>
                        <Text style={[styles.specialtyText, { color: colors.primary }]}>
                          {p.specialty || "General Maintenance"}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {!isRepairPerson && onUpdateRepairPerson ? (
                        <TouchableOpacity
                          onPress={() => {
                            setEditingPerson(p);
                            setEditPersonName(p.name);
                            setEditPersonPhone(p.phone);
                            setEditPersonSpecialty(p.specialty || "General Maintenance");
                            setEditPersonStatus(p.status === "INACTIVE" ? "INACTIVE" : "ACTIVE");
                          }}
                          style={[styles.editBtn, { backgroundColor: colors.surfaceSecondary }]}
                        >
                          <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      ) : null}
                      {!isRepairPerson && onRemoveRepairPerson ? (
                        <TouchableOpacity
                          onPress={() => onRemoveRepairPerson?.(p.id, p.name)}
                          style={[styles.removeBtn, { backgroundColor: colors.dangerLight }]}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  <View style={[styles.personDetailsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.detailItem}>
                      <Ionicons name="mail-outline" size={13} color={colors.secondary} />
                      <Text style={[styles.detailText, { color: colors.secondary }]}>{p.email}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="call-outline" size={13} color={colors.secondary} />
                      <Text style={[styles.detailText, { color: colors.secondary }]}>{p.phone}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        </View>
      </ScrollView>

      {/* ── Status & Notes Modal ── */}
      <Modal visible={showStatusModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Update Repair Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: colors.secondary }]}>{selectedRepair?.title}</Text>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Status</Text>
            <View style={styles.statusPickerRow}>
              {[
                { key: "SUBMITTED", label: "Reported" },
                { key: "IN_PROGRESS", label: "In Progress" },
                { key: "RESOLVED", label: "Resolved" },
                { key: "CANCELLED", label: "Cancelled" },
              ].map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.statusChoice,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                    repairStatus === s.key && styles.statusChoiceActive,
                  ]}
                  onPress={() => setRepairStatus(s.key as any)}
                >
                  <Text
                    style={[
                      styles.statusChoiceText,
                      { color: colors.secondary },
                      repairStatus === s.key && styles.statusChoiceTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Warden / Technician Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
              value={adminNotes}
              onChangeText={setAdminNotes}
              placeholder="e.g. Plumber inspected, parts ordered..."
              placeholderTextColor={colors.secondary}
              multiline
              numberOfLines={3}
            />

            {repairStatus === "RESOLVED" && (
              <View style={{ marginTop: 12, marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Completion Photo (After Repair)
                </Text>
                <Text style={{ fontSize: 11, color: colors.secondary, marginBottom: 8 }}>
                  Attach a photo of the completed repair before marking the ticket RESOLVED.
                </Text>

                {resolvedPhotoUri ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <Image
                      source={{ uri: resolvedPhotoUri }}
                      style={{ width: 70, height: 70, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                    />
                    <TouchableOpacity
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.dangerLight }}
                      onPress={() => setResolvedPhotoUri?.(null)}
                    >
                      <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: "600" }}>Remove Photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceSecondary,
                        gap: 6,
                      }}
                      onPress={async () => {
                        const perm = await ImagePicker.requestCameraPermissionsAsync();
                        if (perm.granted) {
                          setSuspendBiometrics(true);
                          const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
                          if (!res.canceled && res.assets?.[0]) {
                            setResolvedPhotoUri?.(res.assets[0].uri);
                          }
                        }
                      }}
                    >
                      <Ionicons name="camera-outline" size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Take Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceSecondary,
                        gap: 6,
                      }}
                      onPress={async () => {
                        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (perm.granted) {
                          setSuspendBiometrics(true);
                          const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
                          if (!res.canceled && res.assets?.[0]) {
                            setResolvedPhotoUri?.(res.assets[0].uri);
                          }
                        }
                      }}
                    >
                      <Ionicons name="image-outline" size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Upload Image</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowStatusModal(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, repairSaving && styles.btnDisabled]}
                disabled={repairSaving}
                onPress={() => onUpdateStatus()}
              >
                {repairSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Update Ticket</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Repair Modal ── */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>File Repair Ticket</Text>
                <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Breakage / Issue Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. Water leak in washroom"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Details & Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="Describe what needs repair..."
                placeholderTextColor={colors.secondary}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Priority Level</Text>
              <View style={styles.statusPickerRow}>
                {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.statusChoice,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                      newPriority === p && styles.statusChoiceActive,
                    ]}
                    onPress={() => setNewPriority(p)}
                  >
                    <Text
                      style={[
                        styles.statusChoiceText,
                        { color: colors.secondary },
                        newPriority === p && styles.statusChoiceTextActive,
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setShowCreateModal(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, repairSaving && styles.btnDisabled]}
                  disabled={repairSaving}
                  onPress={onAddRepair}
                >
                  {repairSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Submit Ticket</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Schedule Maintenance Modal ── */}
      <Modal visible={showScheduleModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Schedule Maintenance</Text>
                <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Task Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={taskTitle}
                onChangeText={setTaskTitle}
                placeholder="e.g. Overhead Tank Cleaning"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Category</Text>
              <View style={styles.statusPickerRow}>
                {MAINTENANCE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.statusChoice,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                      taskCategory === cat && styles.statusChoiceActive,
                    ]}
                    onPress={() => setTaskCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.statusChoiceText,
                        { color: colors.secondary },
                        taskCategory === cat && styles.statusChoiceTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Frequency</Text>
              <View style={styles.statusPickerRow}>
                {(["ONE_TIME", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const).map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.statusChoice,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                      taskFrequency === freq && styles.statusChoiceActive,
                    ]}
                    onPress={() => setTaskFrequency(freq)}
                  >
                    <Text
                      style={[
                        styles.statusChoiceText,
                        { color: colors.secondary },
                        taskFrequency === freq && styles.statusChoiceTextActive,
                      ]}
                    >
                      {freq.replace("_", " ")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Scheduled Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={taskDate}
                onChangeText={setTaskDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Assign Technician (Optional)</Text>
              <View style={styles.statusPickerRow}>
                <TouchableOpacity
                  style={[
                    styles.statusChoice,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                    !taskAssignedId && styles.statusChoiceActive,
                  ]}
                  onPress={() => setTaskAssignedId("")}
                >
                  <Text style={[styles.statusChoiceText, { color: colors.secondary }, !taskAssignedId && styles.statusChoiceTextActive]}>
                    Unassigned
                  </Text>
                </TouchableOpacity>
                {repairPersons.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.statusChoice,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                      taskAssignedId === p.id && styles.statusChoiceActive,
                    ]}
                    onPress={() => setTaskAssignedId(p.id)}
                  >
                    <Text style={[styles.statusChoiceText, { color: colors.secondary }, taskAssignedId === p.id && styles.statusChoiceTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setShowScheduleModal(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, maintenanceSaving && styles.btnDisabled]}
                  disabled={maintenanceSaving}
                  onPress={handleScheduleTaskSubmit}
                >
                  {maintenanceSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Task</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Repair Person Modal ── */}
      <Modal visible={isAddPersonVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Add Repair Person</Text>
                <TouchableOpacity onPress={() => setAddPersonVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Technician Full Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={personName}
                onChangeText={setPersonName}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Mobile Number * (Used for login)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={personPhone}
                onChangeText={setPersonPhone}
                placeholder="e.g. 9876543210"
                keyboardType="phone-pad"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Email Address * (Used for login)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={personEmail}
                onChangeText={setPersonEmail}
                placeholder="e.g. ramesh@repairs.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Trade / Specialty</Text>
              <View style={styles.statusPickerRow}>
                {SPECIALTIES.map((spec) => (
                  <TouchableOpacity
                    key={spec}
                    style={[
                      styles.statusChoice,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                      personSpecialty === spec && styles.statusChoiceActive,
                    ]}
                    onPress={() => setPersonSpecialty(spec)}
                  >
                    <Text
                      style={[
                        styles.statusChoiceText,
                        { color: colors.secondary },
                        personSpecialty === spec && styles.statusChoiceTextActive,
                      ]}
                    >
                      {spec}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Initial Password (Min 6 chars)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={personPassword}
                onChangeText={setPersonPassword}
                placeholder="Default: Repair@123"
                placeholderTextColor={colors.secondary}
                secureTextEntry
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setAddPersonVisible(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, personSaving && styles.btnDisabled]}
                  disabled={personSaving}
                  onPress={handleAddPersonSubmit}
                >
                  {personSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Technician</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Technician Modal (Admin only) ── */}
      <Modal visible={!!editingPerson} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 18 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Technician</Text>
                <TouchableOpacity onPress={() => setEditingPerson(null)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.modalSub, { color: colors.secondary }]}>Update technician profile and active status</Text>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Full Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={editPersonName}
                onChangeText={setEditPersonName}
                placeholder="Technician name"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Phone Number *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={editPersonPhone}
                onChangeText={setEditPersonPhone}
                placeholder="Phone number"
                placeholderTextColor={colors.secondary}
                keyboardType="phone-pad"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Specialty / Trade *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={editPersonSpecialty}
                onChangeText={setEditPersonSpecialty}
                placeholder="e.g. Electrician, Plumber, Carpentry"
                placeholderTextColor={colors.secondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Status</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    editPersonStatus === "ACTIVE"
                      ? { backgroundColor: colors.successLight, borderColor: colors.success, borderWidth: 1 }
                      : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 },
                    { paddingVertical: 10, borderRadius: 10, alignItems: "center" },
                  ]}
                  onPress={() => setEditPersonStatus("ACTIVE")}
                >
                  <Text style={{ fontWeight: "700", color: editPersonStatus === "ACTIVE" ? colors.success : colors.secondary, fontSize: 13 }}>
                    Active
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    editPersonStatus === "INACTIVE"
                      ? { backgroundColor: colors.dangerLight, borderColor: colors.danger, borderWidth: 1 }
                      : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 },
                    { paddingVertical: 10, borderRadius: 10, alignItems: "center" },
                  ]}
                  onPress={() => setEditPersonStatus("INACTIVE")}
                >
                  <Text style={{ fontWeight: "700", color: editPersonStatus === "INACTIVE" ? colors.danger : colors.secondary, fontSize: 13 }}>
                    Inactive
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setEditingPerson(null)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }, editPersonSaving && styles.btnDisabled]}
                  onPress={async () => {
                    if (!editingPerson) return;
                    if (!editPersonName.trim() || !editPersonPhone.trim()) {
                      Alert.alert("Missing Fields", "Name and phone number are required.");
                      return;
                    }
                    setEditPersonSaving(true);
                    try {
                      await onUpdateRepairPerson?.(editingPerson.id, {
                        name: editPersonName.trim(),
                        phone: editPersonPhone.trim(),
                        specialty: editPersonSpecialty.trim(),
                        status: editPersonStatus,
                      });
                      setEditingPerson(null);
                    } catch (err: any) {
                      Alert.alert("Error", err?.message || "Failed to update technician");
                    } finally {
                      setEditPersonSaving(false);
                    }
                  }}
                  disabled={editPersonSaving}
                >
                  {editPersonSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Update Technician</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Info Modal ('i' icon) ── */}
      <Modal visible={!!infoModalText} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
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
  screen: { flex: 1, backgroundColor: COLORS.background },
  screenContent: { paddingBottom: 110 },
  heroContainer: {
    marginBottom: 4,
  },
  heroBannerGradient: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 18 : 14,
    paddingBottom: 22,
    minHeight: 180,
    position: "relative",
    overflow: "hidden",
  },
  ambientOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    zIndex: 2,
  },
  heroBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  heroPropertyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  heroPropertyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.75)",
  },
  heroAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#2563EB",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 13,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  heroAddBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroBentoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 4,
    zIndex: 2,
  },
  heroBentoItem: {
    flex: 1,
    alignItems: "center",
  },
  heroBentoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  bentoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroBentoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroBentoVal: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  heroBentoSub: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.55)",
    marginTop: 2,
    fontWeight: "500",
  },
  heroBentoDivider: {
    width: 1,
    height: 38,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginHorizontal: 4,
  },
  mainRepairsBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
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
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.grayFill,
    borderRadius: 14,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },
  segmentBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoBarText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primaryDark,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  sectionSubtitle: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  smallPrimaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 5,
  },
  smallPrimaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  filterScroll: { marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.grayFill,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  filterPillText: { fontSize: 11, fontWeight: "600", color: COLORS.secondary },
  filterPillTextActive: { color: COLORS.primary, fontWeight: "700" },
  repairCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  repairCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  repairTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  repairSubRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  repairSubText: { fontSize: 12, color: COLORS.secondary, fontWeight: "500" },
  repairDot: { fontSize: 12, color: COLORS.secondary },
  badgeCol: { alignItems: "flex-end" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "700" },
  repairDescription: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
    marginVertical: 6,
  },
  adminNoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 9,
    padding: 9,
    marginTop: 6,
    marginBottom: 4,
  },
  adminNoteText: { flex: 1, fontSize: 12, color: COLORS.primaryDark, lineHeight: 16 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dateText: { fontSize: 11, color: COLORS.secondary },
  footerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    backgroundColor: COLORS.purpleLight,
  },
  actionBtnGreen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: COLORS.successLight,
  },
  actionBtnText: { fontSize: 11, fontWeight: "700" },
  manageBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.grayFill,
  },
  personCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  personCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  personAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  personAvatarText: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.primary,
  },
  personName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 2,
  },
  specialtyBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.grayFill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  specialtyText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primary,
  },
  removeBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.dangerLight,
  },
  personDetailsRow: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.secondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.secondary, marginBottom: 16 },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  statusPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 10,
  },
  statusChoice: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.grayFill,
  },
  statusChoiceActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  statusChoiceText: { fontSize: 12, fontWeight: "600", color: COLORS.secondary },
  statusChoiceTextActive: { color: COLORS.primary, fontWeight: "700" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: { fontSize: 13, fontWeight: "600", color: COLORS.secondary },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  btnDisabled: { opacity: 0.6 },
  cardDeleteBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: COLORS.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Menu Hub Styles
  menuContainer: { marginTop: 14, marginBottom: 10 },
  menuHeaderRow: { marginBottom: 8 },
  menuHeaderTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5, marginBottom: 2 },
  menuHeaderSub: { fontSize: 12 },
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
  menuCardDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  menuCounterBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 8 },
  menuCounterBadgeText: { fontSize: 11, fontWeight: "700" },
  menuSectionDividerText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginTop: 14, marginBottom: 4 },
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
  menuActionIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
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
  kpiContainer: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    alignItems: "center",
  },
  kpiItem: { flex: 1, alignItems: "center" },
  kpiLabel: { fontSize: 11, fontWeight: "600" },
  kpiValue: { fontSize: 20, fontWeight: "800", marginTop: 3 },
  kpiDivider: { width: 1, height: 34, marginHorizontal: 8 },
  infoIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  editBtn: {
    padding: 8,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
});
