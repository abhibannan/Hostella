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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";
import { Hostel, Notification } from "../types";
import { Header, EmptyState } from "../components/common";
import { HostellaBrand } from "../components/HostellaBrand";
import { useTheme } from "../contexts/ThemeContext";

interface NotificationsScreenProps {
  notifications: Notification[];
  selectedHostel?: Hostel;
  hostels: Hostel[];
  onSendBroadcast: (
    title: string,
    message: string,
    type: string,
    scope?: "CURRENT" | "ALL",
  ) => Promise<void>;
  onDeleteNotification?: (id: string) => Promise<void> | void;
  onClearAll?: () => Promise<void> | void;
  onRefresh: () => void;
  onBack?: () => void;
}

export function NotificationsScreen({
  notifications,
  selectedHostel,
  hostels,
  onSendBroadcast,
  onDeleteNotification,
  onClearAll,
  onRefresh,
  onBack,
}: NotificationsScreenProps) {
  const { colors, isDark } = useTheme();
  const currentHostelNotifications = selectedHostel?.id
    ? notifications.filter((n) => !n.hostelId || n.hostelId === "ALL" || n.hostelId === selectedHostel.id)
    : notifications;

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastType, setBroadcastType] = useState<string>("ANNOUNCEMENT");
  const [targetScope, setTargetScope] = useState<"CURRENT" | "ALL">("CURRENT");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!broadcastTitle.trim()) {
      return Alert.alert("Title Required", "Please enter an announcement title.");
    }
    if (!broadcastMessage.trim()) {
      return Alert.alert("Message Required", "Please enter the announcement details.");
    }

    setSending(true);
    try {
      await onSendBroadcast(
        broadcastTitle.trim(),
        broadcastMessage.trim(),
        broadcastType,
        targetScope,
      );
      setShowBroadcastModal(false);
      setBroadcastTitle("");
      setBroadcastMessage("");
      setBroadcastType("ANNOUNCEMENT");
    } finally {
      setSending(false);
    }
  }

  function getTypeIconAndColor(type: string) {
    switch (type) {
      case "URGENT":
      case "ALERT":
        return {
          icon: "alert-circle-outline",
          color: COLORS.danger,
          bg: isDark ? "rgba(239,68,68,0.2)" : COLORS.dangerLight,
          label: "Urgent Alert",
        };
      case "MAINTENANCE":
        return {
          icon: "construct-outline",
          color: COLORS.orange,
          bg: isDark ? "rgba(249,115,22,0.2)" : COLORS.orangeLight,
          label: "Maintenance",
        };
      case "SYSTEM":
        return {
          icon: "information-circle-outline",
          color: COLORS.purple,
          bg: isDark ? "rgba(139,92,246,0.2)" : COLORS.purpleLight,
          label: "Notice",
        };
      default:
        return {
          icon: "megaphone-outline",
          color: COLORS.primary,
          bg: isDark ? "rgba(59,130,246,0.2)" : COLORS.primaryLight,
          label: "Announcement",
        };
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
        {/* Hostella Brand & Header navigation */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <HostellaBrand variant="full" colorScheme={isDark ? "dark" : "light"} size="small" />
        </View>
        <View style={styles.topNavRow}>
          {onBack && (
            <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onBack}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Header
              title="Announcements & Broadcasts"
              subtitle={selectedHostel?.name || "Hostel Communication Center"}
              onRefresh={onRefresh}
            />
          </View>
        </View>

        {/* Notice Info Box */}
        <View style={[styles.infoBar, { backgroundColor: isDark ? colors.surfaceSecondary : COLORS.primaryLight, borderColor: isDark ? colors.border : "#BFDBFE" }]}>
          <Ionicons name="information-circle" size={16} color={COLORS.primary} />
          <Text style={[styles.infoBarText, { color: isDark ? colors.text : COLORS.primaryDark }]}>
            Easily send official announcements, maintenance notices, and urgent alerts to all residents in real time.
          </Text>
        </View>

        {/* Action Row */}
        <View style={styles.actionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Broadcast History</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
                    {currentHostelNotifications.length} announcement{currentHostelNotifications.length === 1 ? "" : "s"} sent
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {currentHostelNotifications.length > 0 && onClearAll ? (
                    <TouchableOpacity
                      style={styles.clearAllBtn}
                      onPress={onClearAll}
                    >
                      <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                      <Text style={styles.clearAllText}>Clear All</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.smallPrimaryButton}
                    onPress={() => setShowBroadcastModal(true)}
                  >
                    <Ionicons name="megaphone" size={15} color="#FFFFFF" />
                    <Text style={styles.smallPrimaryText}>New Broadcast</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notification Cards */}
              {currentHostelNotifications.length === 0 ? (
                <EmptyState
                  icon="notifications-outline"
                  title="No Broadcasts Sent Yet"
                  description="Tap 'New Broadcast' above to send your first announcement or notice to residents."
                />
              ) : (
                currentHostelNotifications.map((notif) => {
                  const typeInfo = getTypeIconAndColor(notif.type);

                  return (
              <View key={notif.id} style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.notifCardTop}>
                  <View style={[styles.typeBadge, { backgroundColor: typeInfo.bg }]}>
                    <Ionicons name={typeInfo.icon as any} size={13} color={typeInfo.color} />
                    <Text style={[styles.typeBadgeText, { color: typeInfo.color }]}>
                      {typeInfo.label}
                    </Text>
                  </View>
                  <Text style={[styles.notifDate, { color: colors.secondary }]}>
                    {notif.createdAt ? new Date(notif.createdAt).toLocaleDateString() : ""}
                  </Text>
                </View>

                <Text style={[styles.notifTitle, { color: colors.text }]}>{notif.title}</Text>
                <Text style={[styles.notifMessage, { color: colors.secondary }]}>{notif.message}</Text>

                <View style={[styles.notifFooter, { borderTopColor: colors.border }]}>
                  <View style={styles.notifFooterItem}>
                    <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.success} />
                    <Text style={[styles.notifFooterText, { color: colors.secondary }]}>Delivered to resident portal</Text>
                  </View>
                  {onDeleteNotification ? (
                    <TouchableOpacity
                      style={[styles.cardDeleteBtn, isDark && { backgroundColor: "rgba(239,68,68,0.18)" }]}
                      onPress={() => {
                        Alert.alert(
                          "Delete Notification",
                          "Are you sure you want to delete this notification record?",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => onDeleteNotification(notif.id),
                            },
                          ],
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Broadcast Modal */}
      <Modal visible={showBroadcastModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>New Broadcast Message</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondary }]}>
                  Send an instant notification to all selected residents.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowBroadcastModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Scope */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Audience</Text>
            <View style={styles.scopeRow}>
              <TouchableOpacity
                style={[
                  styles.scopeBtn,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                  targetScope === "CURRENT" && styles.scopeBtnActive,
                ]}
                onPress={() => setTargetScope("CURRENT")}
              >
                <Ionicons
                  name="business-outline"
                  size={14}
                  color={targetScope === "CURRENT" ? COLORS.primary : colors.secondary}
                />
                <Text
                  style={[styles.scopeBtnText, { color: colors.secondary }, targetScope === "CURRENT" && styles.scopeBtnTextActive]}
                >
                  {selectedHostel?.name || "This Hostel"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.scopeBtn,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                  targetScope === "ALL" && styles.scopeBtnActive,
                ]}
                onPress={() => setTargetScope("ALL")}
              >
                <Ionicons
                  name="globe-outline"
                  size={14}
                  color={targetScope === "ALL" ? COLORS.primary : colors.secondary}
                />
                <Text
                  style={[styles.scopeBtnText, { color: colors.secondary }, targetScope === "ALL" && styles.scopeBtnTextActive]}
                >
                  All Hostels
                </Text>
              </TouchableOpacity>
            </View>

            {/* Category */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Announcement Category</Text>
            <View style={styles.scopeRow}>
              {[
                { key: "ANNOUNCEMENT", label: "Announcement", icon: "megaphone-outline" },
                { key: "MAINTENANCE", label: "Maintenance", icon: "construct-outline" },
                { key: "SYSTEM", label: "Notice", icon: "information-circle-outline" },
              ].map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.scopeBtn,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                    broadcastType === cat.key && styles.scopeBtnActive,
                  ]}
                  onPress={() => setBroadcastType(cat.key)}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={14}
                    color={broadcastType === cat.key ? COLORS.primary : colors.secondary}
                  />
                  <Text
                    style={[styles.scopeBtnText, { color: colors.secondary }, broadcastType === cat.key && styles.scopeBtnTextActive]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Title */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Title *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
              value={broadcastTitle}
              onChangeText={setBroadcastTitle}
              placeholder="e.g. Water Tank Cleaning / Gate Curfew Timing"
              placeholderTextColor={colors.secondary}
            />

            {/* Message */}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Message Details *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}
              value={broadcastMessage}
              onChangeText={setBroadcastMessage}
              placeholder="Write the complete announcement notice..."
              placeholderTextColor={colors.secondary}
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowBroadcastModal(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, sending && styles.btnDisabled]}
                disabled={sending}
                onPress={handleSend}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={15} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Send Broadcast</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  screenContent: { padding: 18, paddingBottom: 110 },
  topNavRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
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
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoBarText: { flex: 1, fontSize: 12, color: COLORS.primaryDark || "#1E40AF", lineHeight: 18, fontWeight: "500" },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  clearAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  clearAllText: { fontSize: 12, color: COLORS.danger, fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sectionSubtitle: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  smallPrimaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 5,
  },
  smallPrimaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  notifCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  notifCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: { fontSize: 11, fontWeight: "700" },
  notifDate: { fontSize: 11, color: COLORS.secondary },
  notifTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 5 },
  notifMessage: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  notifFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  notifFooterItem: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  notifFooterText: { fontSize: 11, color: COLORS.success, fontWeight: "600" },
  cardDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.dangerLight,
    alignItems: "center",
    justifyContent: "center",
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
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  modalSubtitle: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 10,
  },
  scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  scopeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.grayFill,
  },
  scopeBtnActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  scopeBtnText: { fontSize: 12, fontWeight: "600", color: COLORS.secondary },
  scopeBtnTextActive: { color: COLORS.primary, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  btnDisabled: { opacity: 0.6 },
});
