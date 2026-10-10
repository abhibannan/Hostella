import React, { useCallback, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { COLORS } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";
import { API_URL, parseJsonResponse } from "../services/api";
import { Fee, Hostel, Notification, Payment, Repair, Renter, User } from "../types";
import { money, today } from "../utils/formatters";
import { EmptyState } from "../components/common";
import { HostellaBrand } from "../components/HostellaBrand";
import { getFullProofUrl } from "./PaymentsScreen";
import { setSuspendBiometrics } from "../hooks/useBiometrics";

interface RenterPortalScreenProps {
  user: User;
  renter: Renter | null;
  hostel: Hostel | null;
  fees: Fee[];
  payments: Payment[];
  repairs: Repair[];
  notifications: Notification[];
  token?: string | null;
  request?: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => void;
  onLogout: () => void;
  onSubmitProof: (params: {
    feeId: string;
    amount: number;
    paymentDate: string;
    proofUri: string;
    proofBase64?: string | null;
    proofMimeType?: string | null;
    reference?: string;
    notes?: string;
  }) => Promise<void>;
  onSubmitRepair: (params: {
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  }) => Promise<void>;
  scheduleLocalNotification?: (title: string, body: string, data?: Record<string, unknown>) => Promise<void>;
  biometricLabel?: string;
  isBiometricsEnabled?: boolean;
  isBiometricsSupported?: boolean;
  onToggleBiometrics?: (enable: boolean) => Promise<boolean>;
}

const RENTER_TABS = ["details", "fees", "repairs", "notices", "settings"] as const;
type RenterTab = typeof RENTER_TABS[number];

export function RenterPortalScreen({
  user,
  renter,
  hostel,
  fees,
  payments,
  repairs,
  notifications,
  token,
  request,
  onRefresh,
  onLogout,
  onSubmitProof,
  onSubmitRepair,
  biometricLabel = "Biometric / Face Recognition",
  isBiometricsEnabled = false,
  isBiometricsSupported = false,
  onToggleBiometrics,
}: RenterPortalScreenProps) {
  const [activeTab, setActiveTab] = useState<RenterTab>("details");
  const { colors: theme, setTheme, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth || Dimensions.get("window").width);
  const pagerRef = useRef<ScrollView>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  // Repair Rating Modal State
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTargetRepairId, setRatingTargetRepairId] = useState("");
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  // Automatically clean up resolved maintenance notifications from the renter's feed
  React.useEffect(() => {
    const resolvedRepairIds = new Set(
      repairs
        .filter((r) => String(r.status).toUpperCase() === "RESOLVED")
        .map((r) => r.id),
    );

    const staleMaintenanceNotifs = notifications.filter((n) => {
      if (n.entityType === "REPAIR" && n.entityId && resolvedRepairIds.has(n.entityId)) {
        return true;
      }
      return false;
    });

    if (staleMaintenanceNotifs.length > 0) {
      staleMaintenanceNotifs.forEach((n) => {
        if (request) {
          request(`/notifications/${n.id}`, { method: "DELETE" }).catch(() => {});
        } else if (token) {
          fetch(`${API_URL}/notifications/${n.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      });
    }
  }, [notifications, repairs, request, token]);

  const visibleNotifications = notifications.filter((notif) => {
    if (notif.entityType === "REPAIR" && notif.entityId) {
      const isResolved = repairs.some(
        (r) => r.id === notif.entityId && String(r.status).toUpperCase() === "RESOLVED",
      );
      if (isResolved) return false;
    }
    return true;
  });

  // ── Tab switching with horizontal slide ────────────────────────────────────
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - containerWidth) > 1) {
      setContainerWidth(w);
    }
  }, [containerWidth]);

  const handleTabPress = useCallback((tab: RenterTab) => {
    setActiveTab(tab);
    const idx = RENTER_TABS.indexOf(tab);
    if (idx >= 0 && containerWidth > 0) {
      pagerRef.current?.scrollTo({ x: idx * containerWidth, animated: true });
      tabScrollRef.current?.scrollTo({ x: Math.max(0, idx * 80 - 30), animated: true });
    }
  }, [containerWidth]);

  const onPagerScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    if (containerWidth > 0) {
      const idx = Math.round(x / containerWidth);
      if (idx >= 0 && idx < RENTER_TABS.length) {
        const nextTab = RENTER_TABS[idx];
        setActiveTab(nextTab);
        tabScrollRef.current?.scrollTo({ x: Math.max(0, idx * 80 - 30), animated: true });
      }
    }
  }, [containerWidth]);

  // ── Edit Profile State ─────────────────────────────────────────────────────
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editGuardianPhone, setEditGuardianPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  function openEditProfile() {
    setEditFirstName(user.firstName || renter?.user?.firstName || "");
    setEditLastName(user.lastName || renter?.user?.lastName || "");
    setEditPhone(user.phone || renter?.phone || renter?.user?.phone || "");
    setEditGuardianName(renter?.guardianName || "");
    setEditGuardianPhone(renter?.guardianPhone || "");
    setEditAddress(user.address || renter?.user?.address || "");
    setEditCity(user.city || renter?.user?.city || "");
    setEditState(user.state || renter?.user?.state || "");
    setEditPincode(user.pincode || renter?.user?.pincode || "");
    setEditEmergencyName(user.emergencyContactName || renter?.user?.emergencyContactName || "");
    setEditEmergencyPhone(user.emergencyContactPhone || renter?.user?.emergencyContactPhone || "");
    setShowEditProfileModal(true);
  }

  async function handleSaveProfile() {
    if (!editFirstName.trim()) {
      return Alert.alert("First Name Required", "Please enter your first name.");
    }
    setSavingProfile(true);
    try {
      if (request) {
        await request("/auth/me", {
          method: "PATCH",
          body: JSON.stringify({
            firstName: editFirstName.trim(),
            lastName: editLastName.trim() || undefined,
            phone: editPhone.trim() || undefined,
            guardianName: editGuardianName.trim() || undefined,
            guardianPhone: editGuardianPhone.trim() || undefined,
            address: editAddress.trim() || undefined,
            city: editCity.trim() || undefined,
            state: editState.trim() || undefined,
            pincode: editPincode.trim() || undefined,
            emergencyContactName: editEmergencyName.trim() || undefined,
            emergencyContactPhone: editEmergencyPhone.trim() || undefined,
          }),
        });
      } else if (token) {
        const resp = await fetch(`${API_URL}/auth/me`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            firstName: editFirstName.trim(),
            lastName: editLastName.trim() || undefined,
            phone: editPhone.trim() || undefined,
            guardianName: editGuardianName.trim() || undefined,
            guardianPhone: editGuardianPhone.trim() || undefined,
            address: editAddress.trim() || undefined,
            city: editCity.trim() || undefined,
            state: editState.trim() || undefined,
            pincode: editPincode.trim() || undefined,
            emergencyContactName: editEmergencyName.trim() || undefined,
            emergencyContactPhone: editEmergencyPhone.trim() || undefined,
          }),
        });
        if (!resp.ok) {
          const d = await parseJsonResponse(resp);
          throw new Error(String((d as any)?.message || "Failed to update profile."));
        }
      }
      setShowEditProfileModal(false);
      await onRefresh();
      Alert.alert("Profile Updated", "Your personal details have been updated successfully.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Password Management State ──────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function handleChangePassword() {
    setPasswordMsg(null);
    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg({ text: "Password must be at least 6 characters.", type: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "Passwords do not match.", type: "error" });
      return;
    }

    setSavingPassword(true);
    try {
      if (request) {
        await request("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ password: newPassword }),
        });
      } else if (token) {
        const response = await fetch(`${API_URL}/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password: newPassword }),
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) {
          throw new Error(String((data as any)?.message || "Failed to update password."));
        }
      } else {
        throw new Error("You are not signed in.");
      }

      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({
        text: "Password saved successfully! You can now use this password to sign in.",
        type: "success",
      });
      Alert.alert(
        "Password Saved",
        "Your password has been updated. You can now log into the Resident Portal anytime using your email and password.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change password.";
      setPasswordMsg({ text: msg, type: "error" });
      Alert.alert("Password Error", msg);
    } finally {
      setSavingPassword(false);
    }
  }

  // ── Delete Payment Proof ───────────────────────────────────────────────────
  async function handleDeletePaymentProof(paymentId: string) {
    const hostelId = hostel?.id || renter?.hostelId;
    if (!hostelId) {
      Alert.alert("Error", "Hostel profile missing.");
      return;
    }

    const executeDelete = async () => {
      try {
        if (request) {
          await request(`/hostels/${hostelId}/payments/${paymentId}`, {
            method: "DELETE",
          });
        } else if (token) {
          const res = await fetch(`${API_URL}/hostels/${hostelId}/payments/${paymentId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const data = await parseJsonResponse(res);
            throw new Error(String((data as any)?.message || "Failed to delete payment proof."));
          }
        }
        await onRefresh();
        Alert.alert("Withdrawn", "Your payment proof submission has been removed. You can now submit a fresh screenshot.");
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : "Failed to withdraw payment proof.");
      }
    };

    Alert.alert(
      "Withdraw Payment Proof",
      "Are you sure you want to withdraw this payment proof? You can submit a fresh screenshot after withdrawal.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Withdraw", style: "destructive", onPress: () => void executeDelete() },
      ],
    );
  }

  // ── Delete Notification ────────────────────────────────────────────────────
  async function handleDeleteNotification(notifId: string) {
    Alert.alert(
      "Delete Notification",
      "Are you sure you want to remove this notification?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (request) {
                await request(`/notifications/${notifId}`, { method: "DELETE" });
              } else if (token) {
                await fetch(`${API_URL}/notifications/${notifId}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
              onRefresh();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete notification.");
            }
          },
        },
      ],
    );
  }

  async function handleClearAllNotifications() {
    Alert.alert(
      "Clear All Notifications",
      "Are you sure you want to delete all notifications from your feed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              if (request) {
                await request("/notifications/me/clear-all", { method: "DELETE" });
              } else if (token) {
                await fetch(`${API_URL}/notifications/me/clear-all`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
              onRefresh();
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to clear notifications.");
            }
          },
        },
      ],
    );
  }

  // ── Proof Upload Modal State ───────────────────────────────────────────────
  const [showProofModal, setShowProofModal] = useState(false);
  const [selectedFeeId, setSelectedFeeId] = useState("");
  const [proofAmount, setProofAmount] = useState("");
  const [proofDate, setProofDate] = useState(today());
  const [proofReference, setProofReference] = useState("");
  const [proofNotes, setProofNotes] = useState("");
  const [proofImageUri, setProofImageUri] = useState<string | null>(null);
  const [proofBase64, setProofBase64] = useState<string | null>(null);
  const [proofMimeType, setProofMimeType] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);

  // ── Repair Complaint Modal State ───────────────────────────────────────────
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [repairTitle, setRepairTitle] = useState("");
  const [repairDescription, setRepairDescription] = useState("");
  const [repairPriority, setRepairPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [submittingRepair, setSubmittingRepair] = useState(false);

  // ── Image preview modal ────────────────────────────────────────────────────
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Totals
  const totalDue = fees.reduce((acc, fee) => {
    const feeAmt = Number(fee.amount || 0);
    const paidAmt = Number(fee.paidAmount || 0);
    return acc + Math.max(0, feeAmt - paidAmt);
  }, 0);

  const totalPaid = payments
    .filter((p) => String(p.status).toUpperCase() === "APPROVED")
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);

  // ── Image compression helper ───────────────────────────────────────────────
  async function compressImage(
    uri: string,
  ): Promise<{ uri: string; base64: string | null; mimeType: string }> {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }], // cap at 1200px wide
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      return {
        uri: manipulated.uri,
        base64: manipulated.base64 ?? null,
        mimeType: "image/jpeg",
      };
    } catch {
      // Fallback: return original if manipulation fails
      return { uri, base64: null, mimeType: "image/jpeg" };
    }
  }

  async function pickImageFromGallery() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow access to photos to upload payment proof.");
        return;
      }
      setSuspendBiometrics(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
        base64: false, // We'll get base64 from manipulator instead
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const compressed = await compressImage(asset.uri);
        setProofImageUri(compressed.uri);
        setProofBase64(compressed.base64);
        setProofMimeType(compressed.mimeType);
      }
    } catch {
      Alert.alert("Error", "Could not pick image from gallery.");
    }
  }

  async function takePhotoWithCamera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow camera access to capture payment proof.");
        return;
      }
      setSuspendBiometrics(true);
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: false, // We'll get base64 from manipulator instead
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const compressed = await compressImage(asset.uri);
        setProofImageUri(compressed.uri);
        setProofBase64(compressed.base64);
        setProofMimeType(compressed.mimeType);
      }
    } catch {
      Alert.alert("Error", "Could not open camera.");
    }
  }

  function openProofForFee(fee: Fee) {
    const remaining = Math.max(0, Number(fee.amount || 0) - Number(fee.paidAmount || 0));
    setSelectedFeeId(fee.id);
    setProofAmount(String(remaining > 0 ? remaining : fee.amount));
    setProofDate(today());
    setProofReference("");
    setProofNotes("");
    setProofImageUri(null);
    setProofBase64(null);
    setProofMimeType(null);
    setShowProofModal(true);
  }

  async function handleSendProof() {
    if (!selectedFeeId) {
      Alert.alert("Missing Fee", "Please choose which month fee you are paying for.");
      return;
    }
    const amt = parseFloat(proofAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }
    if (!proofImageUri) {
      Alert.alert("Missing Proof", "Please attach a photo or screenshot of your payment receipt/UPI.");
      return;
    }

    setSubmittingProof(true);
    try {
      await onSubmitProof({
        feeId: selectedFeeId,
        amount: amt,
        paymentDate: proofDate || today(),
        proofUri: proofImageUri,
        proofBase64,
        proofMimeType,
        reference: proofReference.trim() || undefined,
        notes: proofNotes.trim() || undefined,
      });
      setShowProofModal(false);
      Alert.alert("Submitted!", "Your payment proof has been sent for admin verification.");
    } catch (err) {
      Alert.alert("Submission Failed", err instanceof Error ? err.message : "Unable to submit proof.");
    } finally {
      setSubmittingProof(false);
    }
  }

  async function handleSendRepair() {
    if (!repairTitle.trim()) {
      Alert.alert("Title Required", "Please enter a short title for the complaint (e.g., Leaking Tap).");
      return;
    }
    if (!repairDescription.trim()) {
      Alert.alert("Description Required", "Please describe the repair needed.");
      return;
    }

    setSubmittingRepair(true);
    try {
      await onSubmitRepair({
        title: repairTitle.trim(),
        description: repairDescription.trim(),
        priority: repairPriority,
      });
      setShowRepairModal(false);
      setRepairTitle("");
      setRepairDescription("");
      setRepairPriority("MEDIUM");
      Alert.alert("Complaint Registered", "Your repair complaint has been logged. The warden/admin will inspect it.");
    } catch (err) {
      Alert.alert("Submission Failed", err instanceof Error ? err.message : "Unable to file repair complaint.");
    } finally {
      setSubmittingRepair(false);
    }
  }

  const openRepairsCount = repairs.filter(
    (r) => String(r.status).toUpperCase() !== "RESOLVED",
  ).length;

  const isOverdue = fees.some((f) => {
    const rem = Math.max(0, Number(f.amount || 0) - Number(f.paidAmount || 0));
    if (rem <= 0) return false;
    if (String(f.status).toUpperCase() === "OVERDUE") return true;
    if (f.dueDate) {
      const due = new Date(`${f.dueDate}T00:00:00`);
      const todayDate = new Date();
      return due.getTime() < todayDate.getTime();
    }
    return false;
  });

  const renterName =
    user.firstName || renter?.name || renter?.user?.firstName
      ? `${user.firstName || renter?.user?.firstName || ""} ${user.lastName || renter?.user?.lastName || ""}`.trim()
      : user.email;

  const roomDisplay = renter?.room?.roomNumber
    ? `Room ${renter.room.roomNumber}${renter.room.floor !== undefined ? ` • Floor ${renter.room.floor}` : ""}`
    : "Room Assigned";

  // Dynamic Theme-Aware Styles
  const s = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* ── Deep Royal Navy Hero Banner (Admin UI Style) ── */}
      <View style={s.heroContainer}>
        <LinearGradient
          colors={isDark ? ["#060B1E", "#0B163B", "#132357"] : ["#0A1333", "#122566", "#1E3A8A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.35, y: 1 }}
          style={s.heroBannerGradient}
        >
          {/* Ambient Lighting Orbs */}
          <View style={[s.ambientOrb, { top: -60, right: -40, width: 220, height: 220, backgroundColor: "rgba(59, 130, 246, 0.25)" }]} />
          <View style={[s.ambientOrb, { top: 20, left: -60, width: 170, height: 170, backgroundColor: "rgba(139, 92, 246, 0.22)" }]} />

          {/* Top Row: App Logo + Title + Tagline + Actions */}
          <View style={s.headerTopBar}>
            <View style={s.brandRow}>
              <HostellaBrand variant="icon" size="medium" />
              <View style={{ marginLeft: 6 }}>
                <HostellaBrand variant="wordmark" colorScheme="dark" size="small" style={{ alignItems: "flex-start" }} />
                <Text style={s.brandSubtitle}>Resident Portal • {renterName}</Text>
              </View>
            </View>

            <View style={s.heroActions}>
              <TouchableOpacity
                style={s.heroIconBtn}
                onPress={() => setTheme(isDark ? "light" : "dark")}
                accessibilityLabel="Toggle Theme"
              >
                <Ionicons
                  name={isDark ? "sunny-outline" : "moon-outline"}
                  size={17}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.heroIconBtn, { backgroundColor: "rgba(239, 68, 68, 0.25)" }]}
                onPress={() => {
                  Alert.alert("Logout", "Are you sure you want to exit?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Logout", style: "destructive", onPress: onLogout },
                  ]);
                }}
                accessibilityLabel="Logout"
              >
                <Ionicons name="log-out-outline" size={17} color="#FCA5A5" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Residency Card */}
          <View style={s.activePropertyCard}>
            <View style={s.activePropertyLeft}>
              <View style={s.activePropertyBadge}>
                <View style={s.activeDot} />
                <Text style={s.activeBadgeText}>Active Resident</Text>
              </View>
              <Text style={s.activePropertyName} numberOfLines={1}>
                {hostel?.name || "Hostella Property"}
              </Text>
              <View style={s.activePropertyLocRow}>
                <Ionicons name="home-outline" size={13} color="rgba(255,255,255,0.75)" />
                <Text style={s.activePropertyLocText} numberOfLines={1}>
                  {roomDisplay} {renter?.bed ? `• Bed ${renter.bed}` : ""}
                </Text>
              </View>
            </View>

            <View style={s.activePropertyActionBox}>
              <View style={s.propertyIconCircle}>
                <Ionicons name="person" size={18} color="#FFFFFF" />
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* ── 3 Floating Metric Cards (Admin Style) ── */}
        <View style={s.floatingKpiRow}>
          {/* Card 1: Pending Dues */}
          <TouchableOpacity
            style={[s.floatingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => handleTabPress("fees")}
            activeOpacity={0.8}
          >
            <Text style={[s.floatingCardLabel, { color: theme.secondary }]}>Pending Dues</Text>
            <Text
              style={[
                s.floatingCardValue,
                { color: totalDue > 0 ? (isOverdue ? theme.danger : theme.warning) : theme.success },
              ]}
              numberOfLines={1}
            >
              ₹{totalDue.toLocaleString()}
            </Text>
            <View
              style={[
                s.statusTag,
                {
                  backgroundColor: totalDue > 0
                    ? (isOverdue
                        ? (isDark ? "rgba(244,63,94,0.18)" : "#FEE2E2")
                        : (isDark ? "rgba(245,158,11,0.18)" : "#FEF3C7"))
                    : (isDark ? "rgba(34,197,94,0.18)" : "#DCFCE7"),
                },
              ]}
            >
              <Ionicons
                name={totalDue > 0 ? (isOverdue ? "alert-circle" : "time") : "checkmark-circle"}
                size={10}
                color={totalDue > 0 ? (isOverdue ? theme.danger : theme.warning) : theme.success}
              />
              <Text
                style={[
                  s.statusTagText,
                  { color: totalDue > 0 ? (isOverdue ? theme.danger : theme.warning) : theme.success },
                ]}
              >
                {totalDue > 0 ? (isOverdue ? "Overdue" : "Due Soon") : "All Clear"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Card 2: Monthly Fee */}
          <View style={[s.floatingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.floatingCardLabel, { color: theme.secondary }]}>Monthly Rent</Text>
            <Text style={[s.floatingCardValue, { color: theme.text }]} numberOfLines={1}>
              ₹{Number(renter?.monthlyFee || 0).toLocaleString()}
            </Text>
            <View
              style={[
                s.statusTag,
                { backgroundColor: isDark ? "rgba(99,102,241,0.18)" : "#EEF2FF" },
              ]}
            >
              <Ionicons name="calendar-outline" size={10} color={theme.primary} />
              <Text style={[s.statusTagText, { color: theme.primary }]}>
                {renter?.dueDateDay ? `Day ${renter.dueDateDay}` : "Monthly"}
              </Text>
            </View>
          </View>

          {/* Card 3: Maintenance */}
          <TouchableOpacity
            style={[s.floatingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => handleTabPress("repairs")}
            activeOpacity={0.8}
          >
            <Text style={[s.floatingCardLabel, { color: theme.secondary }]}>Maintenance</Text>
            <Text style={[s.floatingCardValue, { color: theme.text }]} numberOfLines={1}>
              {openRepairsCount}
            </Text>
            <View
              style={[
                s.statusTag,
                {
                  backgroundColor: openRepairsCount > 0
                    ? (isDark ? "rgba(245,158,11,0.18)" : "#FEF3C7")
                    : (isDark ? "rgba(34,197,94,0.18)" : "#DCFCE7"),
                },
              ]}
            >
              <Ionicons
                name={openRepairsCount > 0 ? "build" : "checkmark"}
                size={10}
                color={openRepairsCount > 0 ? (theme.warning || "#D97706") : theme.success}
              />
              <Text
                style={[
                  s.statusTagText,
                  { color: openRepairsCount > 0 ? (theme.warning || "#D97706") : theme.success },
                ]}
              >
                {openRepairsCount > 0 ? `${openRepairsCount} Open` : "None"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Renter Segment Tabs - Fits appropriately with smooth horizontal scroll and badges */}
      <View style={[s.tabNavWrapper, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabScrollContent}
        >
          {RENTER_TABS.map((tab) => {
            const isActive = activeTab === tab;
            let iconName: any = "person-outline";
            let label = "Details";
            let badgeCount = 0;

            if (tab === "details") {
              iconName = isActive ? "person" : "person-outline";
              label = "Details";
            } else if (tab === "fees") {
              iconName = isActive ? "wallet" : "wallet-outline";
              label = "Rent & Fees";
              badgeCount = totalDue > 0 ? 1 : 0;
            } else if (tab === "repairs") {
              iconName = isActive ? "construct" : "construct-outline";
              label = "Repairs";
              badgeCount = openRepairsCount;
            } else if (tab === "notices") {
              iconName = isActive ? "notifications" : "notifications-outline";
              label = "Notices";
              badgeCount = visibleNotifications.length;
            } else if (tab === "settings") {
              iconName = isActive ? "settings" : "settings-outline";
              label = "Settings";
            }

            return (
              <TouchableOpacity
                key={tab}
                style={[
                  s.tabPillItem,
                  {
                    backgroundColor: isActive
                      ? (isDark ? "rgba(99,102,241,0.22)" : theme.primaryLight)
                      : (isDark ? theme.surfaceSecondary : "#FFFFFF"),
                    borderColor: isActive ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => handleTabPress(tab)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={iconName}
                  size={15}
                  color={isActive ? theme.primary : theme.secondary}
                />
                <Text
                  style={[
                    s.tabPillLabel,
                    { color: isActive ? theme.primary : theme.secondary },
                    isActive && s.tabPillLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {badgeCount > 0 && (
                  <View
                    style={[
                      s.tabBadgePill,
                      {
                        backgroundColor: isActive
                          ? theme.primary
                          : tab === "fees"
                          ? theme.danger
                          : theme.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.tabBadgeText,
                        { color: "#FFFFFF" },
                      ]}
                    >
                      {badgeCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content Area with Native Horizontal Sliding Feature */}
      <View style={{ flex: 1 }} onLayout={onLayout}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPagerScrollEnd}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ================= TAB 0: DETAILS (PROFILE & RESIDENCY) ================= */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[theme.primary]}
                  tintColor={theme.primary}
                />
              }
            >
              {/* Quick Hero Banner Card */}
              <LinearGradient
                colors={isDark ? [theme.card, theme.surfaceSecondary] : ["#ffffff", "#f1f5f9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.welcomeBanner, { borderColor: theme.border }]}
              >
                <View style={[s.bannerAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={s.bannerAvatarText}>
                    {(renterName.charAt(0) || "R").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bannerName, { color: theme.text }]}>{renterName}</Text>
                  <Text style={[s.bannerSub, { color: theme.secondary }]}>{roomDisplay}</Text>
                  <View style={[s.activeTag, { backgroundColor: theme.successLight }]}>
                    <View style={[s.activeDot, { backgroundColor: theme.success }]} />
                    <Text style={[s.activeTagText, { color: theme.success }]}>Active Resident</Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Personal Details Card with Edit Action */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <Ionicons name="id-card-outline" size={20} color={theme.primary} />
                    <Text style={[s.cardTitle, { color: theme.text }]}>Personal Information</Text>
                  </View>
                  <View
                    style={[
                      s.editProfileBtn,
                      {
                        backgroundColor: isDark ? "rgba(16, 185, 129, 0.14)" : "#ECFDF5",
                        borderWidth: 1,
                        borderColor: isDark ? "#047857" : "#A7F3D0",
                      },
                    ]}
                  >
                    <Ionicons name="lock-closed" size={13} color={theme.success} />
                    <Text style={[s.editProfileBtnText, { color: theme.success }]}>Verified (Locked)</Text>
                  </View>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Full Name</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{renterName}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Email Address</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{user.email || renter?.email || "—"}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Phone Number</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>
                    {user.phone || renter?.phone || renter?.user?.phone || "—"}
                  </Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Guardian Name</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{renter?.guardianName || "—"}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Guardian Phone</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{renter?.guardianPhone || "—"}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Permanent Address</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>
                    {user.address || renter?.user?.address || "—"}
                  </Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>City / State / PIN</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>
                    {[
                      user.city || renter?.user?.city,
                      user.state || renter?.user?.state,
                      user.pincode || renter?.user?.pincode,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border, borderBottomWidth: 0 }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Emergency Contact</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>
                    {user.emergencyContactName
                      ? `${user.emergencyContactName} (${user.emergencyContactPhone || "No Phone"})`
                      : "—"}
                  </Text>
                </View>
              </View>

              {/* Stay & Room Details Card */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
                  <Ionicons name="home-outline" size={20} color={theme.primary} />
                  <Text style={[s.cardTitle, { color: theme.text }]}>Hostel & Room Details</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Hostel Name</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{hostel?.name || "Hostella"}</Text>
                </View>

                {hostel?.address ? (
                  <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                    <Text style={[s.detailKey, { color: theme.secondary }]}>Address</Text>
                    <Text style={[s.detailVal, { color: theme.text }]}>{hostel.address}</Text>
                  </View>
                ) : null}

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Room Assigned</Text>
                  <Text style={[s.detailVal, { fontWeight: "700", color: theme.primary }]}>
                    {roomDisplay}
                  </Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Joining Date</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{renter?.joiningDate || "—"}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Monthly Fee</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{money(renter?.monthlyFee || 0)}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border, borderBottomWidth: 0 }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Security Deposit</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{money(renter?.securityDeposit || 0)}</Text>
                </View>
              </View>

              {/* Quick Action Shortcuts */}
              <View style={s.shortcutsRow}>
                <TouchableOpacity
                  style={[s.shortcutBtn, { backgroundColor: theme.primary }]}
                  onPress={() => handleTabPress("fees")}
                >
                  <Ionicons name="receipt-outline" size={20} color="#FFFFFF" />
                  <Text style={s.shortcutBtnText}>View & Pay Fees</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.shortcutBtn, { backgroundColor: theme.purple || "#8B5CF6" }]}
                  onPress={() => {
                    handleTabPress("repairs");
                    setShowRepairModal(true);
                  }}
                >
                  <Ionicons name="construct-outline" size={20} color="#FFFFFF" />
                  <Text style={s.shortcutBtnText}>Lodge Complaint</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>

          {/* ================= TAB 2: PAYMENTS & FEES ================= */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[theme.primary]}
                  tintColor={theme.primary}
                />
              }
            >
              {/* Pay Rent Banner */}
              <View
                style={[
                  s.feeBanner,
                  {
                    backgroundColor: isDark ? theme.surfaceSecondary : theme.primaryLight,
                    borderColor: isDark ? theme.border : "#BFDBFE",
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.feeBannerTitle, { color: isDark ? theme.text : theme.primaryDark }]}>
                    Rent Payment Status
                  </Text>
                  <Text style={[s.feeBannerSub, { color: theme.secondary }]}>
                    {totalDue > 0
                      ? `You have ₹${totalDue.toLocaleString()} pending to pay.`
                      : "All dues cleared for this term!"}
                  </Text>
                </View>

                {fees.length > 0 ? (
                  <TouchableOpacity
                    style={[s.payProofBtn, { backgroundColor: theme.primary }]}
                    onPress={() => openProofForFee(fees[0])}
                  >
                    <Ionicons name="camera-outline" size={17} color="#FFFFFF" />
                    <Text style={s.payProofBtnText}>Upload Proof</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={[s.sectionHeading, { color: theme.text }]}>Fee Breakdown</Text>

              {fees.length === 0 ? (
                <EmptyState
                  icon="receipt-outline"
                  title="No fees generated yet"
                  description="Your hostel fees will be displayed here once generated by the administrator."
                />
              ) : (
                fees.map((fee) => {
                  const remaining = Math.max(0, Number(fee.amount || 0) - Number(fee.paidAmount || 0));
                  const isPaid = String(fee.status).toUpperCase() === "PAID" || remaining === 0;

                  return (
                    <View
                      key={fee.id}
                      style={[
                        s.feeCard,
                        { backgroundColor: theme.card, borderColor: theme.border },
                      ]}
                    >
                      <View style={s.feeCardHeader}>
                        <View>
                          <Text style={[s.feeMonthText, { color: theme.text }]}>{fee.month}</Text>
                          <Text style={[s.feeDueDate, { color: theme.secondary }]}>
                            Due: {fee.dueDate}
                          </Text>
                        </View>
                        <View
                          style={[
                            s.badge,
                            {
                              backgroundColor: isPaid ? theme.successLight : theme.dangerLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.badgeText,
                              { color: isPaid ? theme.success : theme.danger },
                            ]}
                          >
                            {isPaid ? "PAID" : fee.status || "UNPAID"}
                          </Text>
                        </View>
                      </View>

                      <View style={[s.feeDivider, { backgroundColor: theme.border }]} />

                      <View style={s.feeAmountsRow}>
                        <View>
                          <Text style={[s.feeLabel, { color: theme.secondary }]}>Total Amount</Text>
                          <Text style={[s.feeVal, { color: theme.text }]}>{money(fee.amount)}</Text>
                        </View>
                        <View>
                          <Text style={[s.feeLabel, { color: theme.secondary }]}>Paid Amount</Text>
                          <Text style={[s.feeVal, { color: theme.success }]}>
                            {money(fee.paidAmount || 0)}
                          </Text>
                        </View>
                        <View>
                          <Text style={[s.feeLabel, { color: theme.secondary }]}>Remaining</Text>
                          <Text style={[s.feeVal, { color: remaining > 0 ? theme.danger : theme.success }]}>
                            {money(remaining)}
                          </Text>
                        </View>
                      </View>

                      {!isPaid ? (
                        <TouchableOpacity
                          style={[s.feeActionBtn, { backgroundColor: theme.primaryLight }]}
                          onPress={() => openProofForFee(fee)}
                        >
                          <Ionicons name="cloud-upload-outline" size={16} color={theme.primary} />
                          <Text style={[s.feeActionBtnText, { color: theme.primary }]}>
                            Submit Payment Proof
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })
              )}

              {/* Payment Proof History */}
              <Text style={[s.sectionHeading, { marginTop: 24, color: theme.text }]}>
                Payment Submissions ({payments.length})
              </Text>

              {payments.length === 0 ? (
                <EmptyState
                  icon="time-outline"
                  title="No payment proofs uploaded"
                  description="When you pay via UPI/bank and upload screenshots, their verification status will appear here."
                />
              ) : (
                payments.map((p) => {
                  const status = String(p.status || "SUBMITTED").toUpperCase();
                  const isApproved = status === "APPROVED" || status === "PAID";
                  const isRejected = status === "REJECTED";

                  return (
                    <View
                      key={p.id}
                      style={[
                        s.paymentHistoryCard,
                        { backgroundColor: theme.card, borderColor: theme.border },
                      ]}
                    >
                      <View style={s.paymentHistoryTop}>
                        <View>
                          <Text style={[s.paymentAmt, { color: theme.text }]}>
                            ₹{Number(p.amount || 0).toLocaleString()}
                          </Text>
                          <Text style={[s.paymentDate, { color: theme.secondary }]}>
                            {p.paymentDate || p.submittedAt?.slice(0, 10) || today()}
                          </Text>
                        </View>
                        <View
                          style={[
                            s.badge,
                            {
                              backgroundColor: isApproved
                                ? theme.successLight
                                : isRejected
                                ? theme.dangerLight
                                : theme.warningLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.badgeText,
                              {
                                color: isApproved
                                  ? theme.success
                                  : isRejected
                                  ? theme.danger
                                  : theme.warning,
                              },
                            ]}
                          >
                            {status}
                          </Text>
                        </View>
                      </View>

                      {p.reference ? (
                        <Text style={[s.paymentRef, { color: theme.secondary }]}>
                          Ref / UTR: {p.reference}
                        </Text>
                      ) : null}

                      {p.notes ? (
                        <Text style={[s.paymentNotes, { color: theme.secondary }]}>
                          Notes: {p.notes}
                        </Text>
                      ) : null}

                      {p.reviewNote ? (
                        <View
                          style={[
                            s.adminReviewBox,
                            {
                              backgroundColor: isApproved
                                ? theme.successLight
                                : theme.dangerLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.adminReviewText,
                              { color: isApproved ? theme.success : theme.danger },
                            ]}
                          >
                            Admin note: {p.reviewNote}
                          </Text>
                        </View>
                      ) : null}

                      <View style={s.paymentActionRow}>
                        {(() => {
                          const proofUrl = getFullProofUrl(p.proofUrl, p.proofUploadId);

                          return proofUrl ? (
                            <TouchableOpacity
                              style={[s.viewProofBtn, { backgroundColor: theme.primaryLight }]}
                              onPress={() => setPreviewImageUrl(proofUrl)}
                            >
                              <Ionicons name="image-outline" size={14} color={theme.primary} />
                              <Text style={[s.viewProofBtnText, { color: theme.primary }]}>
                                View Screenshot
                              </Text>
                            </TouchableOpacity>
                          ) : null;
                        })()}

                        {!isApproved ? (
                          <TouchableOpacity
                            style={[s.deleteProofBtn, { backgroundColor: theme.dangerLight }]}
                            onPress={() => handleDeletePaymentProof(p.id)}
                          >
                            <Ionicons name="trash-outline" size={14} color={theme.danger} />
                            <Text style={[s.deleteProofBtnText, { color: theme.danger }]}>
                              Withdraw
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* ================= TAB 3: REPAIRS ================= */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[theme.primary]}
                  tintColor={theme.primary}
                />
              }
            >
              <View style={s.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sectionTitle, { color: theme.text }]}>Maintenance Requests</Text>
                  <Text style={[s.sectionSubtitle, { color: theme.secondary }]}>
                    Report room or hostel issues for fast admin & technician resolution.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.addRepairBtn, { backgroundColor: theme.primary }]}
                  onPress={() => setShowRepairModal(true)}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={s.addRepairBtnText}>New Issue</Text>
                </TouchableOpacity>
              </View>

              {repairs.length === 0 ? (
                <EmptyState
                  icon="construct-outline"
                  title="No maintenance complaints"
                  description="Everything running smoothly! Tap 'New Issue' above if you need anything fixed."
                />
              ) : (
                repairs.map((r) => {
                  const status = String(r.status || "SUBMITTED").toUpperCase();
                  const isResolved = status === "RESOLVED";
                  const isInProgress = status === "IN_PROGRESS";

                  return (
                    <View
                      key={r.id}
                      style={[
                        s.repairCard,
                        { backgroundColor: theme.card, borderColor: theme.border },
                      ]}
                    >
                      <View style={s.repairCardTop}>
                        <Text style={[s.repairTitle, { color: theme.text }]}>{r.title}</Text>
                        <View
                          style={[
                            s.badge,
                            {
                              backgroundColor: isResolved
                                ? theme.successLight
                                : isInProgress
                                ? theme.warningLight
                                : theme.primaryLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.badgeText,
                              {
                                color: isResolved
                                  ? theme.success
                                  : isInProgress
                                  ? theme.warning
                                  : theme.primary,
                              },
                            ]}
                          >
                            {status.replace("_", " ")}
                          </Text>
                        </View>
                      </View>

                      <Text style={[s.repairDesc, { color: theme.secondary }]}>{r.description}</Text>

                      {/* Visual 3-Stage Progress Tracker */}
                      <View style={s.progressTrackRow}>
                        <View
                          style={[
                            s.progressStep,
                            { backgroundColor: theme.primary },
                          ]}
                        >
                          <Text style={s.progressStepText}>1. Logged</Text>
                        </View>
                        <View
                          style={[
                            s.progressStep,
                            {
                              backgroundColor:
                                isInProgress || isResolved ? theme.warning : theme.surfaceSecondary,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.progressStepText,
                              {
                                color:
                                  isInProgress || isResolved
                                    ? "#FFFFFF"
                                    : theme.secondary,
                              },
                            ]}
                          >
                            2. In Progress
                          </Text>
                        </View>
                        <View
                          style={[
                            s.progressStep,
                            {
                              backgroundColor: isResolved ? theme.success : theme.surfaceSecondary,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.progressStepText,
                              {
                                color: isResolved ? "#FFFFFF" : theme.secondary,
                              },
                            ]}
                          >
                            3. Resolved
                          </Text>
                        </View>
                      </View>

                      {r.adminNotes ? (
                        <View
                          style={[
                            s.adminNotesBox,
                            {
                              backgroundColor: isDark ? theme.surfaceSecondary : "#F8FAFC",
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <Text style={[s.adminNotesLabel, { color: theme.primary }]}>
                            Warden / Technician Update:
                          </Text>
                          <Text style={[s.adminNotesText, { color: theme.text }]}>
                            {r.adminNotes}
                          </Text>
                        </View>
                      ) : null}

                      <View style={s.repairCardFooter}>
                        <Text style={[s.repairDate, { color: theme.secondary }]}>
                          Reported: {r.createdAt?.slice(0, 10) || today()}
                        </Text>
                        {r.priority ? (
                          <Text style={[s.repairPriority, { color: theme.primary }]}>
                            Priority: {r.priority}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* ================= TAB 4: NOTICES & ANNOUNCEMENTS ================= */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[theme.primary]}
                  tintColor={theme.primary}
                />
              }
            >
              <View style={s.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sectionTitle, { color: theme.text }]}>Announcements & Notices</Text>
                  <Text style={[s.sectionSubtitle, { color: theme.secondary }]}>
                    Important alerts, reminders, and updates from your hostel management.
                  </Text>
                </View>
                {visibleNotifications.length > 0 ? (
                  <TouchableOpacity
                    style={[s.clearAllBtn, { backgroundColor: theme.dangerLight }]}
                    onPress={handleClearAllNotifications}
                  >
                    <Ionicons name="trash-outline" size={14} color={theme.danger} />
                    <Text style={[s.clearAllBtnText, { color: theme.danger }]}>Clear All</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {visibleNotifications.length === 0 ? (
                <EmptyState
                  icon="notifications-outline"
                  title="No new notices"
                  description="You are completely caught up! New hostel announcements will be delivered here."
                />
              ) : (
                visibleNotifications.map((notif) => {
                  const isUrgent =
                    notif.type === "URGENT" ||
                    notif.type === "ALERT" ||
                    notif.type === "FEE_OVERDUE";
                  const isMaintenance = notif.type === "MAINTENANCE" || notif.entityType === "REPAIR";

                  return (
                    <View
                      key={notif.id}
                      style={[
                        s.noticeCard,
                        {
                          backgroundColor: theme.card,
                          borderColor: theme.border,
                          borderLeftColor: isUrgent
                            ? theme.danger
                            : isMaintenance
                            ? theme.orange || "#F97316"
                            : theme.primary,
                        },
                      ]}
                    >
                      <View style={s.noticeCardHeader}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                          <Ionicons
                            name={
                              isUrgent
                                ? "alert-circle"
                                : isMaintenance
                                ? "construct"
                                : "megaphone"
                            }
                            size={18}
                            color={
                              isUrgent
                                ? theme.danger
                                : isMaintenance
                                ? theme.orange || "#F97316"
                                : theme.primary
                            }
                          />
                          <Text style={[s.noticeTitle, { color: theme.text }]}>
                            {notif.title}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteNotification(notif.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle-outline" size={18} color={theme.secondary} />
                        </TouchableOpacity>
                      </View>

                      <Text style={[s.noticeMsg, { color: theme.text }]}>{notif.message}</Text>

                      <Text style={[s.noticeDate, { color: theme.secondary }]}>
                        {notif.createdAt?.slice(0, 10) || today()}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>

          {/* ================= TAB 5: SETTINGS ================= */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={[theme.primary]}
                  tintColor={theme.primary}
                />
              }
            >
              <View style={s.sectionHeaderRow}>
                <View>
                  <Text style={[s.sectionTitle, { color: theme.text }]}>Settings & Security</Text>
                  <Text style={[s.sectionSubtitle, { color: theme.secondary }]}>
                    Customize app appearance and update your resident account credentials.
                  </Text>
                </View>
              </View>

              {/* 1. Appearance & Theme Selection Card */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
                  <Ionicons name="color-palette-outline" size={20} color={theme.primary} />
                  <Text style={[s.cardTitle, { color: theme.text }]}>Appearance & Theme</Text>
                </View>
                <Text style={{ fontSize: 13, color: theme.secondary, marginBottom: 14 }}>
                  Switch between light and dark mode for a comfortable viewing experience.
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    style={[
                      s.themeOptionBtn,
                      {
                        borderColor: !isDark ? theme.primary : theme.border,
                        backgroundColor: !isDark ? theme.primaryLight : theme.surfaceSecondary,
                      },
                    ]}
                    onPress={() => setTheme("light")}
                  >
                    <Ionicons
                      name="sunny"
                      size={22}
                      color={!isDark ? theme.primary : theme.secondary}
                    />
                    <Text
                      style={[
                        s.themeOptionText,
                        {
                          color: !isDark ? theme.primary : theme.secondary,
                          fontWeight: !isDark ? "700" : "500",
                        },
                      ]}
                    >
                      Light Mode
                    </Text>
                    {!isDark ? (
                      <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                    ) : null}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      s.themeOptionBtn,
                      {
                        borderColor: isDark ? theme.primary : theme.border,
                        backgroundColor: isDark ? theme.primaryLight : theme.surfaceSecondary,
                      },
                    ]}
                    onPress={() => setTheme("dark")}
                  >
                    <Ionicons
                      name="moon"
                      size={22}
                      color={isDark ? theme.primary : theme.secondary}
                    />
                    <Text
                      style={[
                        s.themeOptionText,
                        {
                          color: isDark ? theme.primary : theme.secondary,
                          fontWeight: isDark ? "700" : "500",
                        },
                      ]}
                    >
                      Dark Mode
                    </Text>
                    {isDark ? (
                      <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                    ) : null}
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2. Create / Change Password Card */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
                  <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
                  <Text style={[s.cardTitle, { color: theme.text }]}>Make / Change Password</Text>
                </View>
                <Text style={{ fontSize: 13, color: theme.secondary, marginBottom: 14, lineHeight: 19 }}>
                  Set your personal password so you can sign in directly with your email (
                  {user.email || renter?.email || "your registered email"}) without relying on an administrator.
                </Text>

                {passwordMsg ? (
                  <View
                    style={[
                      s.feedbackBanner,
                      {
                        backgroundColor:
                          passwordMsg.type === "success" ? theme.successLight : theme.dangerLight,
                        borderColor:
                          passwordMsg.type === "success" ? theme.success : theme.danger,
                      },
                    ]}
                  >
                    <Ionicons
                      name={passwordMsg.type === "success" ? "checkmark-circle" : "alert-circle"}
                      size={18}
                      color={passwordMsg.type === "success" ? theme.success : theme.danger}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: passwordMsg.type === "success" ? theme.success : theme.danger,
                        fontWeight: "600",
                      }}
                    >
                      {passwordMsg.text}
                    </Text>
                  </View>
                ) : null}

                <Text style={[s.inputLabel, { color: theme.text }]}>New Password *</Text>
                <View
                  style={[
                    s.passwordInputWrap,
                    { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                  ]}
                >
                  <TextInput
                    style={[s.passwordInputText, { color: theme.text }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Minimum 6 characters"
                    placeholderTextColor={theme.secondary}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowNewPassword((v) => !v)}>
                    <Ionicons
                      name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={theme.secondary}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={[s.inputLabel, { color: theme.text }]}>Confirm Password *</Text>
                <View
                  style={[
                    s.passwordInputWrap,
                    { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                  ]}
                >
                  <TextInput
                    style={[s.passwordInputText, { color: theme.text }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter password"
                    placeholderTextColor={theme.secondary}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword((v) => !v)}>
                    <Ionicons
                      name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={theme.secondary}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[s.primaryButton, { backgroundColor: theme.primary }, savingPassword && s.btnDisabled]}
                  onPress={handleChangePassword}
                  disabled={savingPassword}
                >
                  {savingPassword ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-outline" size={18} color="#FFFFFF" />
                      <Text style={s.primaryButtonText}>Save Password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* 3. Security & Biometrics Card */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
                  <Ionicons
                    name={biometricLabel.toLowerCase().includes("face") ? "scan-outline" : "finger-print-outline"}
                    size={20}
                    color={theme.primary}
                  />
                  <Text style={[s.cardTitle, { color: theme.text }]}>Security & Biometrics</Text>
                </View>
                <Text style={{ fontSize: 13, color: theme.secondary, marginBottom: 14, lineHeight: 19 }}>
                  {isBiometricsSupported
                    ? `Unlock Hostella instantly using your device ${biometricLabel} without entering passwords repeatedly.`
                    : "Biometric hardware is not available or enrolled on this device. Please set up a fingerprint or Face ID in device settings."}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: theme.surfaceSecondary,
                    borderRadius: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 10 }}>
                    <Ionicons
                      name={biometricLabel.toLowerCase().includes("face") ? "scan-outline" : "finger-print-outline"}
                      size={24}
                      color={isBiometricsEnabled ? COLORS.success : theme.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>
                        {biometricLabel} Unlock
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.secondary }}>
                        {isBiometricsEnabled ? "Enabled — app locks when closed" : "Disabled"}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isBiometricsEnabled}
                    disabled={!isBiometricsSupported}
                    onValueChange={(val) => {
                      if (onToggleBiometrics) {
                        void onToggleBiometrics(val);
                      }
                    }}
                    trackColor={{ false: theme.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              {/* 4. Account Actions Card */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[s.cardHeader, { borderBottomColor: theme.border }]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
                  <Text style={[s.cardTitle, { color: theme.text }]}>Account Information</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Registered Email</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{user.email || "—"}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Resident ID</Text>
                  <Text style={[s.detailVal, { color: theme.text }]}>{renter?.id || user.id}</Text>
                </View>

                <View style={[s.detailRow, { borderBottomColor: theme.border, borderBottomWidth: 0 }]}>
                  <Text style={[s.detailKey, { color: theme.secondary }]}>Hostel Assigned</Text>
                  <Text style={[s.detailVal, { color: theme.primary, fontWeight: "700" }]}>
                    {hostel?.name || "Hostella"}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[s.dangerOutlineBtn, { borderColor: theme.danger }]}
                  onPress={onLogout}
                >
                  <Ionicons name="log-out-outline" size={18} color={theme.danger} />
                  <Text style={[s.dangerOutlineBtnText, { color: theme.danger }]}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      {/* ================= MODAL: EDIT PERSONAL PROFILE ================= */}
      <Modal
        visible={showEditProfileModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditProfileModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.modalOverlay}
        >
          <View style={[s.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Edit Personal Details</Text>
              <TouchableOpacity onPress={() => setShowEditProfileModal(false)}>
                <Ionicons name="close" size={24} color={theme.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.inputLabel, { color: theme.text }]}>First Name *</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="First Name"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Last Name</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder="Last Name"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Mobile Phone Number</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+91 Mobile Number"
                placeholderTextColor={theme.secondary}
                keyboardType="phone-pad"
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Guardian Name</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editGuardianName}
                onChangeText={setEditGuardianName}
                placeholder="Parent / Guardian Name"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Guardian Phone Number</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editGuardianPhone}
                onChangeText={setEditGuardianPhone}
                placeholder="+91 Guardian Phone"
                placeholderTextColor={theme.secondary}
                keyboardType="phone-pad"
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Permanent Address</Text>
              <TextInput
                style={[s.input, s.textArea, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="House / Street / Area"
                placeholderTextColor={theme.secondary}
                multiline
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.inputLabel, { color: theme.text }]}>City</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                    value={editCity}
                    onChangeText={setEditCity}
                    placeholder="City"
                    placeholderTextColor={theme.secondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.inputLabel, { color: theme.text }]}>State</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                    value={editState}
                    onChangeText={setEditState}
                    placeholder="State"
                    placeholderTextColor={theme.secondary}
                  />
                </View>
              </View>

              <Text style={[s.inputLabel, { color: theme.text }]}>Pincode</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editPincode}
                onChangeText={setEditPincode}
                placeholder="PIN Code"
                placeholderTextColor={theme.secondary}
                keyboardType="numeric"
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Emergency Contact Name</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editEmergencyName}
                onChangeText={setEditEmergencyName}
                placeholder="Emergency Contact Name"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Emergency Contact Phone</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={editEmergencyPhone}
                onChangeText={setEditEmergencyPhone}
                placeholder="+91 Emergency Phone"
                placeholderTextColor={theme.secondary}
                keyboardType="phone-pad"
              />

              <TouchableOpacity
                style={[s.submitModalBtn, { backgroundColor: theme.primary }, savingProfile && s.btnDisabled]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={s.submitModalBtnText}>Save Personal Details</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= MODAL: SUBMIT PROOF ================= */}
      <Modal
        visible={showProofModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProofModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.modalOverlay}
        >
          <View style={[s.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Upload Payment Proof</Text>
              <TouchableOpacity onPress={() => setShowProofModal(false)}>
                <Ionicons name="close" size={24} color={theme.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.inputLabel, { color: theme.text }]}>Select Fee Month *</Text>
              <View style={s.feeSelectorRow}>
                {fees.map((fee) => (
                  <TouchableOpacity
                    key={fee.id}
                    style={[
                      s.feeSelectChip,
                      { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                      selectedFeeId === fee.id && {
                        backgroundColor: theme.primaryLight,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => {
                      setSelectedFeeId(fee.id);
                      const rem = Math.max(0, Number(fee.amount || 0) - Number(fee.paidAmount || 0));
                      setProofAmount(String(rem > 0 ? rem : fee.amount));
                    }}
                  >
                    <Text
                      style={[
                        s.feeSelectChipText,
                        { color: theme.secondary },
                        selectedFeeId === fee.id && { color: theme.primary },
                      ]}
                    >
                      {fee.month}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.inputLabel, { color: theme.text }]}>Amount Paid (₹) *</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                keyboardType="numeric"
                value={proofAmount}
                onChangeText={setProofAmount}
                placeholder="e.g. 5000"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Payment Date (YYYY-MM-DD)</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={proofDate}
                onChangeText={setProofDate}
                placeholder="2026-10-03"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>UPI / Bank Reference / UTR Number</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={proofReference}
                onChangeText={setProofReference}
                placeholder="e.g. UPI Ref / 12-digit UTR"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Notes (Optional)</Text>
              <TextInput
                style={[s.input, s.textArea, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={proofNotes}
                onChangeText={setProofNotes}
                placeholder="Any special transaction note"
                placeholderTextColor={theme.secondary}
                multiline
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Screenshot / Photo Proof *</Text>
              <View style={s.imagePickerOptions}>
                <TouchableOpacity
                  style={[s.pickerOptionBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                  onPress={pickImageFromGallery}
                >
                  <Ionicons name="images-outline" size={20} color={theme.primary} />
                  <Text style={[s.pickerOptionText, { color: theme.primary }]}>Pick from Gallery</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.pickerOptionBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
                  onPress={takePhotoWithCamera}
                >
                  <Ionicons name="camera-outline" size={20} color={theme.primary} />
                  <Text style={[s.pickerOptionText, { color: theme.primary }]}>Take Photo</Text>
                </TouchableOpacity>
              </View>

              {proofImageUri ? (
                <View style={[s.previewContainer, { borderColor: theme.border }]}>
                  <Image source={{ uri: proofImageUri }} style={s.previewImage} resizeMode="contain" />
                  <TouchableOpacity
                    style={[s.removeImageBtn, { backgroundColor: theme.danger }]}
                    onPress={() => {
                      setProofImageUri(null);
                      setProofMimeType(null);
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                    <Text style={s.removeImageText}>Remove Screenshot</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                style={[s.submitModalBtn, { backgroundColor: theme.primary }, submittingProof && s.btnDisabled]}
                onPress={handleSendProof}
                disabled={submittingProof}
              >
                {submittingProof ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={s.submitModalBtnText}>Send to Admin for Review</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= MODAL: NEW REPAIR COMPLAINT ================= */}
      <Modal
        visible={showRepairModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRepairModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.modalOverlay}
        >
          <View style={[s.modalBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Lodge Repair Complaint</Text>
              <TouchableOpacity onPress={() => setShowRepairModal(false)}>
                <Ionicons name="close" size={24} color={theme.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.inputLabel, { color: theme.text }]}>Issue Title *</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={repairTitle}
                onChangeText={setRepairTitle}
                placeholder="e.g. Geyser not heating / Tap leakage"
                placeholderTextColor={theme.secondary}
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Description & Details *</Text>
              <TextInput
                style={[s.input, s.textArea, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.text }]}
                value={repairDescription}
                onChangeText={setRepairDescription}
                placeholder="Describe what is broken and when it started"
                placeholderTextColor={theme.secondary}
                multiline
              />

              <Text style={[s.inputLabel, { color: theme.text }]}>Priority Level</Text>
              <View style={s.prioritySelectorRow}>
                {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      s.priorityChip,
                      { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                      repairPriority === p && {
                        backgroundColor: theme.primaryLight,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => setRepairPriority(p)}
                  >
                    <Text
                      style={[
                        s.priorityChipText,
                        { color: theme.secondary },
                        repairPriority === p && { color: theme.primary },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.submitModalBtn, { backgroundColor: theme.primary }, submittingRepair && s.btnDisabled]}
                onPress={handleSendRepair}
                disabled={submittingRepair}
              >
                {submittingRepair ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={s.submitModalBtnText}>Register Complaint</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= MODAL: IMAGE PREVIEW ================= */}
      <Modal
        visible={!!previewImageUrl}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View style={s.previewModalOverlay}>
          <TouchableOpacity
            style={s.closePreviewBtn}
            onPress={() => setPreviewImageUrl(null)}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUrl ? (
            <Image
              source={{ uri: previewImageUrl }}
              style={s.fullPreviewImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

// ── Theme-Aware Stylesheet Factory ───────────────────────────────────────────
function createStyles(theme: ReturnType<typeof useTheme>["colors"], isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    heroContainer: {
      width: "100%",
      overflow: "hidden",
    },
    heroBannerGradient: {
      paddingTop: Platform.OS === "ios" ? 18 : 14,
      paddingBottom: 40,
      paddingHorizontal: 16,
    },
    ambientOrb: {
      position: "absolute",
      borderRadius: 999,
    },
    headerTopBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    brandLogoCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(59, 130, 246, 0.45)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    brandTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: "#FFFFFF",
      letterSpacing: -0.3,
    },
    brandSubtitle: {
      fontSize: 11,
      color: "rgba(255, 255, 255, 0.72)",
      marginTop: 1,
    },
    heroActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    heroIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.18)",
    },
    activePropertyCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.15)",
      borderRadius: 16,
      padding: 14,
    },
    activePropertyLeft: {
      flex: 1,
      marginRight: 10,
    },
    activePropertyBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: "rgba(16, 185, 129, 0.22)",
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      gap: 5,
      marginBottom: 6,
    },
    activeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#10B981",
    },
    activeBadgeText: {
      fontSize: 10.5,
      fontWeight: "800",
      color: "#34D399",
      letterSpacing: 0.3,
    },
    activePropertyName: {
      fontSize: 16,
      fontWeight: "800",
      color: "#FFFFFF",
      letterSpacing: -0.3,
    },
    activePropertyLocRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 4,
    },
    activePropertyLocText: {
      fontSize: 12,
      color: "rgba(255, 255, 255, 0.75)",
    },
    activePropertyActionBox: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    propertyIconCircle: {
      alignItems: "center",
      justifyContent: "center",
    },
    floatingKpiRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      marginTop: -26,
      marginBottom: 12,
    },
    floatingCard: {
      flex: 1,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    floatingCardLabel: {
      fontSize: 10.5,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    floatingCardValue: {
      fontSize: 16,
      fontWeight: "800",
      marginTop: 4,
      marginBottom: 6,
    },
    statusTag: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      paddingHorizontal: 6,
      paddingVertical: 2.5,
      borderRadius: 8,
      gap: 4,
    },
    statusTagText: {
      fontSize: 10,
      fontWeight: "700",
    },
    quickDueBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginBottom: 16,
      gap: 12,
    },
    quickDueBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    quickDueBtnText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "800",
    },
    hostelInfoCard: {
      marginTop: 18,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
    },
    hostelIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    hostelInfoName: {
      fontSize: 15,
      fontWeight: "800",
    },
    hostelInfoAddress: {
      fontSize: 12.5,
      marginTop: 2,
    },
    tabNavWrapper: {
      borderBottomWidth: 1,
      paddingVertical: 8,
    },
    tabScrollContent: {
      paddingHorizontal: 12,
      gap: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    tabPillItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      gap: 6,
    },
    tabPillLabel: {
      fontSize: 12.5,
      fontWeight: "600",
    },
    tabPillLabelActive: {
      fontWeight: "800",
    },
    tabBadgePill: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
      marginLeft: 2,
    },
    tabBadgeText: {
      fontSize: 10,
      fontWeight: "800",
    },
    tabNav: {
      flexDirection: "row",
      borderBottomWidth: 1,
      paddingHorizontal: 12,
    },
    tabNavItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      gap: 4,
      borderBottomWidth: 3,
      borderBottomColor: "transparent",
    },
    tabNavLabel: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    tabNavLabelActive: {
      fontWeight: "800",
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 110,
    },
    welcomeBanner: {
      flexDirection: "row",
      alignItems: "center",
      padding: 20,
      borderRadius: 20,
      borderWidth: 1,
      gap: 16,
      marginBottom: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 10,
      elevation: 3,
    },
    bannerAvatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: "center",
      justifyContent: "center",
    },
    bannerAvatarText: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "800",
    },
    bannerName: {
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    bannerSub: {
      fontSize: 14,
      marginTop: 4,
      opacity: 0.8,
    },
    activeTag: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
      gap: 6,
    },
    activeTagText: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    statsRow: {
      flexDirection: "row",
      gap: 14,
      marginBottom: 20,
    },
    statBox: {
      flex: 1,
      padding: 16,
      borderRadius: 18,
      borderLeftWidth: 5,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    statBoxLabel: {
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      opacity: 0.8,
    },
    statBoxVal: {
      fontSize: 24,
      fontWeight: "900",
      marginTop: 6,
      letterSpacing: -0.5,
    },
    card: {
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      marginBottom: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 10,
      elevation: 3,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
      borderBottomWidth: 1,
      paddingBottom: 12,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: "800",
      flex: 1,
      letterSpacing: -0.3,
    },
    editProfileBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    editProfileBtnText: {
      fontSize: 13,
      fontWeight: "800",
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    detailKey: {
      fontSize: 14,
      fontWeight: "600",
      opacity: 0.9,
    },
    detailVal: {
      fontSize: 14,
      fontWeight: "700",
      maxWidth: "65%",
      textAlign: "right",
    },
    shortcutsRow: {
      flexDirection: "row",
      gap: 14,
      marginTop: 6,
    },
    shortcutBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      borderRadius: 16,
      gap: 10,
    },
    shortcutBtnText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },
    feeBanner: {
      padding: 20,
      borderRadius: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      gap: 14,
      marginBottom: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    feeBannerTitle: {
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    feeBannerSub: {
      fontSize: 14,
      marginTop: 4,
      opacity: 0.9,
    },
    payProofBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      gap: 8,
    },
    payProofBtnText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "800",
    },
    sectionHeading: {
      fontSize: 18,
      fontWeight: "800",
      marginBottom: 12,
      letterSpacing: -0.3,
    },
    feeCard: {
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 8,
      elevation: 3,
    },
    feeCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    feeMonthText: {
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    feeDueDate: {
      fontSize: 13,
      marginTop: 4,
      opacity: 0.8,
    },
    feeDivider: {
      height: 1,
      marginVertical: 14,
      opacity: 0.5,
    },
    feeAmountsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    feeLabel: {
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      opacity: 0.7,
    },
    feeVal: {
      fontSize: 16,
      fontWeight: "800",
      marginTop: 2,
    },
    feeActionBtn: {
      marginTop: 18,
      paddingVertical: 12,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    feeActionBtnText: {
      fontSize: 14,
      fontWeight: "700",
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    paymentHistoryCard: {
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      marginBottom: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    paymentHistoryTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    paymentAmt: {
      fontSize: 18,
      fontWeight: "800",
    },
    paymentDate: {
      fontSize: 13,
      marginTop: 2,
      opacity: 0.8,
    },
    paymentRef: {
      fontSize: 13,
      marginTop: 8,
    },
    paymentNotes: {
      fontSize: 13,
      marginTop: 4,
      fontStyle: "italic",
    },
    adminReviewBox: {
      padding: 10,
      borderRadius: 8,
      marginTop: 10,
    },
    adminReviewText: {
      fontSize: 13,
      fontWeight: "600",
    },
    paymentActionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
    },
    viewProofBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      gap: 6,
    },
    viewProofBtnText: {
      fontSize: 13,
      fontWeight: "700",
    },
    deleteProofBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      gap: 6,
    },
    deleteProofBtnText: {
      fontSize: 13,
      fontWeight: "700",
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    sectionSubtitle: {
      fontSize: 14,
      marginTop: 4,
      lineHeight: 20,
      opacity: 0.8,
    },
    addRepairBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      gap: 6,
    },
    addRepairBtnText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    repairCard: {
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      marginBottom: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    repairCardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    repairTitle: {
      fontSize: 16,
      fontWeight: "800",
      flex: 1,
      marginRight: 10,
    },
    repairDesc: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
      opacity: 0.9,
    },
    progressTrackRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    progressStep: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    progressStepText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    adminNotesBox: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 12,
    },
    adminNotesLabel: {
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    adminNotesText: {
      fontSize: 14,
      lineHeight: 20,
    },
    repairCardFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 6,
    },
    repairDate: {
      fontSize: 12,
      opacity: 0.7,
    },
    repairPriority: {
      fontSize: 12,
      fontWeight: "800",
    },
    clearAllBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      gap: 6,
    },
    clearAllBtnText: {
      fontSize: 13,
      fontWeight: "700",
    },
    noticeCard: {
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderLeftWidth: 6,
      marginBottom: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    noticeCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    noticeTitle: {
      fontSize: 16,
      fontWeight: "800",
    },
    noticeMsg: {
      fontSize: 14,
      lineHeight: 22,
      marginBottom: 10,
      opacity: 0.9,
    },
    noticeDate: {
      fontSize: 12,
      opacity: 0.7,
    },
    themeOptionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 16,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1.5,
    },
    themeOptionText: {
      fontSize: 15,
      fontWeight: "600",
    },
    passwordInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      minHeight: 52,
      marginBottom: 16,
    },
    passwordInputText: {
      flex: 1,
      fontSize: 16,
      minHeight: 50,
    },
    feedbackBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 20,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
    },
    dangerOutlineBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      marginTop: 10,
      backgroundColor: "transparent",
    },
    dangerOutlineBtnText: {
      fontSize: 16,
      fontWeight: "800",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "flex-end",
    },
    modalBox: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      maxHeight: "90%",
      borderWidth: 1,
      borderBottomWidth: 0,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 20,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: "700",
      marginTop: 14,
      marginBottom: 8,
      opacity: 0.9,
    },
    input: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      borderWidth: 1,
    },
    textArea: {
      minHeight: 90,
      textAlignVertical: "top",
    },
    feeSelectorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    feeSelectChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    feeSelectChipText: {
      fontSize: 14,
      fontWeight: "700",
    },
    imagePickerOptions: {
      flexDirection: "row",
      gap: 14,
      marginTop: 6,
    },
    pickerOptionBtn: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
    },
    pickerOptionText: {
      fontSize: 14,
      fontWeight: "700",
    },
    previewContainer: {
      marginTop: 10,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
    },
    previewImage: {
      width: "100%",
      height: 200,
    },
    removeImageBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      gap: 6,
    },
    removeImageText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "800",
    },
    prioritySelectorRow: {
      flexDirection: "row",
      gap: 10,
    },
    priorityChip: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
      borderRadius: 12,
      borderWidth: 1,
    },
    priorityChipText: {
      fontSize: 12,
      fontWeight: "800",
    },
    submitModalBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      borderRadius: 14,
      gap: 10,
      marginTop: 24,
      marginBottom: 12,
    },
    submitModalBtnText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
    },
    btnDisabled: {
      opacity: 0.65,
    },
    previewModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
      justifyContent: "center",
      alignItems: "center",
    },
    closePreviewBtn: {
      position: "absolute",
      top: 55,
      right: 25,
      zIndex: 10,
      padding: 10,
    },
    fullPreviewImage: {
      width: "95%",
      height: "85%",
      borderRadius: 16,
    },
  });
}
