import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { Tab, User } from "../types";
import { BottomTab } from "./common";
import { OfflineBanner } from "./OfflineBanner";
import { GlobalAlertBanner, AlertBannerData } from "./GlobalAlertBanner";
import { DashboardScreen } from "../screens/DashboardScreen";
import { RoomsScreen } from "../screens/RoomsScreen";
import { RentersScreen } from "../screens/RentersScreen";
import { PaymentsScreen } from "../screens/PaymentsScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { HostelsScreen } from "../screens/HostelsScreen";
import { RepairsScreen } from "../screens/RepairsScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";

export const ADMIN_TABS: Tab[] = [
  "dashboard",
  "rooms",
  "renters",
  "payments",
  "more",
];

interface AdminAppShellProps {
  page: Tab;
  setPage: (next: Tab) => void;
  goBack: () => void;
  containerWidth: number;
  setContainerWidth: (w: number) => void;
  pageScrollRef: React.RefObject<ScrollView | null>;
  mountedTabs: Set<string>;
  subPageAnim: Animated.Value;
  onPageScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onPageScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  data: any;
  auth: {
    token: string | null;
    currentUser: User | null;
    logout: () => Promise<void>;
  };
  rooms: any;
  renters: any;
  fees: any;
  payments: any;
  repairsHook: any;
  notificationsHook: any;
  biometrics: any;
  paymentProofStats: any;
  recentPayments: any[];
  monthlyPaymentBars: any[];
  pendingProofsCount: number;
  renterSearch: string;
  setRenterSearch: (s: string) => void;
  paymentsInitialOption: "menu" | "fees_all" | "fees_paid" | "fees_unpaid" | "proofs" | "reminders" | "expenses";
  setPaymentsInitialOption: (opt: any) => void;
  platformStatus?: {
    alertBanner?: AlertBannerData;
  } | null;
  dismissedBanner: boolean;
  setDismissedBanner: (d: boolean) => void;
  onFlushOfflineQueue: () => void;
}

