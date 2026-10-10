import { useEffect, useState, useCallback, useRef } from "react";
import { Alert, AppState, AppStateStatus, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BIOMETRICS_PREF_KEY = "@hostella_biometrics_enabled";
const LEGACY_BIOMETRICS_PREF_KEY = "@hosteldesk_biometrics_enabled";

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
        const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
        const enrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync().catch(() => false) : false;
        const types = hasHardware ? await LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []) : [];
        
        let savedPref = await AsyncStorage.getItem(BIOMETRICS_PREF_KEY).catch(() => null);
        if (savedPref === null) {
          savedPref = await AsyncStorage.getItem(LEGACY_BIOMETRICS_PREF_KEY).catch(() => null);
        }

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

        // Lock if enabled, supported, and user is logged in
        if (enabled && hasSession && hasHardware && enrolled) {
          setIsLocked(true);
        } else {
          setIsLocked(false);
        }
      } catch (err) {
        console.warn("Biometrics detection error:", err);
        if (isMounted) {
          setIsHardwareAvailable(false);
          setIsEnrolled(false);
          setIsBiometricsEnabled(false);
          setIsLocked(false);
        }
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

      const hasHardware = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const isEnrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      if (!hasHardware || !isEnrolled) {
        setIsLocked(false);
        setIsBiometricsEnabled(false);
        await AsyncStorage.setItem(BIOMETRICS_PREF_KEY, "false").catch(() => {});
        return true;
      }

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
        const errorType = "error" in result ? (result as { error?: string }).error : null;
        if (errorType && errorType !== "user_cancel" && errorType !== "app_cancel") {
          setAuthError("Authentication failed. Tap below to retry or use device passcode.");
        }
        return false;
      }
    } catch (err: any) {
      console.warn("Biometric authentication error:", err);
      setAuthError(err?.message || "Biometric error. Tap to retry or unlock manually.");
      return false;
    }
  }, []);

  // 3. Prompt once automatically on app open if locked
  useEffect(() => {
    if (isBiometricsEnabled && hasSession && isLocked && !initialPromptDone.current) {
      initialPromptDone.current = true;
      const timer = setTimeout(() => {
        void promptUnlock();
      }, 400);
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

  // 5. Toggle biometrics setting
  const toggleBiometrics = useCallback(
    async (enable: boolean): Promise<boolean> => {
      try {
        if (enable) {
          if (!isHardwareAvailable || !isEnrolled) {
            Alert.alert(
              "Biometrics Unavailable",
              "Biometric authentication (Fingerprint or Face ID) is not set up on this device. Please enroll biometrics in your phone settings first."
            );
            return false;
          }

          const testAuth = await LocalAuthentication.authenticateAsync({
            promptMessage: `Verify your ${biometricTypeLabel} to enable biometric unlock`,
            cancelLabel: "Cancel",
            disableDeviceFallback: false,
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
      } catch (err: any) {
        console.warn("Toggle biometrics error:", err);
        Alert.alert("Biometrics Notice", err?.message || "Could not toggle biometric authentication.");
        return false;
      }
    },
    [isHardwareAvailable, isEnrolled, biometricTypeLabel]
  );

  const unlockManually = useCallback(() => {
    setIsLocked(false);
    setAuthError(null);
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
