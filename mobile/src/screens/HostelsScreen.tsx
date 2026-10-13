import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Hostel, Partner, User } from "../types";
import { Header, EmptyState } from "../components/common";
import { HostellaBrand } from "../components/HostellaBrand";
import { COLORS } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";
import { haptic } from "../utils/haptics";

interface HostelsScreenProps {
  hostels: Hostel[];
  selectedHostelId: string;
  currentUser?: User | null;
  onSelectHostel: (hostelId: string) => void;
  onRefresh: () => void;
  request?: <T>(path: string, options?: RequestInit) => Promise<T>;
  onBack?: () => void;
}

const PROPERTY_TYPES = ["Boys Hostel", "Girls Hostel", "Co-Living", "PG", "Apartment"];

export function HostelsScreen({
  hostels,
  selectedHostelId,
  currentUser,
  onSelectHostel,
  onRefresh,
  request,
  onBack,
}: HostelsScreenProps) {
  const { colors, isDark } = useTheme();

  const isPartner = currentUser?.role === "PARTNER";
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

  // Partner management modal state
  const [partnerHostel, setPartnerHostel] = useState<Hostel | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [showAddPartnerForm, setShowAddPartnerForm] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [partnerPassword, setPartnerPassword] = useState("");
  const [savingPartner, setSavingPartner] = useState(false);
  const [deletingPartnerId, setDeletingPartnerId] = useState<string | null>(null);

  const loadPartners = useCallback(
    async (hostelId: string) => {
      if (!request) return;
      setLoadingPartners(true);
      try {
        const res = await request<{ partners: Partner[] }>(`/hostels/${hostelId}/partners`);
        setPartners(res?.partners || []);
      } catch (err: any) {
        Alert.alert("Error", err.message || "Failed to load partners");
      } finally {
        setLoadingPartners(false);
      }
    },
    [request],
  );

  const openPartnerModal = (hostel: Hostel) => {
    setPartnerHostel(hostel);
    setShowAddPartnerForm(false);
    setPartnerName("");
    setPartnerEmail("");
    setPartnerPhone("");
    setPartnerPassword("");
    void loadPartners(hostel.id);
  };

  const handleAddPartner = async () => {
    if (!partnerHostel || !request) return;
    if (!partnerName.trim() || !partnerEmail.trim() || !partnerPassword.trim()) {
      Alert.alert("Required Fields", "Please enter partner name, email, and password.");
      return;
    }
    if (partnerPassword.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters.");
      return;
    }

    setSavingPartner(true);
    try {
      await request(`/hostels/${partnerHostel.id}/partners`, {
        method: "POST",
        body: JSON.stringify({
          name: partnerName.trim(),
          email: partnerEmail.trim().toLowerCase(),
          phone: partnerPhone.trim() || undefined,
          password: partnerPassword,
        }),
      });
      Alert.alert("Success", "Partner added successfully!");
      setPartnerName("");
      setPartnerEmail("");
      setPartnerPhone("");
      setPartnerPassword("");
      setShowAddPartnerForm(false);
      void loadPartners(partnerHostel.id);
    } catch (err: any) {
      Alert.alert("Failed to Add Partner", err.message || "Could not add partner");
    } finally {
      setSavingPartner(false);
    }
  };

  const handleRemovePartner = (partner: Partner) => {
    if (!partnerHostel || !request) return;
    Alert.alert(
      "Remove Partner",
      `Are you sure you want to remove ${partner.name || partner.email} as a partner for this hostel?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeletingPartnerId(partner.id);
            try {
              await request(`/hostels/${partnerHostel.id}/partners/${partner.id}`, {
                method: "DELETE",
              });
              Alert.alert("Success", "Partner removed successfully");
              void loadPartners(partnerHostel.id);
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to remove partner");
            } finally {
              setDeletingPartnerId(null);
            }
          },
        },
      ],
    );
  };

  // Add hostel modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Boys Hostel");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [pincode, setPincode] = useState("");

  const currentHostel = hostels.find((h) => h.id === selectedHostelId) || hostels[0];

  async function handleCreateHostel() {
    if (isPartner) {
      Alert.alert("Permission Denied", "Partners cannot add properties.");
      return;
    }

    if (!name.trim()) {
      Alert.alert("Missing Name", "Please enter a hostel or property name.");
      return;
    }

    if (!request) {
      Alert.alert("Error", "Network client is not initialized.");
      return;
    }

    setSaving(true);
    try {
      const res = await request<{ message: string; hostel: Hostel }>("/hostels", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type: type.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          contactEmail: contactEmail.trim().toLowerCase() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: stateVal.trim() || undefined,
          pincode: pincode.trim() || undefined,
        }),
      });

      setShowAddModal(false);
      const createdName = name.trim();
      setName("");
      setContactPhone("");
      setContactEmail("");
      setAddress("");
      setCity("");
      setStateVal("");
      setPincode("");

      onRefresh();

      if (res?.hostel?.id) {
        onSelectHostel(res.hostel.id);
      }

      Alert.alert(
        "Property Added",
        `"${createdName}" has been successfully added to your Hostella portfolio.`
      );
    } catch (err: any) {
      const msg = err?.message || (typeof err === "string" ? err : "Please check your network and try again.");
      Alert.alert("Unable to Add Hostel", msg);
    } finally {
      setSaving(false);
    }
  }

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Sort hostels alphabetically by name
  const sortedHostels = React.useMemo(() => {
    return [...hostels].sort((a, b) => a.name.localeCompare(b.name));
  }, [hostels]);

  // Filter hostels by search
  const filteredHostels = React.useMemo(() => {
    if (!searchQuery.trim()) return sortedHostels;
    const q = searchQuery.trim().toLowerCase();
    return sortedHostels.filter((h) => {
      return (
        h.name.toLowerCase().includes(q) ||
        (h.city || "").toLowerCase().includes(q) ||
        (h.state || "").toLowerCase().includes(q) ||
        (h.type || "").toLowerCase().includes(q) ||
        (h.address || "").toLowerCase().includes(q)
      );
    });
  }, [sortedHostels, searchQuery]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
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
              {onBack ? (
                <TouchableOpacity
                  style={styles.heroBackBtn}
                  onPress={onBack}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Properties</Text>
                <View style={styles.heroPropertyBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.heroPropertyText} numberOfLines={1}>
                    {currentHostel?.name ? `Managing: ${currentHostel.name}` : "Hostella"}
                  </Text>
                </View>
              </View>
            </View>

            {isPartner ? (
              <View style={[styles.heroPartnerChip]}>
                <Ionicons name="shield-checkmark" size={13} color="#FBBF24" />
                <Text style={styles.heroPartnerChipText}>Partner Access</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.heroAddBtn}
                onPress={() => {
                  haptic.medium();
                  setShowAddModal(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={17} color="#FFFFFF" />
                <Text style={styles.heroAddBtnText}>Add Property</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Stats Chips inside Hero */}
          <View style={styles.heroStatsRow}>
            <View style={[styles.heroStatChip, { backgroundColor: "rgba(255,255,255,0.14)" }]}>
              <Ionicons name="business" size={13} color="#FFFFFF" />
              <Text style={[styles.heroStatChipText, { color: "#FFFFFF" }]}>
                {hostels.length} {hostels.length === 1 ? "Property" : "Properties"}
              </Text>
            </View>

            {currentHostel?.type ? (
              <View style={[styles.heroStatChip, { backgroundColor: "rgba(59, 130, 246, 0.25)" }]}>
                <Ionicons name="pricetag" size={13} color="#93C5FD" />
                <Text style={[styles.heroStatChipText, { color: "#93C5FD" }]}>
                  {currentHostel.type}
                </Text>
              </View>
            ) : null}

            <View style={[styles.heroStatChip, { backgroundColor: "rgba(16, 185, 129, 0.22)" }]}>
              <Ionicons name="checkmark-circle" size={13} color="#34D399" />
              <Text style={[styles.heroStatChipText, { color: "#34D399" }]}>
                Active & Synced
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Floating Active Property Card (Overlaps the bottom half of the hero) */}
        {currentHostel && (
          <View style={styles.floatingActiveWrap}>
            <View
              style={[
                styles.heroActiveCard,
                {
                  backgroundColor: colors.card,
                  borderColor: isDark ? "rgba(59, 130, 246, 0.4)" : colors.border,
                  borderWidth: 1.5,
                },
              ]}
            >
              <View style={styles.heroActiveTop}>
                <View
                  style={[
                    styles.heroActiveIconBox,
                    { backgroundColor: isDark ? "rgba(59,130,246,0.18)" : colors.primaryLight },
                  ]}
                >
                  <Ionicons name="business" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.heroActiveName, { color: colors.text }]} numberOfLines={1}>
                      {currentHostel.name}
                    </Text>
                  </View>
                  <View style={styles.activeBadgeRow}>
                    <View style={[styles.activeLiveBadge, { backgroundColor: colors.successLight }]}>
                      <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                      <Text style={[styles.activeLiveBadgeText, { color: colors.success }]}>
                        Managing Now
                      </Text>
                    </View>
                    {currentHostel.type ? (
                      <View style={[styles.typePill, { backgroundColor: colors.surfaceSecondary }]}>
                        <Text style={[styles.typePillText, { color: colors.secondary }]}>
                          {currentHostel.type}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={[styles.heroDetailsBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                {currentHostel.address ? (
                  <View style={styles.detailLine}>
                    <Ionicons name="location-outline" size={14} color={colors.secondary} />
                    <Text style={[styles.detailLineText, { color: colors.secondary }]} numberOfLines={1}>
                      {currentHostel.address}
                      {currentHostel.city ? `, ${currentHostel.city}` : ""}
                      {currentHostel.state ? `, ${currentHostel.state}` : ""}
                    </Text>
                  </View>
                ) : null}
                {currentHostel.contactPhone ? (
                  <View style={styles.detailLine}>
                    <Ionicons name="call-outline" size={14} color={colors.secondary} />
                    <Text style={[styles.detailLineText, { color: colors.secondary }]}>
                      {currentHostel.contactPhone}
                    </Text>
                  </View>
                ) : null}

                {isAdmin && (
                  <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "flex-end" }}>
                    <TouchableOpacity
                      style={[
                        styles.heroManagePartnersBtn,
                        {
                          backgroundColor: isDark ? "rgba(59, 130, 246, 0.14)" : "#EFF6FF",
                          borderColor: isDark ? "rgba(59, 130, 246, 0.3)" : "#BFDBFE",
                        },
                      ]}
                      onPress={() => {
                        haptic.medium();
                        openPartnerModal(currentHostel);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.heroManagePartnersIconBox, { backgroundColor: isDark ? "rgba(59, 130, 246, 0.22)" : "#DBEAFE" }]}>
                        <Ionicons name="people" size={13} color={colors.primary} />
                      </View>
                      <Text style={[styles.heroManagePartnersBtnText, { color: colors.primary }]}>
                        Manage Partners
                      </Text>
                      <Ionicons name="chevron-forward" size={13} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </View>

      {/* ── Main Properties Body ── */}
      <View style={styles.mainHostelsBody}>

      {/* ── Search Bar ────────────────────────────────────────────────── */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.secondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name, city, state, or type..."
          placeholderTextColor={colors.secondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.secondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Section 2: All Properties ───────────────────────────────────── */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionDividerLabel, { color: colors.secondary }]}>
            ALL PROPERTIES ({filteredHostels.length})
          </Text>
        </View>

        {hostels.length === 0 ? (
          <EmptyState
            icon="business-outline"
            title="No hostels found"
            description="Add your first hostel above to begin managing rooms, residents, and fees."
          />
        ) : filteredHostels.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No matching properties"
            description={`No properties match "${searchQuery}". Try a different search.`}
          />
        ) : (
          filteredHostels.map((hostel) => {
            const isSelected = hostel.id === selectedHostelId;
            return (
              <View
                key={hostel.id}
                style={[
                  styles.hostelCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}
              >
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                  onPress={() => {
                    haptic.cardPress();
                    onSelectHostel(hostel.id);
                  }}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.hostelIcon,
                      {
                        backgroundColor: isSelected
                          ? colors.primaryLight
                          : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isSelected ? "business" : "business-outline"}
                      size={22}
                      color={isSelected ? colors.primary : colors.secondary}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={[styles.hostelName, { color: colors.text }]} numberOfLines={1}>
                        {hostel.name}
                      </Text>
                      {isSelected && (
                        <View style={[styles.selectedMiniBadge, { backgroundColor: colors.successLight }]}>
                          <View style={[styles.liveDotSmall, { backgroundColor: colors.success }]} />
                          <Text style={[styles.selectedMiniText, { color: colors.success }]}>Active</Text>
                        </View>
                      )}
                    </View>

                    <Text style={[styles.hostelLocation, { color: colors.secondary }]} numberOfLines={1}>
                      {hostel.city || hostel.address || "Location not set"}
                      {hostel.city && hostel.state ? `, ${hostel.state}` : ""}
                    </Text>

                    {/* Type + Contact row */}
                    <View style={styles.hostelMetaRow}>
                      {hostel.type ? (
                        <View style={[styles.hostelTypePill, { backgroundColor: colors.surfaceSecondary }]}>
                          <Text style={[styles.hostelTypePillText, { color: colors.secondary }]}>{hostel.type}</Text>
                        </View>
                      ) : null}
                      {hostel.contactPhone ? (
                        <View style={styles.hostelMetaItem}>
                          <Ionicons name="call-outline" size={11} color={colors.secondary} />
                          <Text style={[styles.hostelMetaText, { color: colors.secondary }]}>{hostel.contactPhone}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[
                        styles.managePartnersBtn,
                        {
                          backgroundColor: isDark ? "rgba(59, 130, 246, 0.16)" : "#EFF6FF",
                          borderColor: isDark ? "rgba(59, 130, 246, 0.35)" : "#BFDBFE",
                        },
                      ]}
                      onPress={() => {
                        haptic.medium();
                        openPartnerModal(hostel);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="people-outline" size={13} color={colors.primary} />
                      <Text style={[styles.managePartnersBtnText, { color: colors.primary }]}>
                        Partners
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      haptic.cardPress();
                      onSelectHostel(hostel.id);
                    }}
                    style={styles.hostelRightAction}
                    hitSlop={8}
                  >
                    {isSelected ? (
                      <View style={[styles.selectedIndicator, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="checkmark" size={16} color={colors.primary} />
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
      </View>

      {/* ── Add Hostel Modal ────────────────────────────────────────────── */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 18 }}
            keyboardShouldPersistTaps="handled"
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
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.modalHeaderIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="business" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Add New Property</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalSub, { color: colors.secondary }]}>
                Register a hostel or apartment building to manage with Hostella.
              </Text>

              {/* Name */}
              <Text style={[styles.inputLabel, { color: colors.text }]}>Hostel Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Nexa Royal Boys Hostel"
                placeholderTextColor={colors.secondary}
              />

              {/* Type pills */}
              <Text style={[styles.inputLabel, { color: colors.text }]}>Property Type</Text>
              <View style={styles.typeSelectorRow}>
                {PROPERTY_TYPES.map((pt) => {
                  const active = type === pt;
                  return (
                    <TouchableOpacity
                      key={pt}
                      style={[
                        styles.typePillBtn,
                        active
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                      ]}
                      onPress={() => setType(pt)}
                    >
                      <Text
                        style={[
                          styles.typePillBtnText,
                          { color: active ? "#FFFFFF" : colors.secondary },
                        ]}
                      >
                        {pt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Phone & Email */}
              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Phone Number</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text },
                    ]}
                    value={contactPhone}
                    onChangeText={setContactPhone}
                    placeholder="e.g. 9876543210"
                    placeholderTextColor={colors.secondary}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Contact Email</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text },
                    ]}
                    value={contactEmail}
                    onChangeText={setContactEmail}
                    placeholder="hostel@example.com"
                    placeholderTextColor={colors.secondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Address */}
              <Text style={[styles.inputLabel, { color: colors.text }]}>Street Address</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text },
                ]}
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. Plot 42, Hitech City Main Rd"
                placeholderTextColor={colors.secondary}
              />

              {/* City, State, Pincode */}
              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>City</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text },
                    ]}
                    value={city}
                    onChangeText={setCity}
                    placeholder="e.g. Hyderabad"
                    placeholderTextColor={colors.secondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>State</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text },
                    ]}
                    value={stateVal}
                    onChangeText={setStateVal}
                    placeholder="e.g. Telangana"
                    placeholderTextColor={colors.secondary}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Pincode</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text },
                ]}
                value={pincode}
                onChangeText={setPincode}
                placeholder="e.g. 500081"
                placeholderTextColor={colors.secondary}
                keyboardType="numeric"
              />

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setShowAddModal(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    { backgroundColor: colors.primary },
                    saving && { opacity: 0.6 },
                  ]}
                  onPress={handleCreateHostel}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Create Hostel</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Manage Partners Modal ────────────────────────────────────────── */}
      <Modal visible={partnerHostel !== null} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 18 }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: isDark ? 1 : 0,
                  maxHeight: "88%",
                },
              ]}
            >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <View style={[styles.modalHeaderIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="people" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
                    Hostel Partners
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: colors.secondary }]} numberOfLines={1}>
                    {partnerHostel?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPartnerHostel(null);
                  setShowAddPartnerForm(false);
                }}
                hitSlop={8}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Info Notice Banner */}
            <View
              style={[
                styles.partnerInfoBanner,
                {
                  backgroundColor: isDark ? "rgba(59, 130, 246, 0.12)" : "#EFF6FF",
                  borderColor: isDark ? "rgba(59, 130, 246, 0.3)" : "#BFDBFE",
                },
              ]}
            >
              <View style={[styles.partnerInfoIconBox, { backgroundColor: isDark ? "rgba(59, 130, 246, 0.2)" : "#DBEAFE" }]}>
                <Ionicons name="information-circle" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.partnerInfoBannerText, { color: colors.text }]}>
                Partners have full access to manage rooms, renters, fees, payments, and repairs for this hostel only. They cannot create new properties.
              </Text>
            </View>

            {/* Actions Bar */}
            <View style={styles.partnerSectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.partnerSectionTitle, { color: colors.secondary }]}>
                  ASSIGNED PARTNERS
                </Text>
                <View style={[styles.partnerCountBadge, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.partnerCountBadgeText, { color: colors.secondary }]}>
                    {partners.length}
                  </Text>
                </View>
              </View>

              {!showAddPartnerForm && (
                <TouchableOpacity
                  style={[styles.addPartnerToggleBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={() => {
                    haptic.light();
                    setShowAddPartnerForm(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle" size={15} color={colors.primary} />
                  <Text style={[styles.addPartnerToggleText, { color: colors.primary }]}>
                    Add Partner
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Scrollable Content: Add Form + Partners List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {showAddPartnerForm && (
                <View
                  style={[
                    styles.addPartnerFormCard,
                    {
                      backgroundColor: colors.surfaceSecondary,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="person-add" size={17} color={colors.primary} />
                      <Text style={[styles.addPartnerFormHeading, { color: colors.text }]}>
                        New Partner Account
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowAddPartnerForm(false)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.secondary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>Full Name *</Text>
                  <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="person-outline" size={16} color={colors.secondary} />
                    <TextInput
                      style={[styles.inputWithIconField, { color: colors.text }]}
                      value={partnerName}
                      onChangeText={setPartnerName}
                      placeholder="e.g. Rahul Sharma"
                      placeholderTextColor={colors.secondary}
                    />
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>Email Address *</Text>
                  <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="mail-outline" size={16} color={colors.secondary} />
                    <TextInput
                      style={[styles.inputWithIconField, { color: colors.text }]}
                      value={partnerEmail}
                      onChangeText={setPartnerEmail}
                      placeholder="partner@example.com"
                      placeholderTextColor={colors.secondary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>Phone Number (Optional)</Text>
                  <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="call-outline" size={16} color={colors.secondary} />
                    <TextInput
                      style={[styles.inputWithIconField, { color: colors.text }]}
                      value={partnerPhone}
                      onChangeText={setPartnerPhone}
                      placeholder="e.g. +91 9876543210"
                      placeholderTextColor={colors.secondary}
                      keyboardType="phone-pad"
                    />
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.text }]}>Login Password * (Min 6 chars)</Text>
                  <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.secondary} />
                    <TextInput
                      style={[styles.inputWithIconField, { color: colors.text }]}
                      value={partnerPassword}
                      onChangeText={setPartnerPassword}
                      placeholder="Enter partner password"
                      placeholderTextColor={colors.secondary}
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.addPartnerActionsRow}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { borderColor: colors.border }]}
                      onPress={() => setShowAddPartnerForm(false)}
                      disabled={savingPartner}
                    >
                      <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                      onPress={handleAddPartner}
                      disabled={savingPartner}
                    >
                      {savingPartner ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name="checkmark-sharp" size={16} color="#FFFFFF" />
                          <Text style={styles.saveBtnText}>Save Partner</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {loadingPartners ? (
                <View style={{ paddingVertical: 36, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ marginTop: 10, color: colors.secondary, fontSize: 13, fontWeight: "500" }}>
                    Loading partners...
                  </Text>
                </View>
              ) : partners.length === 0 ? (
                <View style={styles.emptyPartnersBox}>
                  <View style={[styles.emptyPartnersIconCircle, { backgroundColor: isDark ? "rgba(59, 130, 246, 0.12)" : "#EFF6FF", borderColor: isDark ? "rgba(59, 130, 246, 0.28)" : "#DBEAFE" }]}>
                    <Ionicons name="people-outline" size={34} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyPartnersTitle, { color: colors.text }]}>
                    No Partners Added Yet
                  </Text>
                  <Text style={[styles.emptyPartnersSub, { color: colors.secondary }]}>
                    Invite co-owners or staff managers to help run this property together. They will get access to manage rooms, renters, fees, and repairs.
                  </Text>
                  {!showAddPartnerForm && (
                    <TouchableOpacity
                      style={[styles.addFirstPartnerBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        haptic.light();
                        setShowAddPartnerForm(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="person-add" size={15} color="#FFFFFF" />
                      <Text style={styles.addFirstPartnerBtnText}>Add First Partner</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                partners.map((p) => {
                  const isDeleting = deletingPartnerId === p.id;
                  const partnerInitials = (p.name
                    ? p.name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("")
                    : p.email?.[0] || "P").toUpperCase();

                  return (
                    <View
                      key={p.id}
                      style={[
                        styles.partnerItemCard,
                        {
                          backgroundColor: isDark ? colors.surfaceSecondary : "#FFFFFF",
                          borderColor: isDark ? "rgba(255, 255, 255, 0.09)" : "rgba(0, 0, 0, 0.06)",
                        },
                      ]}
                    >
                      {/* Top Header: Monogram Avatar, Name, Role Badge, Delete Button */}
                      <View style={styles.partnerCardHeader}>
                        <LinearGradient
                          colors={isDark ? ["#4F46E5", "#3B82F6"] : ["#3B82F6", "#2563EB"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.partnerAvatarGradient}
                        >
                          <Text style={styles.partnerAvatarText}>{partnerInitials}</Text>
                        </LinearGradient>

                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.partnerItemName, { color: colors.text }]} numberOfLines={1}>
                            {p.name || "Hostel Partner"}
                          </Text>

                          <View style={styles.partnerRoleBadge}>
                            <View style={styles.partnerActiveDot} />
                            <Text style={styles.partnerRoleText}>CO-OWNER / PARTNER</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.deletePartnerBtn,
                            {
                              backgroundColor: isDark ? "rgba(239, 68, 68, 0.14)" : "#FEF2F2",
                              borderColor: isDark ? "rgba(239, 68, 68, 0.3)" : "#FECACA",
                            },
                          ]}
                          onPress={() => handleRemovePartner(p)}
                          disabled={isDeleting}
                          hitSlop={8}
                          activeOpacity={0.7}
                        >
                          {isDeleting ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                          ) : (
                            <Ionicons name="trash-outline" size={17} color={colors.danger} />
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Contact Info Rows */}
                      <View style={[styles.partnerContactSection, { borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)" }]}>
                        <View style={styles.partnerContactRow}>
                          <Ionicons name="mail-outline" size={13} color={colors.primary} />
                          <Text style={[styles.partnerContactText, { color: colors.secondary }]} numberOfLines={1}>
                            {p.email}
                          </Text>
                        </View>
                        {p.phone ? (
                          <View style={styles.partnerContactRow}>
                            <Ionicons name="call-outline" size={13} color="#10B981" />
                            <Text style={[styles.partnerContactText, { color: colors.secondary }]}>
                              {p.phone}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Permissions Scope Tag */}
                      <View style={styles.partnerScopeFooter}>
                        <View style={[styles.partnerScopePill, { backgroundColor: isDark ? "rgba(59, 130, 246, 0.12)" : "#EFF6FF" }]}>
                          <Ionicons name="shield-checkmark" size={11} color={colors.primary} />
                          <Text style={[styles.partnerScopeText, { color: colors.primary }]}>
                            Full Property Access
                          </Text>
                        </View>
                        {p.assignedAt ? (
                          <Text style={[styles.partnerDateText, { color: colors.secondary }]}>
                            Added {new Date(p.assignedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingBottom: 110 },
  heroContainer: {
    width: "100%",
    marginBottom: 4,
  },
  heroBannerGradient: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 18 : 14,
    paddingBottom: 68,
    minHeight: 180,
    position: "relative",
    overflow: "hidden",
  },
  floatingActiveWrap: {
    paddingHorizontal: 16,
    marginTop: -52,
    zIndex: 10,
    marginBottom: 8,
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
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    zIndex: 2,
  },
  heroStatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
  },
  heroStatChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  mainHostelsBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addPropertyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addPropertyBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sectionWrap: {
    marginBottom: 20,
  },
  sectionDividerLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // Active Managing Hero Card
  heroActiveCard: {
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroActiveTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  heroActiveIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroActiveName: {
    fontSize: 17,
    fontWeight: "800",
  },
  activeBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  activeLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeLiveBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  heroDetailsBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  detailLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailLineText: {
    fontSize: 12,
  },

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

  // General Hostel Card
  hostelCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hostelIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  hostelName: {
    fontSize: 15,
    fontWeight: "800",
  },
  selectedMiniBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  selectedMiniText: {
    fontSize: 10,
    fontWeight: "800",
  },
  hostelLocation: {
    marginTop: 2,
    fontSize: 12,
  },
  hostelMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  hostelTypePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostelTypePillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  hostelMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  hostelMetaText: {
    fontSize: 10,
    fontWeight: "600",
  },
  hostelRightAction: {
    marginLeft: 8,
  },
  selectedIndicator: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 22,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  modalHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  modalSub: {
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 17,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  typeSelectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  typePillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  typePillBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  twoColRow: {
    flexDirection: "row",
    gap: 10,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
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
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroPartnerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(245, 158, 11, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  heroPartnerChipText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "700",
  },
  heroManagePartnersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  heroManagePartnersIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  heroManagePartnersBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  managePartnersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  managePartnersBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  partnerInfoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  partnerInfoIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  partnerInfoBannerText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
    fontWeight: "500",
  },
  partnerSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  partnerSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  partnerCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  partnerCountBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  addPartnerToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
  },
  addPartnerToggleText: {
    fontSize: 12,
    fontWeight: "700",
  },
  addPartnerFormCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  addPartnerFormHeading: {
    fontSize: 15,
    fontWeight: "800",
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  inputWithIconField: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
  },
  addPartnerActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  emptyPartnersBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  emptyPartnersIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyPartnersTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  emptyPartnersSub: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  addFirstPartnerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    elevation: 2,
  },
  addFirstPartnerBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  partnerItemCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  partnerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  partnerAvatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerAvatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  partnerItemName: {
    fontSize: 15,
    fontWeight: "800",
  },
  partnerRoleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  partnerActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  partnerRoleText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#10B981",
    letterSpacing: 0.5,
  },
  deletePartnerBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  partnerContactSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  partnerContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  partnerContactText: {
    fontSize: 12,
    fontWeight: "500",
  },
  partnerScopeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 8,
  },
  partnerScopePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  partnerScopeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  partnerDateText: {
    fontSize: 11,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
