import React from "react";
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";
import { Hostel, Renter, Repair, Room, User } from "../types";
import { RepairsScreen } from "../screens/RepairsScreen";

interface TechnicianPortalScreenProps {
  currentUser: User;
  data: {
    repairs: Repair[];
    renters: Renter[];
    rooms: Room[];
    selectedHostel?: Hostel;
    hostels: Hostel[];
    refreshAll: () => Promise<void>;
  };
  repairsHook: any;
  onLogout: () => void;
}

export function TechnicianPortalScreen({
  currentUser,
  data,
  repairsHook,
  onLogout,
}: TechnicianPortalScreenProps) {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 18,
            paddingVertical: 14,
            backgroundColor: colors.card,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>
              Repairs & Maintenance Portal
            </Text>
            <Text style={{ fontSize: 12, color: colors.secondary, marginTop: 2 }}>
              {currentUser.firstName || currentUser.email} • Technician
            </Text>
          </View>
          <TouchableOpacity
            onPress={onLogout}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 12,
              paddingVertical: 7,
              backgroundColor: COLORS.dangerLight,
              borderRadius: 9,
            }}
          >
            <Ionicons name="log-out-outline" size={16} color={COLORS.danger} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.danger }}>Logout</Text>
          </TouchableOpacity>
        </View>
        <RepairsScreen
          repairs={data.repairs}
          renters={data.renters}
          rooms={data.rooms}
          selectedHostel={data.selectedHostel || data.hostels[0]}
          showStatusModal={repairsHook.showStatusModal}
          setShowStatusModal={repairsHook.setShowStatusModal}
          showCreateModal={repairsHook.showCreateModal}
          setShowCreateModal={repairsHook.setShowCreateModal}
          selectedRepair={repairsHook.selectedRepair}
          repairStatus={repairsHook.repairStatus}
          setRepairStatus={repairsHook.setRepairStatus}
          adminNotes={repairsHook.adminNotes}
          setAdminNotes={repairsHook.setAdminNotes}
          repairSaving={repairsHook.repairSaving}
          onOpenStatusModal={(r) => repairsHook.openStatusModal(r)}
          onUpdateStatus={(id, status, notes) =>
            repairsHook.updateRepairStatus(id, status, notes)
          }
          newTitle={repairsHook.newTitle}
          setNewTitle={repairsHook.setNewTitle}
          newDescription={repairsHook.newDescription}
          setNewDescription={repairsHook.setNewDescription}
          newPriority={repairsHook.newPriority}
          setNewPriority={repairsHook.setNewPriority}
          newRenterId={repairsHook.newRenterId}
          setNewRenterId={repairsHook.setNewRenterId}
          newRoomId={repairsHook.newRoomId}
          setNewRoomId={repairsHook.setNewRoomId}
          repairPersons={repairsHook.repairPersons}
          showAddPersonModal={false}
          personSaving={false}
          maintenanceTasks={repairsHook.maintenanceTasks}
          onAddMaintenanceTask={repairsHook.addMaintenanceTask}
          onUpdateMaintenanceTaskStatus={repairsHook.updateMaintenanceTaskStatus}
          onDeleteMaintenanceTask={repairsHook.deleteMaintenanceTask}
          onLoadMaintenanceTasks={repairsHook.loadMaintenanceTasks}
          maintenanceSaving={repairsHook.maintenanceSaving}
          onAddRepair={() => repairsHook.addRepair()}
          onRefresh={() => void data.refreshAll()}
          isRepairPerson={true}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
