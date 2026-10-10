import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";
import { API_URL, parseJsonResponse } from "../services/api";
import { AdminAccount, Hostel, PlatformOverview } from "../types";

interface SuperAdminModalProps {
  visible: boolean;
  onClose: () => void;
  token: string | null;
  currentUserId: string;
  hostels: Hostel[];
  onRefreshHostels?: () => void;
}

export function SuperAdminModal({
  visible,
  onClose,
  token,
  currentUserId,
  hostels,
  onRefreshHostels,
}: SuperAdminModalProps) {
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Add Admin modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);

  // Assign Hostel modal
  const [assigningAdmin, setAssigningAdmin] = useState<AdminAccount | null>(null);
  const [assigningHostelId, setAssigningHostelId] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const [overviewRes, adminsRes] = await Promise.all([
        fetch(`${API_URL}/auth/super-admin/platform-overview`, { headers }),
        fetch(`${API_URL}/auth/admins`, { headers }),
      ]);

      if (overviewRes.ok) {
        const oData = (await parseJsonResponse(overviewRes)) as PlatformOverview;
        setOverview(oData);
      }

      if (adminsRes.ok) {
        const aData = (await parseJsonResponse(adminsRes)) as { admins: AdminAccount[] };
        setAdmins(aData.admins || []);
      }
    } catch (err) {
      console.warn("Error loading super admin data:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (visible) {
      void loadData();
    }
  }, [visible, loadData]);

  const handleCreateAdmin = async () => {
    if (!newFirstName.trim() || !newEmail.trim() || !newPassword.trim()) {
      Alert.alert("Missing Fields", "First name, email, and password are required.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters.");
      return;
    }

    setSavingAdmin(true);
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

      const data = (await parseJsonResponse(res)) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || "Failed to create administrator");
      }

      Alert.alert("Success", `Administrator account for ${newEmail} created successfully.`);
      setShowAddModal(false);
      setNewFirstName("");
      setNewLastName("");
      setNewEmail("");
      setNewPhone("");
      setNewPassword("");
      void loadData();
    } catch (err: any) {
      Alert.alert("Creation Error", err.message || "Unable to create administrator.");
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleToggleStatus = async (admin: AdminAccount) => {
    if (admin.id === currentUserId) {
      Alert.alert("Action Prohibited", "You cannot deactivate your own Super Admin account.");
      return;
    }

    const nextStatus = admin.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await fetch(`${API_URL}/auth/admins/${admin.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const d = (await parseJsonResponse(res)) as any;
        throw new Error(d.message || "Failed to update status");
      }

      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, status: nextStatus } : a))
      );
    } catch (err: any) {
      Alert.alert("Status Error", err.message || "Could not update status.");
    }
  };

  const handleDeleteAdmin = (admin: AdminAccount) => {
    if (admin.id === currentUserId) {
      Alert.alert("Action Prohibited", "You cannot delete your own Super Admin account.");
      return;
    }

    Alert.alert(
      "Delete Administrator",
      `Are you sure you want to permanently remove ${admin.firstName} ${admin.lastName || ""}? They will lose access to all managed hostels.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/auth/admins/${admin.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                const d = (await parseJsonResponse(res)) as any;
                throw new Error(d.message || "Failed to remove admin");
              }
              setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
              Alert.alert("Removed", "Administrator has been deleted.");
              onRefreshHostels?.();
            } catch (err: any) {
              Alert.alert("Delete Error", err.message || "Could not delete administrator.");
            }
          },
        },
      ]
    );
  };

  const handleAssignHostel = async () => {
    if (!assigningAdmin || !assigningHostelId) {
      Alert.alert("Select Property", "Please choose a property to assign.");
      return;
    }

    setSavingAssignment(true);
    try {
      const res = await fetch(`${API_URL}/hostels/${assigningHostelId}/admin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ adminId: assigningAdmin.id }),
      });

      const data = (await parseJsonResponse(res)) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || "Failed to assign property");
      }

      Alert.alert("Success", "Property assigned to administrator.");
      setAssigningAdmin(null);
      setAssigningHostelId("");
      void loadData();
      onRefreshHostels?.();
    } catch (err: any) {
      Alert.alert("Assignment Error", err.message || "Could not assign property.");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleRemoveHostelAssignment = (hostelId: string, adminName: string) => {
    Alert.alert(
      "Unassign Property",
      `Remove ${adminName}'s management assignment for this property?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unassign",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/hostels/${hostelId}/admin`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                const d = (await parseJsonResponse(res)) as any;
                throw new Error(d.message || "Failed to unassign");
              }
              void loadData();
              onRefreshHostels?.();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not unassign property.");
            }
          },
        },
      ]
    );
  };

  const filteredAdmins = admins.filter((a) => {
    const q = searchQuery.toLowerCase();
    const name = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
    const em = (a.email || "").toLowerCase();
    return name.includes(q) || em.includes(q);
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Top Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.badgePill, { backgroundColor: isDark ? "#312E81" : "#EEF2FF" }]}>
              <Ionicons name="shield-checkmark" size={13} color="#6366F1" />
              <Text style={styles.badgeText}>SUPER ADMIN HUB</Text>
            </View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Platform Control</Text>
          </View>
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Platform KPI Overview */}
          {overview && (
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: "#EEF2FF" }]}>
                  <Ionicons name="business" size={18} color="#4F46E5" />
                </View>
                <Text style={[styles.kpiVal, { color: colors.text }]}>{overview.totalHostels}</Text>
                <Text style={[styles.kpiLbl, { color: colors.secondary }]}>Total Hostels</Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: "#ECFDF5" }]}>
                  <Ionicons name="people" size={18} color="#059669" />
                </View>
                <Text style={[styles.kpiVal, { color: colors.text }]}>{overview.totalAdmins}</Text>
                <Text style={[styles.kpiLbl, { color: colors.secondary }]}>
                  {overview.activeAdmins} Active Admins
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="people" size={18} color="#D97706" />
                </View>
                <Text style={[styles.kpiVal, { color: colors.text }]}>{overview.totalBeds}</Text>
                <Text style={[styles.kpiLbl, { color: colors.secondary }]}>
                  Capacity in {overview.totalRooms} Rooms
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: "#FDF2F8" }]}>
                  <Ionicons name="person-circle" size={18} color="#DB2777" />
                </View>
                <Text style={[styles.kpiVal, { color: colors.text }]}>{overview.totalActiveRenters}</Text>
                <Text style={[styles.kpiLbl, { color: colors.secondary }]}>Active Residents</Text>
              </View>
            </View>
          )}

          {/* Section: Manage Administrators */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Administrators</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
                Provision and manage admin access across your properties
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.addAdminBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="person-add" size={15} color="#FFFFFF" />
              <Text style={styles.addAdminBtnText}>Add Admin</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.secondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name or email…"
              placeholderTextColor={colors.secondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={colors.secondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ marginTop: 10, color: colors.secondary }}>Loading platform accounts…</Text>
            </View>
          ) : filteredAdmins.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Ionicons name="people-outline" size={40} color={colors.secondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No administrators found</Text>
              <Text style={[styles.emptySub, { color: colors.secondary }]}>
                Add your first property admin to delegate management.
              </Text>
            </View>
          ) : (
            filteredAdmins.map((admin) => {
              const isSuper = admin.role === "SUPER_ADMIN";
              const isSelf = admin.id === currentUserId;
              const isActive = admin.status === "ACTIVE";

              return (
                <View
                  key={admin.id}
                  style={[
                    styles.adminCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    isSuper && { borderColor: isDark ? "#4338CA" : "#C7D2FE" },
                  ]}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.avatarWrap}>
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: isSuper ? "#4F46E5" : colors.primaryLight },
                        ]}
                      >
                        <Text
                          style={[
                            styles.avatarTxt,
                            { color: isSuper ? "#FFFFFF" : colors.primary },
                          ]}
                        >
                          {(admin.firstName?.[0] || "A").toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={[styles.adminName, { color: colors.text }]}>
                            {admin.firstName} {admin.lastName || ""}
                          </Text>
                          {isSelf && (
                            <View style={[styles.selfTag, { backgroundColor: colors.primaryLight }]}>
                              <Text style={[styles.selfTagText, { color: colors.primary }]}>You</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.adminEmail, { color: colors.secondary }]}>
                          {admin.email}
                        </Text>
                        {admin.phone ? (
                          <Text style={[styles.adminPhone, { color: colors.secondary }]}>
                            📞 {admin.phone}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Role Badge */}
                    <View
                      style={[
                        styles.roleBadge,
                        {
                          backgroundColor: isSuper
                            ? isDark
                              ? "#312E81"
                              : "#EEF2FF"
                            : isDark
                            ? "#1E293B"
                            : "#F1F5F9",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          { color: isSuper ? "#6366F1" : colors.secondary },
                        ]}
                      >
                        {isSuper ? "SUPER ADMIN" : "ADMIN"}
                      </Text>
                    </View>
                  </View>

                  {/* Assigned Hostels Section */}
                  <View style={[styles.hostelsSection, { borderTopColor: colors.border }]}>
                    <View style={styles.hostelsHeaderRow}>
                      <Text style={[styles.hostelsLabel, { color: colors.secondary }]}>
                        ASSIGNED PROPERTIES ({admin.assignedHostels?.length || 0})
                      </Text>
                      {!isSuper && (
                        <TouchableOpacity
                          style={styles.assignLink}
                          onPress={() => setAssigningAdmin(admin)}
                        >
                          <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                          <Text style={[styles.assignLinkText, { color: colors.primary }]}>
                            Assign Property
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {isSuper ? (
                      <View style={styles.superScopePill}>
                        <Ionicons name="globe-outline" size={13} color="#4F46E5" />
                        <Text style={styles.superScopeText}>
                          Full Platform Access (All Hostels & Settings)
                        </Text>
                      </View>
                    ) : (admin.assignedHostels?.length || 0) === 0 ? (
                      <Text style={[styles.noHostelsText, { color: colors.secondary }]}>
                        No properties assigned yet. Tap "Assign Property" above.
                      </Text>
                    ) : (
                      <View style={styles.chipsWrap}>
                        {admin.assignedHostels?.map((h) => (
                          <View
                            key={h.hostelId}
                            style={[
                              styles.hostelChip,
                              { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                            ]}
                          >
                            <Ionicons name="business-outline" size={13} color={colors.primary} />
                            <Text style={[styles.hostelChipText, { color: colors.text }]} numberOfLines={1}>
                              {h.hostelName}
                            </Text>
                            <TouchableOpacity
                              onPress={() =>
                                handleRemoveHostelAssignment(h.hostelId, admin.firstName)
                              }
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close-circle" size={15} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Card Actions Footer */}
                  {!isSelf && (
                    <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                      <TouchableOpacity
                        style={[
                          styles.statusToggleBtn,
                          {
                            backgroundColor: isActive ? colors.successLight : colors.dangerLight,
                            borderColor: isActive ? "#BBF7D0" : "#FECACA",
                          },
                        ]}
                        onPress={() => handleToggleStatus(admin)}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: isActive ? colors.success : colors.danger },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusToggleText,
                            { color: isActive ? colors.success : colors.danger },
                          ]}
                        >
                          {isActive ? "Active Account" : "Inactive (Disabled)"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.deleteBtn, { backgroundColor: colors.dangerLight }]}
                        onPress={() => handleDeleteAdmin(admin)}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        {/* ── CREATE ADMIN MODAL ── */}
        <Modal visible={showAddModal} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalBackdrop}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Add Administrator</Text>
                  <Text style={[styles.modalSub, { color: colors.secondary }]}>
                    Create a new property admin account
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>First Name *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                placeholder="e.g. Ramesh"
                placeholderTextColor={colors.secondary}
                value={newFirstName}
                onChangeText={setNewFirstName}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Last Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                placeholder="e.g. Sharma"
                placeholderTextColor={colors.secondary}
                value={newLastName}
                onChangeText={setNewLastName}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Email Address *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                placeholder="admin@property.com"
                placeholderTextColor={colors.secondary}
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Phone Number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                placeholder="e.g. 9876543210"
                placeholderTextColor={colors.secondary}
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Password *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
                placeholder="Minimum 6 characters"
                placeholderTextColor={colors.secondary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setShowAddModal(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCreateAdmin}
                  disabled={savingAdmin}
                >
                  {savingAdmin ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Create Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── ASSIGN HOSTEL MODAL ── */}
        <Modal visible={!!assigningAdmin} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Assign Property</Text>
                  <Text style={[styles.modalSub, { color: colors.secondary }]}>
                    Assign to {assigningAdmin?.firstName} {assigningAdmin?.lastName || ""}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setAssigningAdmin(null)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Select Property *</Text>
              <ScrollView style={{ maxHeight: 240, marginVertical: 10 }}>
                {hostels.length === 0 ? (
                  <Text style={{ color: colors.secondary, padding: 10 }}>
                    No properties found. Create a hostel first.
                  </Text>
                ) : (
                  hostels.map((h) => {
                    const isSelected = assigningHostelId === h.id;
                    const alreadyAssigned = assigningAdmin?.assignedHostels?.some(
                      (item) => item.hostelId === h.id
                    );

                    return (
                      <TouchableOpacity
                        key={h.id}
                        disabled={alreadyAssigned}
                        style={[
                          styles.hostelSelectRow,
                          { borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
                          isSelected && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                          alreadyAssigned && { opacity: 0.4 },
                        ]}
                        onPress={() => setAssigningHostelId(h.id)}
                      >
                        <Ionicons
                          name="business"
                          size={18}
                          color={isSelected ? colors.primary : colors.secondary}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.hostelSelectName, { color: colors.text }]}>{h.name}</Text>
                          <Text style={[styles.hostelSelectSub, { color: colors.secondary }]}>
                            {h.city ? `${h.city}, ` : ""}
                            {h.address || "Property"}
                            {alreadyAssigned ? " • Already assigned" : ""}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setAssigningAdmin(null)}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                  onPress={handleAssignHostel}
                  disabled={savingAssignment || !assigningHostelId}
                >
                  {savingAssignment ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Confirm Assignment</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 54 : 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  headerLeft: { flex: 1 },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#6366F1", letterSpacing: 0.5 },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 100 },

  // KPI Grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  kpiCard: {
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiVal: { fontSize: 20, fontWeight: "800" },
  kpiLbl: { fontSize: 11, fontWeight: "600", marginTop: 2 },

  // Section Header
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 2 },
  addAdminBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addAdminBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },

  // Search
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 36,
    borderWidth: 1,
    borderRadius: 16,
    borderStyle: "dashed",
    marginTop: 10,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginTop: 10 },
  emptySub: { fontSize: 12, textAlign: "center", marginTop: 4, lineHeight: 18 },

  // Admin Card
  adminCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  avatarWrap: { flexDirection: "row", alignItems: "flex-start", flex: 1, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 18, fontWeight: "800" },
  adminName: { fontSize: 15, fontWeight: "800" },
  selfTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  selfTagText: { fontSize: 10, fontWeight: "800" },
  adminEmail: { fontSize: 12, marginTop: 2 },
  adminPhone: { fontSize: 11, marginTop: 2 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, fontWeight: "800" },

  // Hostels section inside card
  hostelsSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
  hostelsHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  hostelsLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  assignLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  assignLinkText: { fontSize: 11, fontWeight: "700" },
  superScopePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  superScopeText: { fontSize: 11, fontWeight: "700", color: "#4F46E5" },
  noHostelsText: { fontSize: 11, fontStyle: "italic", marginTop: 2 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  hostelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: "80%",
  },
  hostelChipText: { fontSize: 11, fontWeight: "600", maxWidth: 140 },

  // Card Footer Actions
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  statusToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusToggleText: { fontSize: 11, fontWeight: "700" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteBtnText: { fontSize: 11, fontWeight: "700" },

  // Modal styles
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalCard: { borderWidth: 1, borderRadius: 20, padding: 20, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalSub: { fontSize: 12, marginTop: 2 },
  inputLabel: { fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  cancelBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  cancelBtnText: { fontSize: 13, fontWeight: "700" },
  submitBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  submitBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  // Hostel select row
  hostelSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  hostelSelectName: { fontSize: 14, fontWeight: "700" },
  hostelSelectSub: { fontSize: 11, marginTop: 2 },
});
