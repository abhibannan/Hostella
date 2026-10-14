import { useState } from "react";
import { Alert } from "react-native";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase";
import { Renter } from "../types";
import { getName, today } from "../utils/formatters";

export interface RenterActionsCallbacks {
  selectedHostelId: string;
  request: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

export function useRenterActions(cb: RenterActionsCallbacks) {
  // Add renter form state
  const [showRenterModal, setShowRenterModal] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [renterEmail, setRenterEmail] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [renterPassword, setRenterPassword] = useState("");
  const [showRenterPassword, setShowRenterPassword] = useState(false);
  const [renterRoomId, setRenterRoomId] = useState("");
  const [joiningDate, setJoiningDate] = useState(today());
  const [monthlyFee, setMonthlyFee] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [renterSaving, setRenterSaving] = useState(false);
  const [renterRoomPickerOpen, setRenterRoomPickerOpen] = useState(false);

  // Edit renter form state
  const [showEditRenterModal, setShowEditRenterModal] = useState(false);
  const [editRenterRoomPickerOpen, setEditRenterRoomPickerOpen] = useState(false);
  const [editingRenterId, setEditingRenterId] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editGuardianPhone, setEditGuardianPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [editRenterRoomId, setEditRenterRoomId] = useState("");
  const [editJoiningDate, setEditJoiningDate] = useState(today());
  const [editMonthlyFee, setEditMonthlyFee] = useState("");
  const [editSecurityDeposit, setEditSecurityDeposit] = useState("");
  const [editRenterStatus, setEditRenterStatus] = useState("ACTIVE");
  const [editRenterSaving, setEditRenterSaving] = useState(false);

  // Details modal state
  const [showRenterDetailsModal, setShowRenterDetailsModal] = useState(false);
  const [selectedRenter, setSelectedRenter] = useState<Renter | null>(null);
  const [renterDetailsLoading, setRenterDetailsLoading] = useState(false);

  function resetRenterForm() {
    setFirstName("");
    setLastName("");
    setRenterEmail("");
    setRenterPhone("");
    setGuardianName("");
    setGuardianPhone("");
    setAddress("");
    setCity("");
    setState("");
    setPincode("");
    setRenterPassword("");
    setShowRenterPassword(false);
    setRenterRoomId("");
    setJoiningDate(today());
    setMonthlyFee("");
    setSecurityDeposit("");
  }

  function openRenterModal() {
    resetRenterForm();
    setShowRenterModal(true);
  }

  async function addRenter() {
    const first = firstName.trim();
    const last = lastName.trim();
    const emailValue = renterEmail.trim().toLowerCase();
    const phoneValue = renterPhone.trim();
    const guardianPhoneValue = guardianPhone.trim();
    const guardianNameValue = guardianName.trim();
    const addressValue = address.trim();
    const cityValue = city.trim();
    const stateValue = state.trim();
    const pincodeValue = pincode.trim();
    const passwordValue = renterPassword;
    const joiningValue = joiningDate.trim() || today();

    if (first.length < 2 || first.length > 100) {
      return Alert.alert("Invalid first name", "First name must contain 2 to 100 characters.");
    }
    if (last.length > 100) {
      return Alert.alert("Invalid last name", "Last name must contain at most 100 characters.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue) || emailValue.length > 255) {
      return Alert.alert("Invalid email", "Enter a valid email address.");
    }
    if (auth.currentUser?.email && emailValue.toLowerCase() === auth.currentUser.email.toLowerCase()) {
      return Alert.alert(
        "Administrator Account",
        "You are currently logged in with this Administrator email. Administrators cannot be added as renters.",
      );
    }
    // Phone and guardian phone are optional on first entry
    if (phoneValue && (phoneValue.length < 7 || phoneValue.length > 30)) {
      return Alert.alert("Invalid phone", "Phone number must contain 7 to 30 characters.");
    }
    if (guardianPhoneValue && (guardianPhoneValue.length < 7 || guardianPhoneValue.length > 30)) {
      return Alert.alert("Invalid guardian phone", "Guardian phone must contain 7 to 30 characters.");
    }
    if (passwordValue && (passwordValue.length < 6 || passwordValue.length > 100)) {
      return Alert.alert("Invalid password", "Password must contain at least 6 characters.");
    }
    if (!renterRoomId) return Alert.alert("Room required", "Select a room for the renter.");
    if (!joiningValue) return Alert.alert("Joining date required", "Enter the joining date.");
    if (!monthlyFee.trim()) return Alert.alert("Monthly fee required", "Enter the monthly fee.");

    const monthly = Number(monthlyFee);
    const deposit = Number(securityDeposit || 0);
    if (!Number.isFinite(monthly) || monthly < 0) {
      return Alert.alert("Invalid monthly fee", "Enter a valid amount.");
    }
    if (!Number.isFinite(deposit) || deposit < 0) {
      return Alert.alert("Invalid security deposit", "Enter a valid amount.");
    }

    setRenterSaving(true);
    try {
      await cb.request(`/hostels/${cb.selectedHostelId}/renters/create-account`, {
        method: "POST",
        body: JSON.stringify({
          firstName: first,
          ...(last ? { lastName: last } : {}),
          email: emailValue,
          ...(phoneValue ? { phone: phoneValue } : {}),
          ...(guardianNameValue ? { guardianName: guardianNameValue } : {}),
          ...(guardianPhoneValue ? { guardianPhone: guardianPhoneValue } : {}),
          ...(addressValue ? { address: addressValue } : {}),
          ...(cityValue ? { city: cityValue } : {}),
          ...(stateValue ? { state: stateValue } : {}),
          ...(pincodeValue ? { pincode: pincodeValue } : {}),
          ...(passwordValue ? { password: passwordValue } : {}),
          roomId: renterRoomId,
          joiningDate: joiningValue,
          monthlyFee: monthly,
          securityDeposit: deposit,
        }),
      });

      let setupEmailSent = true;
      try {
        // Firebase sends a time-limited setup link. The renter chooses the
        // password themselves, so no password is ever sent over email.
        await sendPasswordResetEmail(auth, emailValue);
      } catch (error) {
        console.warn("Unable to send renter password setup email:", error);
        setupEmailSent = false;
      }
      setShowRenterModal(false);
      resetRenterForm();
      await cb.onRefresh();
      Alert.alert(
        "Renter added",
        setupEmailSent
          ? "The account was created and a secure password setup link was sent to the renter's email."
          : "The account was created, but the password setup email could not be sent. Use the renter login screen to request a new setup link.",
      );
    } catch (err) {
      Alert.alert(
        "Unable to add renter",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setRenterSaving(false);
    }
  }

  async function openRenterDetails(renter: Renter) {
    setSelectedRenter(renter);
    setShowRenterDetailsModal(true);
    setRenterDetailsLoading(true);
    try {
      const data = await cb.request(
        `/hostels/${cb.selectedHostelId}/renters/${renter.id}`,
      );
      if (data && typeof data === "object" && "renter" in data) {
        setSelectedRenter((data as { renter: Renter }).renter);
      }
    } catch (err) {
      Alert.alert(
        "Unable to load renter details",
        err instanceof Error ? err.message : "Showing the available renter details.",
      );
    } finally {
      setRenterDetailsLoading(false);
    }
  }

  function openEditRenter(renter: Renter) {
    setShowRenterDetailsModal(false);
    setEditingRenterId(renter.id);
    const fullNameStr = (renter.name || renter.fullName || "").trim();
    const nameParts = fullNameStr.split(/\s+/);
    const inferredFirst = nameParts[0] || "";
    const inferredLast = nameParts.slice(1).join(" ") || "";
    setEditFirstName(renter.user?.firstName || (renter as any).firstName || inferredFirst);
    setEditLastName(renter.user?.lastName || (renter as any).lastName || inferredLast);
    setEditPhone(renter.user?.phone || renter.phone || "");
    setEditGuardianName(renter.guardianName || "");
    setEditGuardianPhone(renter.guardianPhone || "");
    setEditAddress(renter.user?.address || "");
    setEditCity(renter.user?.city || "");
    setEditState(renter.user?.state || "");
    setEditPincode(renter.user?.pincode || "");
    setEditRenterRoomId(renter.roomId || renter.room?.id || "");
    setEditJoiningDate(renter.joiningDate || today());
    setEditMonthlyFee(renter.monthlyFee !== undefined ? String(renter.monthlyFee) : "");
    setEditSecurityDeposit(
      renter.securityDeposit !== undefined ? String(renter.securityDeposit) : "",
    );
    setEditRenterStatus(String(renter.status || "ACTIVE").toUpperCase());
    setShowEditRenterModal(true);
  }

  async function updateRenter() {
    if (!editingRenterId) return;
    if (!editRenterRoomId) return Alert.alert("Room required", "Select a room.");
    if (!editJoiningDate.trim())
      return Alert.alert("Joining date required", "Enter the joining date.");

    const monthly = Number(editMonthlyFee);
    const deposit = Number(editSecurityDeposit || 0);

    if (!Number.isFinite(monthly) || monthly < 0) {
      return Alert.alert("Invalid monthly fee", "Enter a valid amount.");
    }
    if (!Number.isFinite(deposit) || deposit < 0) {
      return Alert.alert("Invalid security deposit", "Enter a valid amount.");
    }

    setEditRenterSaving(true);
    try {
      await cb.request(
        `/hostels/${cb.selectedHostelId}/renters/${editingRenterId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            roomId: editRenterRoomId,
            firstName: editFirstName.trim(),
            lastName: editLastName.trim(),
            phone: editPhone.trim(),
            guardianName: editGuardianName.trim(),
            guardianPhone: editGuardianPhone.trim(),
            address: editAddress.trim(),
            city: editCity.trim(),
            state: editState.trim(),
            pincode: editPincode.trim(),
            joiningDate: editJoiningDate.trim(),
            monthlyFee: monthly,
            securityDeposit: deposit,
            status: editRenterStatus,
          }),
        },
      );
      setShowEditRenterModal(false);
      await cb.onRefresh();
      Alert.alert("Renter updated", "The renter details were updated successfully.");
    } catch (err) {
      Alert.alert(
        "Unable to update renter",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setEditRenterSaving(false);
    }
  }

  function removeRenter(renter: Renter) {
    Alert.alert(
      "Delete renter permanently",
      `${getName(renter)} and all related data will be permanently deleted. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Permanently",
          style: "destructive",
          onPress: async () => {
            try {
              await cb.request(
                `/hostels/${cb.selectedHostelId}/renters/${renter.id}`,
                { method: "DELETE" },
              );
              setShowRenterDetailsModal(false);
              setSelectedRenter(null);
              await cb.onRefresh();
              Alert.alert(
                "Renter deleted",
                "The renter and all related data were permanently deleted.",
              );
            } catch (err) {
              Alert.alert(
                "Unable to delete renter",
                err instanceof Error ? err.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  return {
    // Add form
    showRenterModal,
    setShowRenterModal,
    firstName, setFirstName,
    lastName, setLastName,
    renterEmail, setRenterEmail,
    renterPhone, setRenterPhone,
    guardianName, setGuardianName,
    guardianPhone, setGuardianPhone,
    address, setAddress,
    city, setCity,
    state, setState,
    pincode, setPincode,
    renterPassword, setRenterPassword,
    showRenterPassword, setShowRenterPassword,
    renterRoomId, setRenterRoomId,
    joiningDate, setJoiningDate,
    monthlyFee, setMonthlyFee,
    securityDeposit, setSecurityDeposit,
    renterSaving,
    renterRoomPickerOpen, setRenterRoomPickerOpen,
    // Edit form
    showEditRenterModal, setShowEditRenterModal,
    editRenterRoomPickerOpen, setEditRenterRoomPickerOpen,
    editingRenterId,
    editFirstName, setEditFirstName,
    editLastName, setEditLastName,
    editPhone, setEditPhone,
    editGuardianName, setEditGuardianName,
    editGuardianPhone, setEditGuardianPhone,
    editAddress, setEditAddress,
    editCity, setEditCity,
    editState, setEditState,
    editPincode, setEditPincode,
    editRenterRoomId, setEditRenterRoomId,
    editJoiningDate, setEditJoiningDate,
    editMonthlyFee, setEditMonthlyFee,
    editSecurityDeposit, setEditSecurityDeposit,
    editRenterStatus, setEditRenterStatus,
    editRenterSaving,
    // Details modal
    showRenterDetailsModal, setShowRenterDetailsModal,
    selectedRenter,
    renterDetailsLoading,
    // Actions
    openRenterModal,
    addRenter,
    openRenterDetails,
    openEditRenter,
    updateRenter,
    removeRenter,
  };
}
