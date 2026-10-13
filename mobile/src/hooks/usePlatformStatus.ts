import { useCallback, useEffect, useState, useRef } from "react";
import { AppState } from "react-native";
import { API_URL, parseJsonResponse } from "../services/api";
import { AlertBannerData } from "../components/GlobalAlertBanner";

export interface PlatformStatus {
  maintenanceMode: boolean;
  maintenanceNotice: string;
  alertBanner?: AlertBannerData;
}

export function usePlatformStatus() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/platform/status`);
      if (res.ok && mountedRef.current) {
        const data = (await parseJsonResponse(res)) as PlatformStatus;
        setStatus(data);
      }
    } catch {
      // Non-blocking — silently ignore network failures
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    await fetchStatus();
    if (mountedRef.current) setChecking(false);
  }, [fetchStatus]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchStatus();

    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void fetchStatus();
      }
    }, 120_000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchStatus]);

  return { status, checking, refreshStatus };
}
