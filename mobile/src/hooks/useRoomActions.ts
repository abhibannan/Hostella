import { useState } from "react";
import { Alert } from "react-native";
import { Room } from "../types";

export interface RoomActionsState {
  showRoomModal: boolean;
  setShowRoomModal: (v: boolean) => void;
  roomNumber: string;
  setRoomNumber: (v: string) => void;
  roomFloor: string;
  setRoomFloor: (v: string) => void;
  roomCapacity: string;
  setRoomCapacity: (v: string) => void;
  roomSaving: boolean;
}

export interface RoomActionsCallbacks {
  selectedHostelId: string;
  renters: any[];
  request: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
}

export function useRoomActions(cb: RoomActionsCallbacks) {
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomFloor, setRoomFloor] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("2");
  const [roomSaving, setRoomSaving] = useState(false);

  async function addRoom() {
    if (!roomNumber.trim()) {
      Alert.alert("Room number required", "Enter a room number.");
      return;
    }
    setRoomSaving(true);
    try {
      const parsedCapacity = Math.max(1, parseInt(roomCapacity, 10) || 2);
      await cb.request(`/hostels/${cb.selectedHostelId}/rooms`, {
        method: "POST",
        body: JSON.stringify({
          roomNumber: roomNumber.trim(),
          floor: roomFloor.trim() || undefined,
          maxOccupants: parsedCapacity,
          status: "ACTIVE",
        }),
      });
      setRoomNumber("");
      setRoomFloor("");
      setRoomCapacity("2");
      setShowRoomModal(false);
      await cb.onRefresh();
      Alert.alert("Room added", `Room was added successfully with ${parsedCapacity} occupant capacity.`);
    } catch (err) {
      Alert.alert(
        "Unable to add room",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setRoomSaving(false);
    }
  }

  function deleteRoom(room: Room) {
    const activeRentersInRoom = cb.renters.filter(
      (renter) =>
        String(renter.status || "ACTIVE").toUpperCase() === "ACTIVE" &&
        renter.roomId === room.id,
    );

    if (activeRentersInRoom.length > 0) {
      Alert.alert(
        "Room cannot be deleted",
        `Room ${room.roomNumber} has ${activeRentersInRoom.length} active occupant${activeRentersInRoom.length > 1 ? "s" : ""}. Please move or check out all occupants before deleting this room.`,
      );
      return;
    }

    Alert.alert("Delete room", `Delete room ${room.roomNumber}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await cb.request(
              `/hostels/${cb.selectedHostelId}/rooms/${room.id}`,
              { method: "DELETE" },
            );
            await cb.onRefresh();
          } catch (err) {
            Alert.alert(
              "Unable to delete room",
              err instanceof Error ? err.message : "Please try again.",
            );
          }
        },
      },
    ]);
  }

  return {
    showRoomModal,
    setShowRoomModal,
    roomNumber,
    setRoomNumber,
    roomFloor,
    setRoomFloor,
    roomCapacity,
    setRoomCapacity,
    roomSaving,
    addRoom,
    deleteRoom,
  };
}
