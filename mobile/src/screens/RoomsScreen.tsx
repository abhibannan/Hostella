/**
 * RoomsScreen.tsx
 *
 * Rich room management screen for Hostella admins.
 * Features:
 *  - Grid view of all rooms with occupancy indicators
 *  - Tap a room → full detail bottom-sheet with:
 *      • Live occupant list (fetched from /rooms/:id/occupants)
 *      • Capacity control (+/− max-occupants)
 *      • Transfer any occupant to another room via dropdown
 *  - Add room modal
 *  - Delete room (blocked if occupied)
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../constants/theme";
import { Hostel, Room, Renter } from "../types";
import { Header, EmptyState, SectionTitle } from "../components/common";
import { HostellaBrand } from "../components/HostellaBrand";
import { useTheme } from "../contexts/ThemeContext";
import { haptic } from "../utils/haptics";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Occupant {
  id: string;
  userId?: string | null;
  status?: string;
  joiningDate?: string | null;
  monthlyFee?: number | null;
  securityDeposit?: number | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface RoomsScreenProps {
  rooms: Room[];
  renters: Renter[];
  selectedHostel?: Hostel;
  showRoomModal: boolean;
  setShowRoomModal: (show: boolean) => void;
  roomNumber: string;
  setRoomNumber: (num: string) => void;
  roomFloor: string;
  setRoomFloor: (floor: string) => void;
  roomCapacity?: string;
  setRoomCapacity?: (cap: string) => void;
  roomSaving: boolean;
  onAddRoom: () => void;
  onDeleteRoom: (room: Room) => void;
  onRefresh: () => void;
  request: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  selectedHostelId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOccupantName(o: Occupant): string {
  const fn = o.user?.firstName ?? "";
  const ln = o.user?.lastName ?? "";
  const full = [fn, ln].filter(Boolean).join(" ");
  return full || o.user?.email || "Unnamed Renter";
}

function roomStatusColor(
  room: Room,
  occupantCount: number,
  colors: ReturnType<typeof useTheme>["colors"]
): { bg: string; fg: string; label: string } {
  const max = Number(room.maxOccupants) || 2;
  const status = String(room.status ?? "ACTIVE").toUpperCase();
  if (status === "INACTIVE") {
    return { bg: colors.surfaceSecondary, fg: colors.secondary, label: "Inactive" };
  }
  if (occupantCount >= max && max > 0) {
    return { bg: colors.dangerLight, fg: colors.danger, label: "Full" };
  }
  if (occupantCount > 0) {
    return { bg: colors.warningLight, fg: colors.warning, label: `${occupantCount}/${max} Taken` };
  }
  return { bg: colors.successLight, fg: colors.success, label: "Empty Room" };
}

// ─── RoomsScreen ──────────────────────────────────────────────────────────────
export function RoomsScreen({
  rooms,
  renters,
  selectedHostel,
  showRoomModal,
  setShowRoomModal,
  roomNumber,
  setRoomNumber,
  roomFloor,
  setRoomFloor,
  roomCapacity = "2",
  setRoomCapacity,
  roomSaving,
  onAddRoom,
  onDeleteRoom,
  onRefresh,
  request,
  selectedHostelId,
}: RoomsScreenProps) {
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const numColumns = screenWidth >= 900 ? 4 : screenWidth >= 600 ? 3 : 2;
  const gridGap = 12;
  const availableGridWidth = Math.max(280, screenWidth - 32);
  const roomCardWidth = Math.floor(
    (availableGridWidth - (numColumns - 1) * gridGap) / numColumns,
  );

  // ── Detail sheet state ─────────────────────────────────────────────────────
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [occupants, setOccupants] = useState<Occupant[]>([]);
  const [occupantsLoading, setOccupantsLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Capacity state ─────────────────────────────────────────────────────────
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [localMaxOccupants, setLocalMaxOccupants] = useState(1);

  // ── Transfer state ─────────────────────────────────────────────────────────
  const [transferOccupant, setTransferOccupant] = useState<Occupant | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [showTransferPicker, setShowTransferPicker] = useState(false);

  // ── Derived occupant counts from renters list ─────────────────────────────
  const currentHostelId = selectedHostel?.id || selectedHostelId;
  const currentHostelRooms = React.useMemo(() => {
    return rooms.filter((r) => !currentHostelId || !r.hostelId || r.hostelId === currentHostelId);
  }, [rooms, currentHostelId]);

  const currentHostelRenters = React.useMemo(() => {
    return renters.filter((r) => !currentHostelId || !r.hostelId || r.hostelId === currentHostelId);
  }, [renters, currentHostelId]);

  // ── Derived occupant counts from renters list ─────────────────────────────
  const occupantCountMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of currentHostelRenters) {
      if (r.roomId && String(r.status ?? "ACTIVE").toUpperCase() === "ACTIVE") {
        map[r.roomId] = (map[r.roomId] ?? 0) + 1;
      }
    }
    return map;
  }, [currentHostelRenters]);

  // ── Combine backend occupants with local renters list for instant display ───
  const currentRoomOccupants = React.useMemo(() => {
    if (!selectedRoom) return [];
    const matchingRenters = currentHostelRenters.filter(
      (r) =>
        r.roomId === selectedRoom.id &&
        String(r.status ?? "ACTIVE").toUpperCase() === "ACTIVE"
    );

    const occupantIds = new Set(occupants.map((o) => o.id));
    const combined: Occupant[] = [...occupants];

    matchingRenters.forEach((r) => {
      if (!occupantIds.has(r.id)) {
        combined.push({
          id: r.id,
          userId: r.userId,
          status: r.status,
          joiningDate: r.joiningDate,
          monthlyFee: r.monthlyFee,
          securityDeposit: r.securityDeposit,
          guardianName: r.guardianName,
          guardianPhone: r.guardianPhone,
          user: {
            firstName:
              r.user?.firstName ||
              (r as any).name?.split(" ")[0] ||
              r.fullName?.split(" ")[0] ||
              "Resident",
            lastName:
              r.user?.lastName ||
              (r as any).name?.split(" ").slice(1).join(" ") ||
              r.fullName?.split(" ").slice(1).join(" ") ||
              "",
            email: r.user?.email || r.email || "No email",
            phone: r.user?.phone || r.phone || "",
          },
        });
      }
    });

    return combined;
  }, [selectedRoom, renters, occupants]);

  // ── Fetch occupants for a room ─────────────────────────────────────────────
  const loadOccupants = useCallback(
    async (room: Room) => {
      setOccupantsLoading(true);
      try {
        const res = await request<{ occupants: Occupant[] }>(
          `/hostels/${selectedHostelId}/rooms/${room.id}/occupants`
        );
        if (res?.occupants && Array.isArray(res.occupants) && res.occupants.length > 0) {
          setOccupants(res.occupants);
        }
      } catch {
        // Fallback to local renters already active in currentRoomOccupants
      } finally {
        setOccupantsLoading(false);
      }
    },
    [request, selectedHostelId]
  );

  function openRoomDetail(room: Room) {
    setSelectedRoom(room);
    setOccupants([]);  // Clear previous room's occupants to prevent cross-contamination
    setLocalMaxOccupants(room.maxOccupants ?? 2);
    setTransferOccupant(null);
    setTransferTargetId("");
    setShowTransferPicker(false);
    setDetailVisible(true);
    void loadOccupants(room);
  }

  // ── Update capacity ────────────────────────────────────────────────────────
  async function saveCapacity(newMax: number) {
    if (!selectedRoom) return;
    setCapacitySaving(true);
    try {
      await request(`/hostels/${selectedHostelId}/rooms/${selectedRoom.id}/capacity`, {
        method: "PATCH",
        body: JSON.stringify({ maxOccupants: newMax }),
      });
      setLocalMaxOccupants(newMax);
      // Patch the room in-memory so grid updates
      selectedRoom.maxOccupants = newMax;
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update capacity.");
    } finally {
      setCapacitySaving(false);
    }
  }

  function adjustCapacity(delta: number) {
    const next = Math.max(1, localMaxOccupants + delta);
    setLocalMaxOccupants(next);
    void saveCapacity(next);
  }

  // ── Transfer renter ────────────────────────────────────────────────────────
  async function doTransfer() {
    if (!selectedRoom || !transferOccupant || !transferTargetId) return;
    setTransferSaving(true);
    try {
      await request(`/hostels/${selectedHostelId}/rooms/${selectedRoom.id}/transfer`, {
        method: "PATCH",
        body: JSON.stringify({
          renterId: transferOccupant.id,
          targetRoomId: transferTargetId,
        }),
      });
      Alert.alert(
        "Transferred ✓",
        `${getOccupantName(transferOccupant)} has been moved to Room ${
          rooms.find((r) => r.id === transferTargetId)?.roomNumber ?? ""
        }.`
      );
      setTransferOccupant(null);
      setTransferTargetId("");
      setShowTransferPicker(false);
      await loadOccupants(selectedRoom);
      onRefresh();
    } catch (err) {
      Alert.alert("Transfer failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setTransferSaving(false);
    }
  }

  // ── Pull-to-refresh on detail ─────────────────────────────────────────────
  async function handleDetailRefresh() {
    if (!selectedRoom) return;
    setRefreshing(true);
    await loadOccupants(selectedRoom);
    onRefresh();
    setRefreshing(false);
  }

  // ── Grid stats & capacity ─────────────────────────────────────────────────
  const totalCapacity = currentHostelRooms.reduce((sum, r) => sum + (Number(r.maxOccupants) || 2), 0);
  const totalOccupants = Object.values(occupantCountMap).reduce((sum, count) => sum + count, 0);
  const availableCapacity = Math.max(0, totalCapacity - totalOccupants);

  const transferableRooms = currentHostelRooms.filter((r) => r.id !== selectedRoom?.id);

  // ── Sort rooms by floor then room number ──────────────────────────────────
  const sortedRooms = React.useMemo(() => {
    return [...currentHostelRooms].sort((a, b) => {
      const floorA = Number(a.floor ?? 0);
      const floorB = Number(b.floor ?? 0);
      if (floorA !== floorB) return floorA - floorB;
      const numA = parseInt(String(a.roomNumber), 10);
      const numB = parseInt(String(b.roomNumber), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a.roomNumber).localeCompare(String(b.roomNumber));
    });
  }, [currentHostelRooms]);

  // ── Filter rooms by search ────────────────────────────────────────────────
  const filteredRooms = React.useMemo(() => {
    if (!debouncedSearch.trim()) return sortedRooms;
    const q = debouncedSearch.trim().toLowerCase();
    return sortedRooms.filter((r) => {
      const rn = String(r.roomNumber).toLowerCase();
      const fl = r.floor !== undefined && r.floor !== null ? `floor ${r.floor}` : "ground floor";
      return rn.includes(q) || fl.includes(q);
    });
  }, [sortedRooms, debouncedSearch]);

  // ─────────────────────────────────────────────────────────────────────────
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

            {/* Header Top Bar: Hostella Brand + Title + Property Badge + Add CTA */}
            <View style={{ marginBottom: 8 }}>
              <HostellaBrand variant="full" colorScheme="dark" size="small" style={{ alignSelf: "flex-start" }} />
            </View>
            <View style={styles.heroHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Rooms</Text>
                <View style={styles.heroPropertyBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.heroPropertyText} numberOfLines={1}>
                    {selectedHostel?.name || "Hostella Property"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.heroAddBtn}
                onPress={() => {
                  haptic.medium();
                  setShowRoomModal(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={17} color="#FFFFFF" />
                <Text style={styles.heroAddBtnText}>Add Room</Text>
              </TouchableOpacity>
            </View>

            {/* Stats chips inside hero */}
            <View style={styles.heroStatsRow}>
              <View style={[styles.heroStatChip, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
                <Ionicons name="grid" size={13} color="#FFFFFF" />
                <Text style={[styles.heroStatChipText, { color: "#FFFFFF" }]}>
                  {currentHostelRooms.length} Rooms
                </Text>
              </View>

              <View style={[styles.heroStatChip, { backgroundColor: "rgba(16, 185, 129, 0.22)" }]}>
                <Ionicons name="people-outline" size={13} color="#34D399" />
                <Text style={[styles.heroStatChipText, { color: "#34D399" }]}>
                  {availableCapacity} Available
                </Text>
              </View>

              <View style={[styles.heroStatChip, { backgroundColor: "rgba(245, 158, 11, 0.22)" }]}>
                <Ionicons name="people" size={13} color="#FBBF24" />
                <Text style={[styles.heroStatChipText, { color: "#FBBF24" }]}>
                  {totalOccupants}/{totalCapacity} Occupants
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Floating Search Bar */}
          <View style={styles.floatingSearchWrap}>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={18} color={colors.secondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search room number, floor..."
                placeholderTextColor={colors.secondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={6}>
                  <Ionicons name="close-circle" size={18} color={colors.secondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ── Main Rooms Body ── */}
        <View style={styles.bodyContent}>
          <SectionTitle title={`All Rooms (${filteredRooms.length})`} />

          {/* Room grid */}
          {currentHostelRooms.length === 0 ? (
          <EmptyState
            icon="grid-outline"
            title="No rooms found"
            description="Add your first room to start tracking occupants."
          />
        ) : filteredRooms.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No matching rooms"
            description={`No rooms match "${searchQuery}". Try a different search.`}
          />
        ) : (
          <View style={styles.roomGrid}>
            {filteredRooms.map((room) => {
              const count = occupantCountMap[room.id] ?? 0;
              const max = room.maxOccupants ?? 0;
              const statusInfo = roomStatusColor(room, count, colors);
              const occupancyFraction = max > 0 ? Math.min(count / max, 1) : 0;

              return (
                <TouchableOpacity
                  key={room.id}
                  style={[styles.roomCard, { width: roomCardWidth, backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => {
                    haptic.cardPress();
                    openRoomDetail(room);
                  }}
                  activeOpacity={0.78}
                >
                  {/* Top row: Icon + Delete */}
                  <View style={styles.roomCardHeader}>
                    <View style={[styles.roomIconBox, { backgroundColor: statusInfo.bg }]}>
                      <Ionicons name="people-outline" size={18} color={statusInfo.fg} />
                    </View>
                    <TouchableOpacity
                      style={[styles.roomDeleteBtn, { backgroundColor: colors.dangerLight }]}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        haptic.heavy();
                        onDeleteRoom(room);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    </TouchableOpacity>
                  </View>

                  {/* Body */}
                  <View style={styles.roomCardBody}>
                    <Text style={[styles.roomNumber, { color: colors.text }]}>Room {room.roomNumber}</Text>
                    <Text style={[styles.roomFloor, { color: colors.secondary }]}>
                      {room.floor !== undefined && room.floor !== null
                        ? `Floor ${room.floor}`
                        : "Ground Floor"}
                    </Text>

                    {/* Occupancy Bar */}
                    {max > 0 && (
                      <View style={[styles.occupancyBarBg, { backgroundColor: colors.surfaceSecondary }]}>
                        <View
                          style={[
                            styles.occupancyBarFill,
                            {
                              width: `${occupancyFraction * 100}%`,
                              backgroundColor: statusInfo.fg,
                            },
                          ]}
                        />
                      </View>
                    )}

                    {/* Footer */}
                    <View style={styles.roomCardFooter}>
                      <Text style={[styles.occupantCount, { color: colors.secondary }]}>
                        {count}{max > 0 ? `/${max}` : ""} {count === 1 ? "occupant" : "occupants"}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusInfo.fg }]}>
                          {statusInfo.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </View>
      </ScrollView>

      {/* ── Add room modal ───────────────────────────────────────────────────── */}
      <Modal
        visible={showRoomModal}
        transparent
        animationType="slide"
        onRequestClose={() => !roomSaving && setShowRoomModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Add Room</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>{selectedHostel?.name || "Selected hostel"}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => setShowRoomModal(false)}
                >
                  <Ionicons name="close" size={20} color={colors.secondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: colors.text }]}>Room number *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={roomNumber}
                onChangeText={setRoomNumber}
                placeholder="e.g. 101"
                placeholderTextColor={colors.secondary}
                keyboardType="default"
              />

              <Text style={[styles.label, { color: colors.text }]}>Floor</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                value={roomFloor}
                onChangeText={setRoomFloor}
                placeholder="e.g. 1"
                placeholderTextColor={colors.secondary}
                keyboardType="numeric"
              />

              <Text style={[styles.label, { color: colors.text }]}>Occupants Capacity *</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
                {[
                  { value: "1", label: "1 Occupant" },
                  { value: "2", label: "2 Occupants" },
                  { value: "3", label: "3 Occupants" },
                  { value: "4", label: "4 Occupants" },
                ].map((opt) => {
                  const isSelected = roomCapacity === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setRoomCapacity?.(opt.value)}
                      style={[
                        {
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 10,
                          alignItems: "center",
                          backgroundColor: isSelected ? colors.primary : colors.surfaceSecondary,
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: isSelected ? "700" : "500",
                          color: isSelected ? "#FFFFFF" : colors.text,
                          textAlign: "center",
                        }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }, roomSaving && { opacity: 0.6 }]}
                disabled={roomSaving}
                onPress={onAddRoom}
              >
                {roomSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Add Room</Text>
                    <Ionicons name="checkmark" size={19} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Room detail modal ─────────────────────────────────────────── */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setDetailVisible(false)}
          />
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View
              style={[
                styles.modalCardLarge,
                { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              {/* Top Drag Indicator */}
              <View style={styles.modalDragPillWrap}>
                <View style={[styles.modalDragPill, { backgroundColor: colors.border }]} />
              </View>

              {/* Header */}
              <View style={[styles.modalHeader, { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16, marginBottom: 16 }]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                      Room {selectedRoom?.roomNumber}
                    </Text>
                    {selectedRoom && (
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: roomStatusColor(
                              selectedRoom,
                              currentRoomOccupants.length,
                              colors
                            ).bg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: roomStatusColor(
                                selectedRoom,
                                currentRoomOccupants.length,
                                colors
                              ).fg,
                            },
                          ]}
                        >
                          {roomStatusColor(
                            selectedRoom,
                            currentRoomOccupants.length,
                            colors
                          ).label}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.modalSubtitle, { color: colors.secondary, marginTop: 4 }]}>
                    {selectedRoom?.floor !== undefined && selectedRoom.floor !== null
                      ? `Floor ${selectedRoom.floor}`
                      : "Ground Floor"}{" "}
                    • {currentRoomOccupants.length}/{localMaxOccupants} occupants
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => setDetailVisible(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color={colors.secondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={handleDetailRefresh} />
                }
              >

                {/* ── Capacity control ─────────────────────────────────────── */}
                <View style={[styles.sectionBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={styles.sectionBoxHeader}>
                    <Ionicons name="people-outline" size={16} color={colors.primary} />
                    <Text style={[styles.sectionBoxTitle, { color: colors.text }]}>Maximum Capacity</Text>
                    {capacitySaving && (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />
                    )}
                  </View>
                  <View style={styles.capacityRow}>
                    <TouchableOpacity
                      style={[
                        styles.capacityBtn,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        localMaxOccupants <= 1 && styles.capacityBtnDisabled,
                      ]}
                      onPress={() => adjustCapacity(-1)}
                      disabled={localMaxOccupants <= 1 || capacitySaving}
                    >
                      <Ionicons
                        name="remove"
                        size={20}
                        color={localMaxOccupants <= 1 ? colors.secondary : colors.text}
                      />
                    </TouchableOpacity>
                    <View style={styles.capacityValueBox}>
                      <Text style={[styles.capacityValue, { color: colors.text }]}>{localMaxOccupants}</Text>
                      <Text style={[styles.capacityLabel, { color: colors.secondary }]}>max occupants</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.capacityBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => adjustCapacity(1)}
                      disabled={capacitySaving}
                    >
                      <Ionicons name="add" size={20} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Visual fill bar */}
                  <View style={[styles.capacityBarBg, { backgroundColor: colors.card }]}>
                    <View
                      style={[
                        styles.capacityBarFill,
                        {
                          width:
                            localMaxOccupants > 0
                              ? `${Math.min(
                                  (currentRoomOccupants.length / localMaxOccupants) * 100,
                                  100
                                )}%`
                              : "0%",
                          backgroundColor:
                            currentRoomOccupants.length >= localMaxOccupants
                              ? colors.danger
                              : colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.capacityHint, { color: colors.secondary }]}>
                    {currentRoomOccupants.length} of {localMaxOccupants} slots used
                  </Text>
                </View>

                {/* ── Room description ─────────────────────────────────────── */}
                {(selectedRoom?.description || selectedRoom?.amenities) && (
                  <View style={[styles.sectionBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <View style={styles.sectionBoxHeader}>
                      <Ionicons name="information-circle-outline" size={16} color={colors.purple} />
                      <Text style={[styles.sectionBoxTitle, { color: colors.text }]}>Room Details</Text>
                    </View>
                    {selectedRoom.description ? (
                      <Text style={[{ fontSize: 13, color: colors.secondary, lineHeight: 20, marginBottom: 6 }]}>
                        {selectedRoom.description}
                      </Text>
                    ) : null}
                    {selectedRoom.amenities ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {selectedRoom.amenities.split(",").map((a, i) => (
                          <View key={i} style={{ backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>{a.trim()}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )}

                {/* ── Occupants list ────────────────────────────────────────── */}
                <View style={[styles.sectionBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={styles.sectionBoxHeader}>
                    <Ionicons name="person-outline" size={16} color={colors.purple} />
                    <Text style={[styles.sectionBoxTitle, { color: colors.text }]}>
                      Current Occupants ({currentRoomOccupants.length})
                    </Text>
                  </View>

                  {occupantsLoading && currentRoomOccupants.length === 0 ? (
                    <View style={styles.occupantsLoader}>
                      <ActivityIndicator color={colors.primary} />
                      <Text style={[styles.occupantsLoaderText, { color: colors.secondary }]}>Loading occupants…</Text>
                    </View>
                  ) : currentRoomOccupants.length === 0 ? (
                    <View style={styles.emptyOccupants}>
                      <Ionicons name="home-outline" size={30} color={colors.border} />
                      <Text style={[styles.emptyOccupantsText, { color: colors.secondary }]}>No active occupants in this room</Text>
                    </View>
                  ) : (
                    currentRoomOccupants.map((occ, idx) => (
                      <View
                        key={occ.id}
                        style={[
                          styles.occupantRow,
                          idx < currentRoomOccupants.length - 1 && [styles.occupantRowBorder, { borderBottomColor: colors.border }],
                        ]}
                      >
                        <View style={[styles.occupantAvatar, { backgroundColor: colors.primaryLight }]}>
                          <Text style={[styles.occupantAvatarText, { color: colors.primary }]}>
                            {(occ.user?.firstName?.[0] || occ.user?.email?.[0] || "?").toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.occupantName, { color: colors.text }]}>{getOccupantName(occ)}</Text>
                          <Text style={[styles.occupantMeta, { color: colors.secondary }]}>
                            {occ.user?.phone || occ.user?.email || "No contact info"} • Joined {occ.joiningDate ?? "–"}
                          </Text>
                          {occ.monthlyFee !== null && occ.monthlyFee !== undefined && (
                            <Text style={[styles.occupantFee, { color: colors.success }]}>
                              ₹{Number(occ.monthlyFee).toLocaleString()}/mo
                            </Text>
                          )}
                        </View>
                        {/* Transfer button */}
                        <TouchableOpacity
                          style={[styles.transferBtn, { backgroundColor: colors.primaryLight }]}
                          onPress={() => {
                            setTransferOccupant(occ);
                            setTransferTargetId("");
                            setShowTransferPicker(true);
                          }}
                        >
                          <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
                          <Text style={[styles.transferBtnText, { color: colors.primary }]}>Move</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>

                {/* ── Transfer picker panel ─────────────────────────────────── */}
                {showTransferPicker && transferOccupant && (
                  <View style={[styles.transferPanel, { backgroundColor: isDark ? colors.surfaceSecondary : colors.primaryLight, borderColor: colors.primary }]}>
                    <View style={styles.transferPanelHeader}>
                      <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                      <Text style={[styles.transferPanelTitle, { color: colors.primary }]}>
                        Move {getOccupantName(transferOccupant)}
                      </Text>
                      <TouchableOpacity onPress={() => setShowTransferPicker(false)}>
                        <Ionicons name="close-circle" size={20} color={colors.secondary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.transferPanelSub, { color: colors.secondary }]}>Select destination room:</Text>

                    <ScrollView
                      style={styles.roomPickerList}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {transferableRooms.map((r) => {
                        const cnt = occupantCountMap[r.id] ?? 0;
                        const max = r.maxOccupants ?? 0;
                        const isFull = max > 0 && cnt >= max;
                        const isSelected = transferTargetId === r.id;
                        return (
                          <TouchableOpacity
                            key={r.id}
                            style={[
                              styles.roomPickerItem,
                              { backgroundColor: colors.card, borderColor: colors.border },
                              isSelected && [styles.roomPickerItemSelected, { borderColor: colors.primary, backgroundColor: isDark ? "#1E2A4A" : "#EFF6FF" }],
                              isFull && styles.roomPickerItemFull,
                            ]}
                            onPress={() => !isFull && setTransferTargetId(r.id)}
                            disabled={isFull}
                          >
                            <Ionicons
                              name="home-outline"
                              size={16}
                              color={
                                isFull
                                  ? colors.secondary
                                  : isSelected
                                  ? colors.primary
                                  : colors.text
                              }
                            />
                            <Text
                              style={[
                                styles.roomPickerItemText,
                                { color: colors.text },
                                isSelected && { color: colors.primary, fontWeight: "800" },
                                isFull && { color: colors.secondary },
                              ]}
                            >
                              Room {r.roomNumber}
                              {r.floor !== null && r.floor !== undefined
                                ? ` (F${r.floor})`
                                : ""}
                            </Text>
                            <Text
                              style={[
                                styles.roomPickerOccupancy,
                                { color: colors.secondary },
                                isFull && { color: colors.danger },
                              ]}
                            >
                              {cnt}
                              {max > 0 ? `/${max}` : ""}{" "}
                              {isFull ? "• Full" : ""}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      style={[
                        styles.transferConfirmBtn,
                        { backgroundColor: colors.primary },
                        (!transferTargetId || transferSaving) && { opacity: 0.5 },
                      ]}
                      disabled={!transferTargetId || transferSaving}
                      onPress={doTransfer}
                    >
                      {transferSaving ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={17} color="#FFFFFF" />
                          <Text style={styles.transferConfirmText}>Confirm Transfer</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── Room info & actions ────────────────────────────────────── */}
                <View style={[styles.sectionBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={styles.sectionBoxHeader}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                    <Text style={[styles.sectionBoxTitle, { color: colors.text }]}>Room Information</Text>
                  </View>
                  <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.infoKey, { color: colors.secondary }]}>Room Number</Text>
                    <Text style={[styles.infoVal, { color: colors.text }]}>{selectedRoom?.roomNumber}</Text>
                  </View>
                  <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.infoKey, { color: colors.secondary }]}>Floor</Text>
                    <Text style={[styles.infoVal, { color: colors.text }]}>
                      {selectedRoom?.floor !== undefined && selectedRoom.floor !== null
                        ? `Floor ${selectedRoom.floor}`
                        : "Ground Floor"}
                    </Text>
                  </View>
                  <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.infoKey, { color: colors.secondary }]}>Occupancy Status</Text>
                    <Text style={[styles.infoVal, { color: colors.text }]}>
                      {currentRoomOccupants.length >= localMaxOccupants
                        ? "Full Capacity"
                        : currentRoomOccupants.length > 0
                        ? "Partially Occupied"
                        : "Completely Available"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.deleteRoomBtn,
                      {
                        backgroundColor: colors.dangerLight,
                        opacity: currentRoomOccupants.length > 0 ? 0.45 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (!selectedRoom) return;
                      if (currentRoomOccupants.length > 0) {
                        Alert.alert(
                          "Room Occupied",
                          `Room ${selectedRoom.roomNumber} still has ${currentRoomOccupants.length} active occupants. Move them first before deleting the room.`
                        );
                        return;
                      }
                      setDetailVisible(false);
                      onDeleteRoom(selectedRoom);
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={[styles.deleteRoomBtnText, { color: colors.danger }]}>Delete Room</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────
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
  heroAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#3B5BFF",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  heroAddBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  heroStatsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  heroStatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroStatChipText: { fontSize: 12, fontWeight: "700" },

  // Floating search and body
  floatingSearchWrap: { paddingHorizontal: 16, marginTop: -24, zIndex: 10 },
  bodyContent: { paddingHorizontal: 16, marginTop: 14 },

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  // Room grid
  roomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  roomCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: COLORS.card,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roomCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  roomIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  roomCardBody: {
    gap: 3,
  },
  roomNumber: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  roomFloor: { fontSize: 11, color: COLORS.secondary },
  occupancyBarBg: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceSecondary,
    marginTop: 8,
    overflow: "hidden",
  },
  occupancyBarFill: {
    height: 5,
    borderRadius: 3,
  },
  roomCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  occupantCount: { fontSize: 11, fontWeight: "600" },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "800" },
  roomDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // Add room modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", justifyContent: "flex-end" },
  modalKeyboard: { width: "100%" },
  modalCard: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 36,
    maxHeight: "90%",
  },
  modalCardLarge: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 36,
    maxHeight: "90%",
  },
  modalDismissArea: { flex: 1 },
  modalDragPillWrap: {
    alignItems: "center",
    paddingVertical: 6,
    marginBottom: 6,
  },
  modalDragPill: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  modalSubtitle: { marginTop: 3, fontSize: 12, color: COLORS.secondary },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.grayFill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.text, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  // Detail sheet
  detailBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)" },
  detailDismissArea: { flex: 1 },
  detailSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  detailSubtitle: { fontSize: 12, color: COLORS.secondary, marginTop: 3 },
  detailContent: { padding: 20, paddingBottom: 40, gap: 14 },

  // Section box
  sectionBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    backgroundColor: COLORS.card,
    gap: 12,
    marginBottom: 16,
  },
  sectionBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sectionBoxTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text, flex: 1 },

  // Capacity
  capacityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  capacityBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.grayFill,
    alignItems: "center",
    justifyContent: "center",
  },
  capacityBtnDisabled: { opacity: 0.4 },
  capacityValueBox: { alignItems: "center" },
  capacityValue: { fontSize: 28, fontWeight: "900", color: COLORS.text },
  capacityLabel: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
  capacityBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.grayFill,
    overflow: "hidden",
  },
  capacityBarFill: {
    height: 6,
    borderRadius: 3,
  },
  capacityHint: { fontSize: 11, color: COLORS.secondary, textAlign: "center" },

  // Occupants
  occupantsLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  occupantsLoaderText: { color: COLORS.secondary, fontSize: 13 },
  emptyOccupants: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyOccupantsText: { color: COLORS.secondary, fontSize: 13 },
  occupantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  occupantRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  occupantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  occupantAvatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.primary,
  },
  occupantName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  occupantMeta: { fontSize: 11, color: COLORS.secondary, marginTop: 2 },
  occupantFee: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: "700",
    marginTop: 2,
  },
  transferBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  transferBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },

  // Transfer panel
  transferPanel: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 18,
    padding: 14,
    backgroundColor: COLORS.primaryLight,
    gap: 10,
  },
  transferPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  transferPanelTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
    flex: 1,
  },
  transferPanelSub: {
    fontSize: 12,
    color: COLORS.primaryDark,
  },
  roomPickerList: { maxHeight: 180 },
  roomPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginBottom: 6,
  },
  roomPickerItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: "#EFF6FF",
  },
  roomPickerItemFull: {
    opacity: 0.5,
  },
  roomPickerItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
  },
  roomPickerOccupancy: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: "600",
  },
  transferConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: COLORS.primary,
    borderRadius: 13,
    paddingVertical: 12,
  },
  transferConfirmText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  // Room info
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoKey: { fontSize: 13, color: COLORS.secondary },
  infoVal: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  deleteRoomBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
    backgroundColor: COLORS.dangerLight,
    borderRadius: 12,
    paddingVertical: 11,
  },
  deleteRoomBtnText: { color: COLORS.danger, fontWeight: "700", fontSize: 14 },
});
