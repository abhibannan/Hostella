import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { apiRequest, API_URL, parseJsonResponse } from "../services/api";
import { getDevicePushToken } from "./useExpoPushNotifications";
import * as ImageManipulator from "expo-image-manipulator";
import { Renter, User } from "../types";

// ── Push Token Registration ───────────────────────────────────────────────────

/**
 * Registers the Expo push token on login and every time the app returns to foreground.
 */
export function usePushTokenRegistration(token: string | null) {
  const register = useCallback(async (authToken: string) => {
    try {
      const deviceToken = await getDevicePushToken();
      if (!deviceToken) return;
      await apiRequest(
        "/notifications/push-token",
        { method: "POST", body: JSON.stringify({ token: deviceToken, platform: Platform.OS }) },
        authToken,
      );
    } catch (err) {
      console.warn("[Push] Token registration failed:", err);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void register(token);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && token) void register(token);
    });
    return () => sub.remove();
  }, [token, register]);
}

// ── Hostel Auto-Refresh ───────────────────────────────────────────────────────

type DataRefreshDeps = {
  refreshAll: () => Promise<void>;
  refreshHostelData: (hostelId: string) => Promise<void>;
  loadRenterData: (
    token: string,
    hostelId: string,
    userId: string,
    setSetter: (r: Renter | null) => void,
  ) => Promise<void>;
};

type CurrentUser = User | null;

/**
 * Auto-refreshes hostel data on token / hostel change and every 60 s while active.
 */
export function useHostelAutoRefresh(
  token: string | null,
  selectedHostelId: string,
  isHostelStaff: boolean,
  data: DataRefreshDeps,
  currentUser: CurrentUser,
  setCurrentRenterDoc: (r: Renter | null) => void,
) {
  useEffect(() => {
    if (!token || !selectedHostelId || !isHostelStaff) return;
    void data.refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedHostelId, currentUser?.role]);

  useEffect(() => {
    if (!token || !selectedHostelId || !isHostelStaff) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active") {
        void data.refreshHostelData(selectedHostelId);
      }
    }, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedHostelId, currentUser?.role]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && token && selectedHostelId) {
        if (currentUser?.role === "RENTER" && currentUser.id) {
          void data.loadRenterData(token, selectedHostelId, currentUser.id, setCurrentRenterDoc);
        } else if (isHostelStaff) {
          void data.refreshHostelData(selectedHostelId);
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedHostelId, currentUser]);
}

// ── Renter Proof Submission ───────────────────────────────────────────────────

type RenterProofParams = {
  feeId: string;
  amount: number;
  paymentDate: string;
  proofUri: string;
  proofBase64?: string | null;
  proofMimeType?: string | null;
  reference?: string;
  notes?: string;
};

type AuthSlice = {
  token: string | null;
  currentUser: User | null;
  currentRenterDoc: Renter | null;
  setCurrentRenterDoc: (r: Renter | null) => void;
};

type DataSlice = {
  selectedHostelId: string;
  request: <T>(path: string, opts?: RequestInit) => Promise<T>;
  loadRenterData: (
    token: string,
    hostelId: string,
    userId: string,
    setter: (r: Renter | null) => void,
  ) => Promise<void>;
};

/**
 * Handles renter payment-proof submission (image compress → upload → proof creation).
 */
export function useRenterProofSubmit(auth: AuthSlice, data: DataSlice) {
  const authRef = useRef(auth);
  authRef.current = auth;
  const dataRef = useRef(data);
  dataRef.current = data;

  return useCallback(async (params: RenterProofParams) => {
    const { token, currentUser, currentRenterDoc, setCurrentRenterDoc } = authRef.current;
    const { selectedHostelId, request, loadRenterData } = dataRef.current;

    if (!currentRenterDoc) throw new Error("Missing renter profile.");
    if (!token) throw new Error("You are not signed in.");
    const hostelId = selectedHostelId || currentRenterDoc.hostelId;
    if (!hostelId) throw new Error("Hostel ID is missing from your profile.");

    let base64 = params.proofBase64;
    if (!base64 && params.proofUri) {
      try {
        const result = await ImageManipulator.manipulateAsync(
          params.proofUri,
          [{ resize: { width: 1080 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        base64 = result.base64;
      } catch {
        console.warn("Could not compress image to base64.");
      }
    }
    if (!base64) throw new Error("Unable to read payment proof image data.");

    const uploadRes = await fetch(`${API_URL}/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        base64,
        originalName: `payment-proof-${Date.now()}.jpg`,
        contentType: params.proofMimeType || "image/jpeg",
      }),
    });

    const uploadData = (await parseJsonResponse(uploadRes)) as { file?: { id?: string }; message?: string };
    if (!uploadRes.ok || !uploadData.file?.id) {
      throw new Error(uploadData.message || "Unable to upload the payment proof.");
    }

    await request(`/hostels/${hostelId}/payment-proofs`, {
      method: "POST",
      body: JSON.stringify({
        renterId: currentRenterDoc.id,
        feeId: params.feeId,
        amount: params.amount,
        paymentDate: params.paymentDate,
        proofUploadId: uploadData.file.id,
        ...(params.reference ? { reference: params.reference } : {}),
        ...(params.notes ? { notes: params.notes } : {}),
      }),
    });

    if (currentUser) {
      await loadRenterData(token, hostelId, currentUser.id, setCurrentRenterDoc);
    }
  }, []);
}

// ── Renter Repair Submission ──────────────────────────────────────────────────

type RepairParams = {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
};

/**
 * Handles renter repair request submission.
 */
export function useRenterRepairSubmit(auth: AuthSlice, data: DataSlice) {
  const authRef = useRef(auth);
  authRef.current = auth;
  const dataRef = useRef(data);
  dataRef.current = data;

  return useCallback(async (params: RepairParams) => {
    const { token, currentUser, currentRenterDoc, setCurrentRenterDoc } = authRef.current;
    const { selectedHostelId, request, loadRenterData } = dataRef.current;

    const hostelId = selectedHostelId || currentRenterDoc?.hostelId;
    if (!hostelId) throw new Error("Hostel ID is missing from your profile.");

    await request(`/hostels/${hostelId}/repairs`, {
      method: "POST",
      body: JSON.stringify({
        ...params,
        roomId: currentRenterDoc?.roomId || (currentRenterDoc as any)?.room?.id,
      }),
    });

    if (currentUser && token) {
      await loadRenterData(token, hostelId, currentUser.id, setCurrentRenterDoc);
    }
  }, []);
}
