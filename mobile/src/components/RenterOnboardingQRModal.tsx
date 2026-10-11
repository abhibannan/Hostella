import React, { useState, useEffect } from "react";
import {
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useTheme } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { Room } from "../types";

interface RenterOnboardingQRModalProps {
  visible: boolean;
  onClose: () => void;
  hostelId: string;
  hostelName: string;
  rooms: Room[];
}

export function RenterOnboardingQRModal({
  visible,
  onClose,
  hostelId,
  hostelName,
  rooms,
}: RenterOnboardingQRModalProps) {
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const [selectedRoomId, setSelectedRoomId] = useState<string>("ALL");
  const [showRoomDropdown, setShowRoomDropdown] = useState<boolean>(false);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  
  // Available rooms for general selection
  const availableRooms = rooms.filter(
    (r) => r.status !== "MAINTENANCE" && r.status !== "INACTIVE"
  );

  let roomParams = "";
  if (selectedRoom) {
    roomParams = `&room=${encodeURIComponent(selectedRoom.roomNumber)}&lockRoom=1`;
  } else if (availableRooms.length > 0) {
    const serializedRooms = availableRooms
      .map((r) => `${encodeURIComponent(r.roomNumber)}:${encodeURIComponent(String(r.floor || ""))}`)
      .join(";");
    roomParams = `&rooms=${encodeURIComponent(serializedRooms)}`;
  }

  const hostelNameParam = hostelName ? `&hostelName=${encodeURIComponent(hostelName)}` : "";
  const inviteUrl = `https://abhibannan.github.io/Hostella/?page=join&hostelId=${encodeURIComponent(hostelId)}${hostelNameParam}${roomParams}`;

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(inviteUrl);
    toast.success("Self-onboarding link copied to clipboard!", "Copied");
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Welcome to ${hostelName}! Complete your self-onboarding registration using this link: ${inviteUrl}`,
        title: `Join ${hostelName} on Hostella`,
      });
    } catch (e) {
      console.warn("Share failed:", e);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.iconBadge, { backgroundColor: isDark ? "rgba(99, 102, 241, 0.15)" : "#EEF2FF" }]}>
                <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Renter Self-Onboarding</Text>
                <Text style={[styles.subtitle, { color: colors.secondary }]}>{hostelName}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.secondary} />
            </TouchableOpacity>
          </View>

          {/* QR Code Container */}
          <View style={styles.qrWrapper}>
            <View style={styles.qrBorder}>
              <QRCode
                value={inviteUrl}
                size={200}
                color="#1E1B4B"
                backgroundColor="#FFFFFF"
              />
            </View>
            <Text style={[styles.instruction, { color: colors.secondary }]}>
              Show this QR code to the new resident. Once scanned with their camera, they can register and submit their details immediately.
            </Text>
          </View>

          {/* Room Selector if specific room allocation */}
          {rooms.length > 0 && (
            <View style={styles.roomSelectRow}>
              <Text style={[styles.roomLabel, { color: colors.secondary }]}>Pre-assign Room (optional):</Text>
              
              <TouchableOpacity
                style={[styles.dropdownHeader, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
                onPress={() => setShowRoomDropdown(!showRoomDropdown)}
                activeOpacity={0.7}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                  {selectedRoomId === "ALL" ? "All Rooms (User Selects)" : rooms.find((r) => r.id === selectedRoomId)?.roomNumber || "Select a Room"}
                </Text>
                <Ionicons name={showRoomDropdown ? "chevron-up" : "chevron-down"} size={18} color={colors.secondary} />
              </TouchableOpacity>

              {showRoomDropdown && (
                <View style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        setSelectedRoomId("ALL");
                        setShowRoomDropdown(false);
                      }}
                    >
                      <Text style={[styles.dropdownOptionText, { color: selectedRoomId === "ALL" ? colors.primary : colors.text }]}>
                        All Rooms (User Selects)
                      </Text>
                      {selectedRoomId === "ALL" && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                    </TouchableOpacity>
                    {rooms.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setSelectedRoomId(r.id);
                          setShowRoomDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownOptionText, { color: selectedRoomId === r.id ? colors.primary : colors.text }]}>
                          {r.roomNumber}
                        </Text>
                        {selectedRoomId === r.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={handleCopyLink}
              activeOpacity={0.7}
            >
              <Ionicons name="copy-outline" size={18} color={colors.text} />
              <Text style={[styles.btnText, { color: colors.text }]}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.btnText, { color: "#FFFFFF" }]}>Share Invite</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  qrWrapper: {
    alignItems: "center",
    marginVertical: 10,
  },
  qrBorder: {
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  instruction: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 14,
    paddingHorizontal: 8,
  },
  roomSelectRow: {
    marginTop: 12,
    marginBottom: 16,
  },
  roomLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.1)",
  },
  dropdownOptionText: {
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  primaryBtn: {
    flex: 1.2,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
