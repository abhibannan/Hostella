import { useEffect, useState, useCallback, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BIOMETRICS_PREF_KEY = "@hosteldesk_biometrics_enabled";

export let shouldSuspendBiometrics = false;
export const setSuspendBiometrics = (val: boolean) => {
  shouldSuspendBiometrics = val;
};

export interface BiometricsState {
  isHardwareAvailable: boolean;
  isEnrolled: boolean;
  biometricTypeLabel: string;
  isBiometricsEnabled: boolean;
  isLocked: boolean;
  authError: string | null;
  promptUnlock: () => Promise<boolean>;
  toggleBiometrics: (enable: boolean) => Promise<boolean>;
  unlockManually: () => void;
}

export function useBiometrics(hasSession: boolean): BiometricsState {
  const [isHardwareAvailable, setIsHardwareAvailable] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [biometricTypeLabel, setBiometricTypeLabel] = useState("Biometrics");
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const initialPromptDone = useRef(false);
  const appState = useRef(AppState.currentState);

  // 1. Detect hardware capabilities and saved user preference
  useEffect(() => {
    let isMounted = true;

    async function checkSupport() {
      try {
        const [hasHardware, enrolled, types, savedPref] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          AsyncStorage.getItem(BIOMETRICS_PREF_KEY),
        ]);

        if (!isMounted) return;

        setIsHardwareAvailable(hasHardware);
        setIsEnrolled(enrolled);

        let typeLabel = "Biometric / Face Recognition";
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          typeLabel = Platform.OS === "ios" ? "Face ID" : "Biometric / Face Recognition";
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          typeLabel = Platform.OS === "ios" ? "Touch ID" : "Biometric / Fingerprint";
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          typeLabel = "Iris Scan";
        }
        setBiometricTypeLabel(typeLabel);

        const enabled = savedPref === "true" && hasHardware && enrolled;
        setIsBiometricsEnabled(enabled);

        // Lock if enabled and user is logged in
        if (enabled && hasSession) {
          setIsLocked(true);
        }
      } catch (err) {
        console.warn("Biometrics detection error:", err);
      }
    }

    void checkSupport();

    return () => {
      isMounted = false;
    };
  }, [hasSession]);

  // 2. Perform biometric authentication prompt
  const promptUnlock = useCallback(async (): Promise<boolean> => {
    try {
      setAuthError(null);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Hostella",
        cancelLabel: "Cancel",
        fallbackLabel: "Use Device Passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
        setAuthError(null);
        return true;
      } else {
        if (result.error && result.error !== "user_cancel" && result.error !== "app_cancel") {
          setAuthError("Authentication failed. Please try again.");
        }
        return false;
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication error");
      return false;
    }
  }, []);

  // 3. Prompt once automatically on app open if locked
  useEffect(() => {
    if (isBiometricsEnabled && hasSession && isLocked && !initialPromptDone.current) {
      initialPromptDone.current = true;
      const timer = setTimeout(() => {
        void promptUnlock();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isBiometricsEnabled, hasSession, isLocked, promptUnlock]);

  // 4. Listen for AppState changes: lock when returning from background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active" &&
        isBiometricsEnabled &&
        hasSession
      ) {
        if (shouldSuspendBiometrics) {
          shouldSuspendBiometrics = false; // Reset flag
        } else {
          setIsLocked(true);
          void promptUnlock();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isBiometricsEnabled, hasSession, promptUnlock]);

  // 5. Toggle biometrics setting (requires immediate authentication verification before turning on)
  const toggleBiometrics = useCallback(
    async (enable: boolean): Promise<boolean> => {
      if (!isHardwareAvailable || !isEnrolled) {
        throw new Error("Biometric authentication is not supported or enrolled on this device.");
      }

      if (enable) {
        // Verify biometric once before saving preference
        const testAuth = await LocalAuthentication.authenticateAsync({
          promptMessage: `Verify your ${biometricTypeLabel} to enable biometric unlock`,
          cancelLabel: "Cancel",
          fallbackLabel: "Cancel",
        });

        if (!testAuth.success) {
          return false;
        }

        await AsyncStorage.setItem(BIOMETRICS_PREF_KEY, "true");
        setIsBiometricsEnabled(true);
        setIsLocked(false);
        return true;
      } else {
        await AsyncStorage.setItem(BIOMETRICS_PREF_KEY, "false");
        setIsBiometricsEnabled(false);
        setIsLocked(false);
        return true;
      }
    },
    [isHardwareAvailable, isEnrolled, biometricTypeLabel]
  );

  const unlockManually = useCallback(() => {
    setIsLocked(false);
  }, []);

  return {
    isHardwareAvailable,
    isEnrolled,
    biometricTypeLabel,
    isBiometricsEnabled,
    isLocked,
    authError,
    promptUnlock,
    toggleBiometrics,
    unlockManually,
  };
}
