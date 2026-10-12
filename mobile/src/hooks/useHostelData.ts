import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, parseJsonResponse as jsonResponse } from "../services/api";
import {
  Dashboard,
  EMPTY_DASHBOARD,
  Fee,
  Hostel,
  Notification,
  Payment,
  Renter,
  Repair,
  Room,
  Tab,
} from "../types";
import { dashboardFrom, listFrom } from "../utils/formatters";

// ── SWR-style AsyncStorage cache helpers ────────────────────────────────────
const CACHE_KEY = "@hosteldesk_hostel_cache";
const hostelCacheKey = (hId: string) => `@hosteldesk_hostel_cache_${hId}`;

interface CachedData {
  hostels?: Hostel[];
  selectedHostelId?: string;
  rooms?: Room[];
  renters?: Renter[];
  fees?: Fee[];
  payments?: Payment[];
  repairs?: Repair[];
  dashboard?: Dashboard;
  ts?: number; // timestamp
}

async function readCache(specificHostelId?: string): Promise<CachedData | null> {
  try {
    const key = specificHostelId ? hostelCacheKey(specificHostelId) : CACHE_KEY;
    const raw = await AsyncStorage.getItem(key);
    if (!raw && specificHostelId) {
      const primaryRaw = await AsyncStorage.getItem(CACHE_KEY);
      return primaryRaw ? JSON.parse(primaryRaw) : null;
    }
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCache(data: CachedData, hostelId?: string): Promise<void> {
  try {
    const payload = JSON.stringify({ ...data, ts: Date.now() });
    await AsyncStorage.setItem(CACHE_KEY, payload);
    if (hostelId) {
      await AsyncStorage.setItem(hostelCacheKey(hostelId), payload);
    }
  } catch {
    // Silent fail – cache is best-effort
  }
}

async function clearCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Silent fail
  }
}

export interface HostelDataState {
  dashboard: Dashboard;
  hostels: Hostel[];
  selectedHostelId: string;
  rooms: Room[];
  renters: Renter[];
  fees: Fee[];
  payments: Payment[];
  repairs: Repair[];
  notifications: Notification[];
  dataLoading: boolean;
  selectedHostel: Hostel | undefined;
  activeRenters: Renter[];
  activeRooms: Room[];
}

export interface HostelDataActions {
  setHostels: (h: Hostel[]) => void;
  setSelectedHostelId: (id: string | ((prev: string) => string)) => void;
  setDashboard: (d: Dashboard) => void;
  setFees: (f: Fee[]) => void;
  setPayments: (p: Payment[]) => void;
  setRepairs: (r: Repair[]) => void;
  setNotifications: (n: Notification[]) => void;
  resetAllData: () => void;
  refreshAll: () => Promise<void>;
  refreshHostelData: (hostelId?: string, force?: boolean) => Promise<void>;
  refreshDashboardOnly: () => Promise<void>;
  refreshTab: (tab: Tab) => Promise<void>;
  refreshNotifications: () => Promise<void>;
  loadRenterData: (
    token: string,
    hostelId: string,
    userId: string,
    currentRenterSetter: (r: Renter | null) => void,
  ) => Promise<void>;
  /** Low-level authenticated request helper */
  request: <T = any>(path: string, options?: RequestInit) => Promise<T>;
  setToken: (t: string | null) => void;
}