export function AdminAppShell({
  page,
  setPage,
  goBack,
  containerWidth,
  setContainerWidth,
  pageScrollRef,
  mountedTabs,
  subPageAnim,
  onPageScroll,
  onPageScrollEnd,
  data,
  auth,
  rooms,
  renters,
  fees,
  payments,
  repairsHook,
  notificationsHook,
  biometrics,
  paymentProofStats,
  recentPayments,
  monthlyPaymentBars,
  pendingProofsCount,
  renterSearch,
  setRenterSearch,
  paymentsInitialOption,
  setPaymentsInitialOption,
  platformStatus,
  dismissedBanner,
  setDismissedBanner,
  onFlushOfflineQueue,
}: AdminAppShellProps) {
  const { colors, toggleTheme, isDark, themeMode } = useTheme();

  const isDetailSubPage =
    page === "hostels" ||
    page === "repairs" ||
    page === "notifications";

  const isNavyHero = page !== "more";
  const headerBg = isNavyHero ? (isDark ? "#060B1E" : "#0A1333") : colors.background;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: headerBg }]}>
      <StatusBar
        barStyle={isNavyHero ? "light-content" : isDark ? "light-content" : "dark-content"}
        backgroundColor={headerBg}
      />
      <GlobalAlertBanner
        banner={platformStatus?.alertBanner}
        dismissed={dismissedBanner}
        onDismiss={() => setDismissedBanner(true)}
      />
      <OfflineBanner onSyncPress={onFlushOfflineQueue} />
      <View style={[styles.appContainer, { backgroundColor: colors.background }]}>
        <View
          style={[{ flex: 1 }, isDetailSubPage && { display: "none" }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - containerWidth) > 1) {
              setContainerWidth(w);
            }
          }}
        >
          <ScrollView
            ref={pageScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            overScrollMode="never"
            bounces={false}
            nestedScrollEnabled={true}
            removeClippedSubviews={false}
            scrollEventThrottle={16}
            onScroll={onPageScroll}
            onMomentumScrollEnd={onPageScrollEnd}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {ADMIN_TABS.map((tabKey) => {
              const isTabMounted = mountedTabs.has(tabKey) || tabKey === page;
              return (
                <View
                  key={tabKey}
                  style={{ width: containerWidth, flex: 1 }}
                  collapsable={false}
                >
                  {!isTabMounted ? (
                    <View style={{ flex: 1, backgroundColor: colors.background }} />
                  ) : (
                    <>
                      {tabKey === "dashboard" && (
                        <DashboardScreen
                          dashboard={data.dashboard}
                          selectedHostel={data.selectedHostel}
                          payments={data.payments}
                          fees={data.fees}
                          renters={data.renters}
                          paymentProofStats={paymentProofStats}
                          recentPayments={recentPayments}
                          monthlyPaymentBars={monthlyPaymentBars}
                          onRefresh={() => void data.refreshAll()}
                          onNavigate={(targetPage) => {
                            if (targetPage === "payments") {
                              setPaymentsInitialOption("menu");
                            }
                            setPage(targetPage);
                          }}
                          onNavigateToExpenses={() => {
                            setPaymentsInitialOption("expenses");
                            setPage("payments");
                          }}
                        />
                      )}

                      {tabKey === "rooms" && (
                        <RoomsScreen
                          rooms={data.rooms}
                          renters={data.renters}
                          selectedHostel={data.selectedHostel}
                          showRoomModal={rooms.showRoomModal}
                          setShowRoomModal={rooms.setShowRoomModal}
                          roomNumber={rooms.roomNumber}
                          setRoomNumber={rooms.setRoomNumber}
                          roomFloor={rooms.roomFloor}
                          setRoomFloor={rooms.setRoomFloor}
                          roomCapacity={rooms.roomCapacity}
                          setRoomCapacity={rooms.setRoomCapacity}
                          roomSaving={rooms.roomSaving}
                          onAddRoom={() => void rooms.addRoom()}
                          onDeleteRoom={(room) => rooms.deleteRoom(room)}
                          onRefresh={() => void data.refreshAll()}
                          request={data.request}
                          selectedHostelId={data.selectedHostelId}
                        />
                      )}

                      {tabKey === "renters" && (
                        <RentersScreen
                          renters={data.renters}
                          activeRenters={data.activeRenters}
                          rooms={data.rooms}
                          activeRooms={data.activeRooms}
                          selectedHostel={data.selectedHostel}
                          renterSearch={renterSearch}
                          setRenterSearch={setRenterSearch}
                          showRenterDetailsModal={renters.showRenterDetailsModal}
                          setShowRenterDetailsModal={renters.setShowRenterDetailsModal}
                          selectedRenter={renters.selectedRenter}
                          renterDetailsLoading={renters.renterDetailsLoading}
                          onOpenRenterDetails={(r) => void renters.openRenterDetails(r)}
                          onOpenEditRenter={(r) => renters.openEditRenter(r)}
                          onRemoveRenter={(r) => renters.removeRenter(r)}
                          showRenterModal={renters.showRenterModal}
                          setShowRenterModal={renters.setShowRenterModal}
                          onOpenRenterModal={renters.openRenterModal}
                          firstName={renters.firstName}
                          setFirstName={renters.setFirstName}
                          lastName={renters.lastName}
                          setLastName={renters.setLastName}
                          renterEmail={renters.renterEmail}
                          setRenterEmail={renters.setRenterEmail}
                          renterPhone={renters.renterPhone}
                          setRenterPhone={renters.setRenterPhone}
                          guardianName={renters.guardianName}
                          setGuardianName={renters.setGuardianName}
                          guardianPhone={renters.guardianPhone}
                          setGuardianPhone={renters.setGuardianPhone}
                          address={renters.address}
                          setAddress={renters.setAddress}
                          city={renters.city}
                          setCity={renters.setCity}
                          state={renters.state}
                          setState={renters.setState}
                          pincode={renters.pincode}
                          setPincode={renters.setPincode}
                          renterPassword={renters.renterPassword}
                          setRenterPassword={renters.setRenterPassword}
                          showRenterPassword={renters.showRenterPassword}
                          setShowRenterPassword={renters.setShowRenterPassword}
                          renterRoomId={renters.renterRoomId}
                          setRenterRoomId={renters.setRenterRoomId}
                          joiningDate={renters.joiningDate}
                          setJoiningDate={renters.setJoiningDate}
                          monthlyFee={renters.monthlyFee}
                          setMonthlyFee={renters.setMonthlyFee}
                          securityDeposit={renters.securityDeposit}
                          setSecurityDeposit={renters.setSecurityDeposit}
                          renterSaving={renters.renterSaving}
                          onAddRenter={() => void renters.addRenter()}
                          renterRoomPickerOpen={renters.renterRoomPickerOpen}
                          setRenterRoomPickerOpen={renters.setRenterRoomPickerOpen}
                          showEditRenterModal={renters.showEditRenterModal}
                          setShowEditRenterModal={renters.setShowEditRenterModal}
                          editingRenterId={renters.editingRenterId}
                          editFirstName={renters.editFirstName}
                          setEditFirstName={renters.setEditFirstName}
                          editLastName={renters.editLastName}
                          setEditLastName={renters.setEditLastName}
                          editPhone={renters.editPhone}
                          setEditPhone={renters.setEditPhone}
                          editGuardianName={renters.editGuardianName}
                          setEditGuardianName={renters.setEditGuardianName}
                          editGuardianPhone={renters.editGuardianPhone}
                          setEditGuardianPhone={renters.setEditGuardianPhone}
                          editAddress={renters.editAddress}
                          setEditAddress={renters.setEditAddress}
                          editCity={renters.editCity}
                          setEditCity={renters.setEditCity}
                          editState={renters.editState}
                          setEditState={renters.setEditState}
                          editPincode={renters.editPincode}
                          setEditPincode={renters.setEditPincode}
                          editRenterRoomId={renters.editRenterRoomId}
                          setEditRenterRoomId={renters.setEditRenterRoomId}
                          editJoiningDate={renters.editJoiningDate}
                          setEditJoiningDate={renters.setEditJoiningDate}
                          editMonthlyFee={renters.editMonthlyFee}
                          setEditMonthlyFee={renters.setEditMonthlyFee}
                          editSecurityDeposit={renters.editSecurityDeposit}
                          setEditSecurityDeposit={renters.setEditSecurityDeposit}
                          editRenterStatus={renters.editRenterStatus}
                          setEditRenterStatus={renters.setEditRenterStatus}
                          editRenterSaving={renters.editRenterSaving}
                          onUpdateRenter={() => void renters.updateRenter()}
                          editRenterRoomPickerOpen={renters.editRenterRoomPickerOpen}
                          setEditRenterRoomPickerOpen={renters.setEditRenterRoomPickerOpen}
                          onRefresh={() => void data.refreshAll()}
                        />
                      )}

                      {tabKey === "payments" && (
                        <PaymentsScreen
                          fees={data.fees}
                          payments={data.payments}
                          renters={data.renters}
                          activeRenters={data.activeRenters}
                          rooms={data.rooms}
                          selectedHostel={data.selectedHostel}
                          initialOption={paymentsInitialOption}
                          showFeeModal={fees.showFeeModal}
                          setShowFeeModal={fees.setShowFeeModal}
                          feeRenterId={fees.feeRenterId}
                          setFeeRenterId={fees.setFeeRenterId}
                          feeMonth={fees.feeMonth}
                          setFeeMonth={fees.setFeeMonth}
                          feeAmount={fees.feeAmount}
                          setFeeAmount={fees.setFeeAmount}
                          feeDueDate={fees.feeDueDate}
                          setFeeDueDate={fees.setFeeDueDate}
                          feeDescription={fees.feeDescription}
                          setFeeDescription={fees.setFeeDescription}
                          feeSaving={fees.feeSaving}
                          feeRenterPickerOpen={fees.feeRenterPickerOpen}
                          setFeeRenterPickerOpen={fees.setFeeRenterPickerOpen}
                          onOpenFeeModal={() => fees.openFeeModal()}
                          onAddFee={() => void fees.addFee()}
                          onDeleteFee={(feeId) => void fees.deleteFee(feeId)}
                          onRemindFee={(feeId, renterName, customMessage) =>
                            void notificationsHook.remindFee(feeId, renterName, customMessage)
                          }
                          onRemindAllUnpaid={() => void notificationsHook.remindAllUnpaid()}
                          showGenerateModal={fees.showGenerateModal}
                          setShowGenerateModal={fees.setShowGenerateModal}
                          generateMonth={fees.generateMonth}
                          setGenerateMonth={fees.setGenerateMonth}
                          generateDueDate={fees.generateDueDate}
                          setGenerateDueDate={fees.setGenerateDueDate}
                          generateSaving={fees.generateSaving}
                          onGenerateMonthlyFees={() => void fees.generateMonthlyFees()}
                          onMarkOverdue={() => void fees.markOverdueFees()}
                          paymentActionId={payments.paymentActionId}
                          onReviewPayment={(id, status, hostelId) =>
                            payments.reviewPayment(id, status, hostelId || data.selectedHostelId)
                          }
                          onDeletePayment={(id, hostelId) =>
                            void payments.deletePayment(id, hostelId || data.selectedHostelId)
                          }
                          onRefresh={() => void data.refreshAll()}
                          onBack={goBack}
                          token={auth.token}
                        />
                      )}

                      {tabKey === "more" && (
                        <MoreScreen
                          currentUser={auth.currentUser}
                          token={auth.token}
                          hostels={data.hostels}
                          onRefreshHostels={() => void data.refreshAll()}
                          onNavigateToFees={() => setPage("payments")}
                          onNavigateToPayments={() => setPage("payments")}
                          onNavigateToRepairs={() => setPage("repairs")}
                          onNavigateToDashboard={() => setPage("dashboard")}
                          onNavigateToHostels={() => setPage("hostels")}
                          onNavigateToNotifications={() => setPage("notifications")}
                          onRefresh={() => void data.refreshAll()}
                          onLogout={() => void auth.logout()}
                          themeMode={themeMode}
                          onToggleTheme={toggleTheme}
                          biometricLabel={biometrics.biometricTypeLabel}
                          isBiometricsEnabled={biometrics.isBiometricsEnabled}
                          isBiometricsSupported={biometrics.isHardwareAvailable && biometrics.isEnrolled}
                          onToggleBiometrics={biometrics.toggleBiometrics}
                        />
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {isDetailSubPage && (
          <Animated.View
            style={[
              { flex: 1 },
              {
                transform: [
                  {
                    translateX: subPageAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [containerWidth || 360, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {page === "hostels" && (
              <HostelsScreen
                hostels={data.hostels}
                selectedHostelId={data.selectedHostelId}
                currentUser={auth.currentUser}
                onSelectHostel={(id) => {
                  data.setSelectedHostelId(id);
                  void data.refreshHostelData(id, true);
                  setPage("dashboard");
                }}
                onRefresh={() => void data.refreshAll()}
                request={data.request}
                onBack={goBack}
              />
            )}

            {page === "repairs" && (
              <RepairsScreen
                repairs={data.repairs}
                renters={data.renters}
                rooms={data.rooms}
                selectedHostel={data.selectedHostel}
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
                showAddPersonModal={repairsHook.showAddPersonModal}
                setShowAddPersonModal={repairsHook.setShowAddPersonModal}
                personSaving={repairsHook.personSaving}
                onAddRepairPerson={repairsHook.addRepairPerson}
                onUpdateRepairPerson={repairsHook.updateRepairPerson}
                onRemoveRepairPerson={repairsHook.removeRepairPerson}
                onLoadRepairPersons={repairsHook.loadRepairPersons}
                maintenanceTasks={repairsHook.maintenanceTasks}
                onAddMaintenanceTask={repairsHook.addMaintenanceTask}
                onUpdateMaintenanceTaskStatus={repairsHook.updateMaintenanceTaskStatus}
                onDeleteMaintenanceTask={repairsHook.deleteMaintenanceTask}
                onLoadMaintenanceTasks={repairsHook.loadMaintenanceTasks}
                maintenanceSaving={repairsHook.maintenanceSaving}
                onAddRepair={() => repairsHook.addRepair()}
                onDeleteRepair={(id, title) => void repairsHook.deleteRepair(id, title)}
                onRefresh={() => void data.refreshAll()}
                onBack={goBack}
                isRepairPerson={false}
              />
            )}

            {page === "notifications" && (
              <NotificationsScreen
                notifications={data.notifications}
                selectedHostel={data.selectedHostel}
                hostels={data.hostels}
                onSendBroadcast={(title, message, type, scope) =>
                  notificationsHook.sendBroadcast(title, message, type, scope)
                }
                onDeleteNotification={(id) => void notificationsHook.deleteNotification(id)}
                onClearAll={() => void notificationsHook.clearAllNotifications()}
                onRefresh={() => void data.refreshAll()}
                onBack={goBack}
              />
            )}
          </Animated.View>
        )}

        {/* Bottom navigation */}
        <View style={[styles.bottomNavWrap, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.bottomNav,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                shadowColor: isDark ? "#000000" : "#1E1B4B",
                shadowOpacity: isDark ? 0.45 : 0.12,
              },
            ]}
          >
            <BottomTab
              icon="home-outline"
              activeIcon="home"
              label="Home"
              active={page === "dashboard"}
              onPress={() => setPage("dashboard")}
            />
            <BottomTab
              icon="bed-outline"
              activeIcon="bed"
              label="Rooms"
              active={page === "rooms"}
              onPress={() => setPage("rooms")}
            />
            <BottomTab
              icon="people-outline"
              activeIcon="people"
              label="Renters"
              active={page === "renters"}
              onPress={() => setPage("renters")}
            />
            <BottomTab
              icon="wallet-outline"
              activeIcon="wallet"
              label="Payments"
              badge={pendingProofsCount > 0 ? pendingProofsCount : undefined}
              active={page === "payments" || page === "fees"}
              onPress={() => {
                setPaymentsInitialOption("menu");
                setPage("payments");
              }}
            />
            <BottomTab
              icon="apps-outline"
              activeIcon="apps"
              label="More"
              active={
                page === "more" ||
                page === "hostels" ||
                page === "repairs"
              }
              onPress={() => setPage("more")}
            />
          </View>
        </View>
      </View>

      {data.dataLoading ? (
        <View style={[styles.refreshOverlay, { backgroundColor: colors.card }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.refreshOverlayText, { color: colors.secondary }]}>Refreshing…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appContainer: { flex: 1 },
  bottomNavWrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 2 : 10,
  },
  bottomNav: {
    minHeight: 68,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth * 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  refreshOverlay: {
    position: "absolute",
    right: 16,
    bottom: 98,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  refreshOverlayText: { fontSize: 11 },
});