export function useHostelData(authToken?: string | null): HostelDataState & HostelDataActions {
  const [internalToken, setToken] = useState<string | null>(null);
  const token = authToken || internalToken;
  const [dashboard, setDashboard] = useState<Dashboard>(EMPTY_DASHBOARD);
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [selectedHostelId, setSelectedHostelIdState] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [renters, setRenters] = useState<Renter[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const refreshBusy = useRef(false);
  const cacheHydrated = useRef(false);
  const lastFetchedHostel = useRef<Record<string, number>>({});
  const lastTabFetched = useRef<Record<string, number>>({});
  const HOSTEL_DATA_TTL_MS = 60 * 1000;
  const TAB_TTL_MS = 25 * 1000; // 25s throttle per tab to eliminate redundant network hits on tab switching

  // ── SWR: Hydrate from AsyncStorage cache on first mount ──────────────────
  useEffect(() => {
    if (cacheHydrated.current) return;
    cacheHydrated.current = true;
    (async () => {
      const cached = await readCache();
      if (!cached) return;
      if (cached.hostels?.length) setHostels(cached.hostels);
      if (cached.selectedHostelId) setSelectedHostelIdState(cached.selectedHostelId);
      if (cached.rooms?.length) setRooms(cached.rooms);
      if (cached.renters?.length) setRenters(cached.renters);
      if (cached.fees?.length) setFees(cached.fees);
      if (cached.payments?.length) setPayments(cached.payments);
      if (cached.repairs?.length) setRepairs(cached.repairs);
      if (cached.dashboard) setDashboard(cached.dashboard);
    })();
  }, []);

  const setSelectedHostelId = useCallback((idOrFn: string | ((prev: string) => string)) => {
    setSelectedHostelIdState((prev) => {
      const nextId = typeof idOrFn === "function" ? idOrFn(prev) : idOrFn;
      if (!nextId) return prev;
      if (prev && prev !== nextId) {
        // When switching between two different non-empty hostels, attempt instant hydration from target cache
        void (async () => {
          const cached = await readCache(nextId);
          if (cached && cached.selectedHostelId === nextId) {
            if (cached.rooms?.length) setRooms(cached.rooms);
            if (cached.renters?.length) setRenters(cached.renters);
            if (cached.fees?.length) setFees(cached.fees);
            if (cached.payments?.length) setPayments(cached.payments);
            if (cached.repairs?.length) setRepairs(cached.repairs);
            if (cached.dashboard) setDashboard(cached.dashboard);
          }
        })();
      }
      return nextId;
    });
  }, []);

  const selectedHostel = hostels.find((h) => h.id === selectedHostelId);
  const activeRenters = renters.filter(
    (r) =>
      String(r.status || "ACTIVE").toUpperCase() === "ACTIVE" &&
      (!r.hostelId || !selectedHostelId || r.hostelId === selectedHostelId),
  );
  const activeRooms = rooms.filter(
    (r) =>
      String(r.status || "ACTIVE").toUpperCase() === "ACTIVE" &&
      (!r.hostelId || !selectedHostelId || r.hostelId === selectedHostelId),
  );

  const request = useCallback(
    async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
      if (!token) throw new Error("You are not signed in.");
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await jsonResponse(response);
      if (!response.ok) {
        const message =
          data && typeof data === "object"
            ? (data as Record<string, unknown>).message
            : null;
        throw new Error(String(message || `Request failed: ${response.status}`));
      }
      return data as T;
    },
    [token],
  );

  const refreshDashboardOnly = useCallback(
    async (targetHostelId?: string) => {
      if (!token) return;
      const hId = targetHostelId || selectedHostelId;
      try {
        const url = hId ? `${API_URL}/dashboard/${hId}` : `${API_URL}/dashboard`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await jsonResponse(resp);
        if (resp.ok) setDashboard(dashboardFrom(data));
      } catch {
        // Keep existing dashboard on transient failure
      }
    },
    [token, selectedHostelId],
  );

  const refreshHostelData = useCallback(
    async (hostelId = selectedHostelId, force = false) => {
      if (!token || !hostelId || refreshBusy.current) return;
      const now = Date.now();
      const lastFetch = lastFetchedHostel.current[hostelId] || 0;
      if (!force && now - lastFetch < HOSTEL_DATA_TTL_MS && rooms.length > 0) {
        return; // Fast cache hit, avoid redundant network calls
      }
      refreshBusy.current = true;
      lastFetchedHostel.current[hostelId] = now;
      try {
        const headers = { Authorization: `Bearer ${token}` };

        // ── PERFORMANCE: Single aggregated snapshot query (5x network speedup) ──
        let usedSnapshot = false;
        try {
          const snapResp = await fetch(`${API_URL}/hostels/${hostelId}/snapshot`, { headers });
          if (snapResp.ok) {
            const snap = (await jsonResponse(snapResp)) as Record<string, any>;
            if (snap && Array.isArray(snap.rooms)) {
              usedSnapshot = true;
              const fetchedRooms = listFrom<Room>(snap.rooms, "rooms").filter((r) => !r.hostelId || r.hostelId === hostelId);
              const fetchedRenters = listFrom<Renter>(snap.renters, "renters").filter((r) => !r.hostelId || r.hostelId === hostelId);
              const fetchedFees = listFrom<Fee>(snap.fees, "fees").filter((f) => !f.hostelId || f.hostelId === hostelId);
              const fetchedPayments = listFrom<Payment>(snap.payments, "payments").filter((p) => !p.hostelId || p.hostelId === hostelId);
              const fetchedRepairs = listFrom<Repair>(snap.repairs, "repairs").filter((rp) => !rp.hostelId || rp.hostelId === hostelId);

              setRooms(fetchedRooms);
              setRenters(fetchedRenters);
              setFees(fetchedFees);
              setPayments(fetchedPayments);
              setRepairs(fetchedRepairs);

              if (snap.dashboard) {
                setDashboard(dashboardFrom(snap.dashboard));
              } else {
                await refreshDashboardOnly(hostelId);
              }

              const now = Date.now();
              lastTabFetched.current["dashboard"] = now;
              lastTabFetched.current["rooms"] = now;
              lastTabFetched.current["renters"] = now;
              lastTabFetched.current["payments"] = now;
              lastTabFetched.current["fees"] = now;
              lastTabFetched.current["repairs"] = now;

              writeCache(
                {
                  hostels,
                  selectedHostelId: hostelId,
                  rooms: fetchedRooms,
                  renters: fetchedRenters,
                  fees: fetchedFees,
                  payments: fetchedPayments,
                  repairs: fetchedRepairs,
                  ...(snap.dashboard ? { dashboard: dashboardFrom(snap.dashboard) } : {}),
                },
                hostelId,
              );
            }
          }
        } catch {
          // Gracefully fallback to individual queries
        }

        if (!usedSnapshot) {
          const results = await Promise.allSettled([
            fetch(`${API_URL}/hostels/${hostelId}/rooms`, { headers }).then(jsonResponse),
            fetch(`${API_URL}/hostels/${hostelId}/renters`, { headers }).then(jsonResponse),
            fetch(`${API_URL}/hostels/${hostelId}/fees`, { headers }).then(jsonResponse),
            fetch(`${API_URL}/hostels/${hostelId}/payments`, { headers }).then(jsonResponse),
            fetch(`${API_URL}/hostels/${hostelId}/repairs`, { headers }).then(jsonResponse),
            fetch(`${API_URL}/notifications/me?hostelId=${encodeURIComponent(hostelId)}`, { headers }).then(jsonResponse),
          ]);

          const roomData = results[0].status === "fulfilled" ? results[0].value : null;
          const renterData = results[1].status === "fulfilled" ? results[1].value : null;
          const feeData = results[2].status === "fulfilled" ? results[2].value : null;
          const paymentData = results[3].status === "fulfilled" ? results[3].value : null;
          const repairData = results[4].status === "fulfilled" ? results[4].value : null;
          const notifData = results[5].status === "fulfilled" ? results[5].value : null;

          let updatedRooms = rooms;
          let updatedRenters = renters;
          let updatedFees = fees;
          let updatedPayments = payments;
          let updatedRepairs = repairs;

          if (roomData) {
            const fetchedRooms = listFrom<Room>(roomData, "rooms").filter(
              (r) => !r.hostelId || r.hostelId === hostelId,
            );
            setRooms(fetchedRooms);
            updatedRooms = fetchedRooms;
          }

          if (renterData) {
            const fetchedRenters = listFrom<Renter>(renterData, "renters").filter(
              (r) => !r.hostelId || r.hostelId === hostelId,
            );
            setRenters(fetchedRenters);
            updatedRenters = fetchedRenters;
          }

          if (feeData) {
            const fetchedFees = listFrom<Fee>(feeData, "fees").filter(
              (f) => !f.hostelId || f.hostelId === hostelId,
            );
            setFees(fetchedFees);
            updatedFees = fetchedFees;
          }

          if (paymentData) {
            const fetchedPayments = listFrom<Payment>(paymentData, "payments").filter(
              (p) => !p.hostelId || p.hostelId === hostelId,
            );
            setPayments(fetchedPayments);
            updatedPayments = fetchedPayments;
          }

          if (repairData) {
            const fetchedRepairs = listFrom<Repair>(repairData, "repairs").filter(
              (rp) => !rp.hostelId || rp.hostelId === hostelId,
            );
            setRepairs(fetchedRepairs);
            updatedRepairs = fetchedRepairs;
          }

          if (notifData) {
            const fetchedNotifs = listFrom<Notification>(notifData, "notifications");
            setNotifications(fetchedNotifs);
          }

          await refreshDashboardOnly(hostelId);

          // ── SWR: Persist fresh data to AsyncStorage cache ─────────────────
          writeCache(
            {
              hostels,
              selectedHostelId: hostelId,
              rooms: updatedRooms,
              renters: updatedRenters,
              fees: updatedFees,
              payments: updatedPayments,
              repairs: updatedRepairs,
            },
            hostelId,
          );
        }
      } catch (err) {
        console.warn("Failed to refresh hostel data:", err);
      } finally {
        refreshBusy.current = false;
      }
    },
    [token, selectedHostelId, refreshDashboardOnly, hostels, rooms, renters, fees, payments, repairs],
  );

  const tabRefreshBusy = useRef<Record<string, boolean>>({});

  const refreshTab = useCallback(
    async (tabKey: Tab, force = false) => {
      if (!token || !selectedHostelId || tabRefreshBusy.current[tabKey]) return;
      const now = Date.now();
      if (!force && lastTabFetched.current[tabKey] && now - lastTabFetched.current[tabKey] < TAB_TTL_MS) {
        return;
      }
      tabRefreshBusy.current[tabKey] = true;
      const headers = { Authorization: `Bearer ${token}` };

      try {
        if (tabKey === "dashboard") {
          await refreshDashboardOnly(selectedHostelId);
          lastTabFetched.current[tabKey] = Date.now();
        } else if (tabKey === "rooms") {
          const res = await fetch(`${API_URL}/hostels/${selectedHostelId}/rooms`, { headers });
          if (res.ok) {
            const roomData = await jsonResponse(res);
            const fetchedRooms = listFrom<Room>(roomData, "rooms").filter(
              (r) => !r.hostelId || r.hostelId === selectedHostelId,
            );
            setRooms(fetchedRooms);
            lastTabFetched.current[tabKey] = Date.now();
          }
        } else if (tabKey === "renters") {
          const res = await fetch(`${API_URL}/hostels/${selectedHostelId}/renters`, { headers });
          if (res.ok) {
            const renterData = await jsonResponse(res);
            const fetchedRenters = listFrom<Renter>(renterData, "renters").filter(
              (r) => !r.hostelId || r.hostelId === selectedHostelId,
            );
            setRenters(fetchedRenters);
            lastTabFetched.current[tabKey] = Date.now();
          }
        } else if (tabKey === "payments" || tabKey === "fees") {
          const [feeRes, paymentRes] = await Promise.all([
            fetch(`${API_URL}/hostels/${selectedHostelId}/fees`, { headers }),
            fetch(`${API_URL}/hostels/${selectedHostelId}/payments`, { headers }),
          ]);
          if (feeRes.ok) {
            const feeData = await jsonResponse(feeRes);
            setFees(listFrom<Fee>(feeData, "fees").filter((f) => !f.hostelId || f.hostelId === selectedHostelId));
          }
          if (paymentRes.ok) {
            const payData = await jsonResponse(paymentRes);
            setPayments(listFrom<Payment>(payData, "payments").filter((p) => !p.hostelId || p.hostelId === selectedHostelId));
          }
          const nowTs = Date.now();
          lastTabFetched.current["payments"] = nowTs;
          lastTabFetched.current["fees"] = nowTs;
        } else if (tabKey === "hostels") {
          const res = await fetch(`${API_URL}/hostels`, { headers });
          if (res.ok) {
            const hostelsData = await jsonResponse(res);
            setHostels(listFrom<Hostel>(hostelsData, "hostels"));
            lastTabFetched.current[tabKey] = Date.now();
          }
        } else if (tabKey === "repairs") {
          const res = await fetch(`${API_URL}/hostels/${selectedHostelId}/repairs`, { headers });
          if (res.ok) {
            const repData = await jsonResponse(res);
            setRepairs(listFrom<Repair>(repData, "repairs").filter((rp) => !rp.hostelId || rp.hostelId === selectedHostelId));
            lastTabFetched.current[tabKey] = Date.now();
          }
        }
      } catch {
        // Silent background update — never block the UI
      } finally {
        tabRefreshBusy.current[tabKey] = false;
      }
    },
    [token, selectedHostelId, refreshDashboardOnly],
  );

  const refreshAll = useCallback(async () => {
    if (!token) return;
    lastTabFetched.current = {};
    setDataLoading(true);
    try {
      // Re-fetch hostels list so any newly added hostel appears immediately
      const hostelsData = await fetch(`${API_URL}/hostels`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(jsonResponse)
        .catch(() => null);
      let currentHostels = hostels;
      if (hostelsData) {
        const fetchedHostels = listFrom<Hostel>(hostelsData, "hostels");
        currentHostels = fetchedHostels;
        setHostels(fetchedHostels);
      }

      const activeHostelId = selectedHostelId || currentHostels?.[0]?.id;
      if (activeHostelId) {
        if (!selectedHostelId) {
          setSelectedHostelId(activeHostelId);
        }
        await refreshHostelData(activeHostelId, true);
      }
    } finally {
      setDataLoading(false);
    }
  }, [token, selectedHostelId, hostels, refreshHostelData, setSelectedHostelId]);

  const loadRenterData = useCallback(
    async (
      idToken: string,
      hostelId: string,
      userId: string,
      currentRenterSetter: (r: Renter | null) => void,
    ) => {
      setDataLoading(true);
      const headers = { Authorization: `Bearer ${idToken}` };
      try {
        const [rentersData, paymentsData, repairsData, notifData] = await Promise.all([
          fetch(`${API_URL}/hostels/${hostelId}/renters`, { headers })
            .then(jsonResponse)
            .catch(() => ({ renters: [] })),
          fetch(`${API_URL}/hostels/${hostelId}/payments`, { headers })
            .then(jsonResponse)
            .catch(() => ({ payments: [] })),
          fetch(`${API_URL}/hostels/${hostelId}/my-repairs`, { headers })
            .then(jsonResponse)
            .catch(() => ({ repairs: [] })),
          fetch(`${API_URL}/notifications/me`, { headers })
            .then(jsonResponse)
            .catch(() =>
              fetch(`${API_URL}/hostels/${hostelId}/notifications`, { headers })
                .then(jsonResponse)
                .catch(() => ({ notifications: [] })),
            ),
        ]);

        const rentersList = listFrom<Renter>(rentersData, "renters");
        const myRenter =
          rentersList.find((r) => r.userId === userId || r.user?.id === userId) || null;
        currentRenterSetter(myRenter);

        if (myRenter) {
          const feesData = await fetch(
            `${API_URL}/hostels/${hostelId}/renters/${myRenter.id}/fees`,
            { headers },
          )
            .then(jsonResponse)
            .catch(() => ({ fees: [] }));
          setFees(listFrom<Fee>(feesData, "fees"));
        }

        const allPayments = listFrom<Payment>(paymentsData, "payments");
        const myPayments = myRenter
          ? allPayments.filter((p) => p.renterId === myRenter.id)
          : allPayments;
        setPayments(myPayments);
        setRepairs(listFrom<Repair>(repairsData, "repairs"));
        setNotifications(listFrom<Notification>(notifData, "notifications"));
      } catch (err) {
        console.error("Failed to load renter data:", err);
      } finally {
        setDataLoading(false);
      }
    },
    [],
  );

  const refreshNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const url = selectedHostelId
        ? `${API_URL}/notifications/me?hostelId=${encodeURIComponent(selectedHostelId)}`
        : `${API_URL}/notifications/me`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const notifData = await jsonResponse(resp);
        const fetchedNotifs = listFrom<Notification>(notifData, "notifications");
        setNotifications(fetchedNotifs);
      }
    } catch {
      // Non-blocking silent poll
    }
  }, [token, selectedHostelId]);

  const resetAllData = useCallback(() => {
    setDashboard(EMPTY_DASHBOARD);
    setHostels([]);
    setSelectedHostelId("");
    setRooms([]);
    setRenters([]);
    setFees([]);
    setPayments([]);
    setRepairs([]);
    setNotifications([]);
    clearCache(); // Clear SWR cache on logout/reset
  }, []);

  return {
    dashboard,
    hostels,
    selectedHostelId,
    rooms,
    renters,
    fees,
    payments,
    repairs,
    notifications,
    dataLoading,
    selectedHostel,
    activeRenters,
    activeRooms,
    setHostels,
    setSelectedHostelId,
    setDashboard,
    setFees,
    setPayments,
    setRepairs,
    setNotifications,
    resetAllData,
    refreshAll,
    refreshHostelData,
    refreshDashboardOnly,
    refreshTab,
    refreshNotifications,
    loadRenterData,
    request,
    setToken,
  };
}
