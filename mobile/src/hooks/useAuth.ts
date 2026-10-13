import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import * as WebBrowser from "expo-web-browser";
import { auth } from "../../firebase";
import {
  API_URL,
  parseJsonResponse as jsonResponse,
  warmupApi,
} from "../services/api";
import { Hostel, Renter, User } from "../types";
import { listFrom, dashboardFrom } from "../utils/formatters";
import { markOnline } from "../services/offlineQueue";

const SESSION_CACHE_KEY = "@staynexa_auth_session_v1";
const LEGACY_SESSION_CACHE_KEY = "@hosteldesk_auth_session_v1";

interface CachedSession {
  token: string;
  user: User;
  role: "RENTER" | "ADMIN";
  hostels?: Hostel[];
  renterDoc?: Renter | null;
  savedAt: number;
}

export interface AuthActions {
  token: string | null;
  currentUser: User | null;
  currentRenterDoc: Renter | null;
  setCurrentRenterDoc: (r: Renter | null) => void;

  loading: boolean;
  initializing: boolean;

  error: string;
  setError: (e: string) => void;

  loginRole: "RENTER" | "ADMIN";
  setLoginRole: (r: "RENTER" | "ADMIN") => void;

  email: string;
  setEmail: (v: string) => void;

  password: string;
  setPassword: (v: string) => void;

  showPassword: boolean;
  setShowPassword: (
    v: boolean | ((prev: boolean) => boolean),
  ) => void;

  showRenterEmailFallback: boolean;
  setShowRenterEmailFallback: (v: boolean) => void;

  renterEmailInput: string;
  setRenterEmailInput: (v: string) => void;

  renterPasswordInput: string;
  setRenterPasswordInput: (v: string) => void;

  loginWithGoogle: () => Promise<void>;
  loginRenterWithEmail: () => Promise<void>;
  sendPasswordResetLink: (targetEmail?: string) => Promise<void>;
  loginAdmin: () => Promise<void>;
  logout: () => Promise<void>;

  handleAuthenticatedUser: (
    idToken: string,
    expectedRole?: "RENTER" | "ADMIN",
    callbacks?: AuthCallbacks,
  ) => Promise<void>;
}

export interface AuthCallbacks {
  onHostelsLoaded: (hostels: Hostel[], token: string) => void;
  onDashboardLoaded: (data: unknown) => void;
  onRenterDataNeeded: (
    token: string,
    hostelId: string,
    userId: string,
  ) => void;
  onLogout: () => void;
}

export function useAuth(callbacks?: AuthCallbacks): AuthActions {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRenterDoc, setCurrentRenterDoc] =
    useState<Renter | null>(null);

  const [loading, setLoading] = useState(false);

  // Used while checking for a previously saved session.
  const [initializing, setInitializing] = useState(true);

  const [error, setError] = useState("");

  const [loginRole, setLoginRole] =
    useState<"RENTER" | "ADMIN">("RENTER");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [showRenterEmailFallback, setShowRenterEmailFallback] =
    useState(false);

  const [renterEmailInput, setRenterEmailInput] = useState("");
  const [renterPasswordInput, setRenterPasswordInput] = useState("");

  const authInitialized = useRef(false);

  // Keep wrapped setter that updates AsyncStorage cache in the background
  const updateCurrentRenterDoc = useCallback((r: Renter | null) => {
    setCurrentRenterDoc(r);
    if (r) {
      AsyncStorage.getItem(SESSION_CACHE_KEY)
        .then((raw) => {
          if (raw) {
            try {
              const parsed: CachedSession = JSON.parse(raw);
              parsed.renterDoc = r;
              void AsyncStorage.setItem(
                SESSION_CACHE_KEY,
                JSON.stringify(parsed),
              );
            } catch { }
          }
        })
        .catch(() => { });
    }
  }, []);

  const fetchHostels = useCallback(
    async (idToken: string): Promise<Hostel[]> => {
      const response = await fetch(`${API_URL}/hostels`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await jsonResponse(response);

      if (!response.ok) {
        throw new Error(
          String(
            (data as Record<string, unknown>)?.message ||
            "Unable to load hostels.",
          ),
        );
      }

      return listFrom<Hostel>(data, "hostels");
    },
    [],
  );

  /*
   * ============================================================
   * FAST AUTHENTICATION HANDLER
   * ============================================================
   * Parallelizes /auth/me and /hostels to cut round-trip latency in half.
   * Immediately commits user and token so the UI transitions instantly.
   */
  const handleAuthenticatedUser = useCallback(
    async (
      idToken: string,
      expectedRole?: "RENTER" | "ADMIN",
      cb?: AuthCallbacks,
    ) => {
      const cbs = cb ?? callbacks;
      const headers = {
        Authorization: `Bearer ${idToken}`,
      };

      // 1. Fetch /auth/me and /hostels simultaneously in parallel
      const mePromise = (async () => {
        try {
          const res = await fetch(`${API_URL}/auth/me`, { headers });
          const data = await jsonResponse(res);
          return { res, data };
        } catch {
          // Fast retry on cold start or network burp
          await new Promise((r) => setTimeout(r, 800));
          const res = await fetch(`${API_URL}/auth/me`, { headers });
          const data = await jsonResponse(res);
          return { res, data };
        }
      })();

      const hostelsPromise = fetch(`${API_URL}/hostels`, { headers })
        .then(async (r) => (r.ok ? listFrom<Hostel>(await jsonResponse(r), "hostels") : ([] as Hostel[])))
        .catch(() => [] as Hostel[]);

      let meResponse: Response | null = null;
      let meData: any = null;
      let hostelData: Hostel[] = [];

      try {
        const [meResult, fetchedHostels] = await Promise.all([mePromise, hostelsPromise]);
        meResponse = meResult.res;
        meData = meResult.data;
        hostelData = fetchedHostels;
      } catch {
        throw new Error("Unable to reach Hostella servers. Please check your internet connection.");
      }

      if (!meResponse || !meResponse.ok) {
        throw new Error(
          String(
            (meData as Record<string, unknown>)?.message ||
            "Unable to verify account profile. Please check credentials or contact admin.",
          ),
        );
      }

      markOnline();

      const me = meData as Record<string, any>;
      const user = (me.user || me) as User;
      const role = user?.role;

      if (expectedRole) {
        if (expectedRole === "RENTER" && role !== "RENTER") {
          await signOut(auth).catch(() => {});
          throw new Error("Invalid login portal. Please switch to the 'Hostel Admin' tab to log in as an administrator.");
        }
        if (expectedRole === "ADMIN" && role === "RENTER") {
          await signOut(auth).catch(() => {});
          throw new Error("Invalid login portal. Please switch to the 'Resident' tab to log in as a resident.");
        }
      }

      // Automatically sync UI login tab to the user's actual database role
      if (role === "RENTER") {
        setLoginRole("RENTER");
      } else {
        setLoginRole("ADMIN");
      }

      /*
       * Save authenticated user and token immediately.
       */
      setToken(idToken);
      setCurrentUser(user);
      setError("");

      // Persist session to AsyncStorage immediately for instant resume on app reopen
      const sessionToSave: CachedSession = {
        token: idToken,
        user,
        role: role === "RENTER" ? "RENTER" : "ADMIN",
        hostels: hostelData,
        savedAt: Date.now(),
      };
      await AsyncStorage.setItem(
        SESSION_CACHE_KEY,
        JSON.stringify(sessionToSave),
      ).catch(() => { });

      /*
       * Load hostels in application state
       */
      cbs?.onHostelsLoaded(hostelData, idToken);

      /*
       * Renter flow
       */
      if (role === "RENTER") {
        if (hostelData[0]?.id) {
          cbs?.onRenterDataNeeded(idToken, hostelData[0].id, user.id);
        }
        return;
      }

      /*
       * Repair person flow
       */
      if (role === "REPAIR_PERSON") {
        return;
      }

      /*
       * Admin flow: load initial dashboard non-blockingly
       */
      fetch(`${API_URL}/dashboard`, { headers })
        .then(jsonResponse)
        .then((dashData) => {
          cbs?.onDashboardLoaded(dashboardFrom(dashData));
        })
        .catch(() => { });
    },
    [callbacks],
  );

  /*
   * ============================================================
   * INSTANT SESSION RESTORATION FROM ASYNC STORAGE
   * ============================================================
   * Runs immediately on app mount. Restores token, user, hostels,
   * and renter document in ~5ms so the user NEVER sees the login
   * screen when the app is closed and reopened.
   */
  useEffect(() => {
    let isMounted = true;
    warmupApi();

    async function restoreCachedSession() {
      try {
        let raw = await AsyncStorage.getItem(SESSION_CACHE_KEY);
        if (!raw) {
          raw = await AsyncStorage.getItem(LEGACY_SESSION_CACHE_KEY);
        }
        if (raw && isMounted) {
          const cached: CachedSession = JSON.parse(raw);
          if (cached?.token && cached?.user) {
            setToken(cached.token);
            setCurrentUser(cached.user);
            setLoginRole(
              cached.role ||
              (cached.user.role === "RENTER" ? "RENTER" : "ADMIN"),
            );
            if (cached.renterDoc) {
              setCurrentRenterDoc(cached.renterDoc);
            }
            if (cached.hostels && cached.hostels.length > 0) {
              callbacks?.onHostelsLoaded(cached.hostels, cached.token);
            }
            // User is restored instantly!
            setInitializing(false);
            return;
          }
        }
        if (isMounted) {
          setLoginRole("RENTER");
          setInitializing(false);
        }
      } catch (err) {
        console.warn("Failed reading cached auth session:", err);
        if (isMounted) {
          setLoginRole("RENTER");
          setInitializing(false);
        }
      }
    }

    void restoreCachedSession();

    return () => {
      isMounted = false;
    };
  }, [callbacks]);

  /*
   * ============================================================
   * FIREBASE AUTH STATE & TOKEN REFRESH LISTENER
   * ============================================================
   * Background verification & token synchronization.
   * NEVER signs out on network errors or Render spin-up delays!
   */
  useEffect(() => {
    let mounted = true;

    const unsubscribe = onIdTokenChanged(
      auth,
      async (firebaseUser) => {
        if (!mounted) return;

        // No Firebase user in native storage
        if (!firebaseUser) {
          // If we had no cached session either, finalize initialization
          authInitialized.current = true;
          const cached = await AsyncStorage.getItem(SESSION_CACHE_KEY).catch(
            () => null,
          );
          if (!cached) {
            setToken(null);
            setCurrentUser(null);
            setCurrentRenterDoc(null);
            setLoginRole("RENTER");
          }
          if (mounted) {
            setInitializing(false);
          }
          return;
        }

        try {
          // Fast local token retrieval
          const idToken = await firebaseUser.getIdToken(false);

          // Background revalidation on first event or token change
          if (!authInitialized.current) {
            authInitialized.current = true;

            try {
              const [meResponse, hostelsRes] = await Promise.all([
                fetch(`${API_URL}/auth/me`, {
                  headers: { Authorization: `Bearer ${idToken}` },
                }),
                fetch(`${API_URL}/hostels`, {
                  headers: { Authorization: `Bearer ${idToken}` },
                }).catch(() => null),
              ]);

              if (meResponse.ok) {
                markOnline();
                const meData = (await jsonResponse(meResponse)) as any;
                const user = (meData.user || meData) as User;
                if (user && mounted) {
                  setToken(idToken);
                  setCurrentUser(user);

                  let hostels: Hostel[] = [];
                  if (hostelsRes && hostelsRes.ok) {
                    const hostelsData = await jsonResponse(hostelsRes);
                    hostels = listFrom<Hostel>(hostelsData, "hostels");
                  }

                  if (hostels.length > 0) {
                    callbacks?.onHostelsLoaded(hostels, idToken);
                    if (user.role === "RENTER" && hostels[0]?.id) {
                      callbacks?.onRenterDataNeeded(
                        idToken,
                        hostels[0].id,
                        user.id,
                      );
                    }
                  }

                  // Update cached session
                  const existingRaw = await AsyncStorage.getItem(
                    SESSION_CACHE_KEY,
                  ).catch(() => null);
                  const existing = existingRaw
                    ? JSON.parse(existingRaw)
                    : {};
                  await AsyncStorage.setItem(
                    SESSION_CACHE_KEY,
                    JSON.stringify({
                      ...existing,
                      token: idToken,
                      user,
                      role: user.role === "RENTER" ? "RENTER" : "ADMIN",
                      hostels:
                        hostels.length > 0 ? hostels : existing.hostels,
                      savedAt: Date.now(),
                    }),
                  ).catch(() => { });
                }
              } else if (meResponse.status === 401) {
                // Token may have expired or was revoked - try forcing a refresh once
                const freshToken = await firebaseUser.getIdToken(true);
                const retryRes = await fetch(`${API_URL}/auth/me`, {
                  headers: { Authorization: `Bearer ${freshToken}` },
                });
                if (retryRes.ok) {
                  const retryData = (await jsonResponse(retryRes)) as any;
                  const retryUser = (retryData.user || retryData) as User;
                  if (retryUser && mounted) {
                    setToken(freshToken);
                    setCurrentUser(retryUser);
                  }
                } else if (retryRes.status === 401) {
                  // Explicitly revoked
                  await signOut(auth);
                  await AsyncStorage.removeItem(SESSION_CACHE_KEY).catch(
                    () => { },
                  );
                  await AsyncStorage.removeItem(LEGACY_SESSION_CACHE_KEY).catch(
                    () => { },
                  );
                  if (mounted) {
                    setToken(null);
                    setCurrentUser(null);
                    setCurrentRenterDoc(null);
                  }
                }
              } else {
                // Server returned non-ok status (e.g. 500, 502, 503)
                // If we do not have a cached currentUser, do not leave token dangling
                if (!currentUser && mounted) {
                  setToken(null);
                }
              }
            } catch (netErr) {
              // Network error or cold backend:
              // Keep user logged in with their cached session if they have one.
              // If there was no cached user, clear dangling token so user is not stuck.
              console.warn(
                "Background sync skipped due to network:",
                netErr,
              );
              if (!currentUser && mounted) {
                setToken(null);
              }
            }
          } else {
            // Already initialized, background refresh of token
            if (currentUser && mounted) {
              setToken(idToken);
            }
          }
        } catch (err) {
          console.warn("Firebase token refresh error:", err);
        } finally {
          if (mounted) {
            setInitializing(false);
          }
        }
      },
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [callbacks]);

  /*
   * ============================================================
   * GOOGLE LOGIN
   * ============================================================
   */
  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (Platform.OS === "web") {
        const provider = new GoogleAuthProvider();

        const credential =
          await signInWithPopup(auth, provider);

        const idToken =
          await credential.user.getIdToken();

        await handleAuthenticatedUser(
          idToken,
          "RENTER",
        );

        return;
      }

      const authUrl =
        `https://staynexa-17a95.firebaseapp.com/__/auth/handler` +
        `?apiKey=AIzaSyAZZlhQGPf0eXNlXYdn3cHFnMzKhF7oEqk` +
        `&appName=%5BDEFAULT%5D` +
        `&authType=signInWithPopup` +
        `&providerId=google.com` +
        `&scopes=profile%20email`;

      const result =
        await WebBrowser.openAuthSessionAsync(
          authUrl,
          "staynexa://",
        );

      if (
        result.type === "success" &&
        auth.currentUser
      ) {
        const idToken =
          await auth.currentUser.getIdToken();

        try {
          await handleAuthenticatedUser(
            idToken,
            "RENTER",
          );
          return;
        } catch (profileErr: any) {
          await signOut(auth).catch(() => {});
          setToken(null);
          setCurrentUser(null);
          setError(profileErr?.message || "Failed to load resident profile. Please try again.");
          return;
        }
      }

      setShowRenterEmailFallback(true);
    } catch (err) {
      setShowRenterEmailFallback(true);

      setError(
        err instanceof Error
          ? err.message
          : "Google Sign-In failed.",
      );
    } finally {
      setLoading(false);
    }
  }, [handleAuthenticatedUser]);

  /*
   * Helper to format Firebase and auth errors into user-friendly messages
   */
  function formatAuthError(err: unknown, currentRole: "RENTER" | "ADMIN"): string {
    if (!err) return "Login failed. Please check your credentials.";
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("auth/invalid-credential") ||
      msg.includes("auth/wrong-password") ||
      msg.includes("auth/user-not-found") ||
      msg.includes("auth/invalid-login-credentials")
    ) {
      if (currentRole === "RENTER") {
        return "Invalid credentials. If you are an Admin, please switch to the 'Hostel Admin' tab at the top. If you forgot your password, tap 'Need to set or forgot password?' below.";
      }
      return "Invalid credentials. If you are a Resident, please switch to the 'Resident' tab at the top. If you forgot your password, tap 'Forgot password? Send Reset Email' below.";
    }
    if (msg.includes("auth/too-many-requests")) {
      return "Too many failed login attempts. Please wait 2 minutes or reset your password.";
    }
    if (msg.includes("auth/invalid-email")) {
      return "Please enter a valid email address.";
    }
    if (msg.includes("auth/user-disabled")) {
      return "This user account has been disabled. Please contact your hostel administrator.";
    }
    if (msg.includes("Network request failed") || msg.includes("network-request-failed")) {
      return "Network connection issue. Please check your internet connection.";
    }
    return msg.replace(/^Firebase:\s*Error\s*\((auth\/[^)]+)\)\.?/i, "Login failed ($1). Please check credentials.");
  }

  /*
   * ============================================================
   * RENTER EMAIL / MOBILE LOGIN
   * ============================================================
   */
  const loginRenterWithEmail = useCallback(async () => {
    const rawInput = renterEmailInput.trim();
    if (!rawInput || !renterPasswordInput) {
      setError(
        "Please enter your registered email or mobile number and password.",
      );
      return;
    }

    setLoading(true);
    setError("");

    let resolvedEmail = rawInput.toLowerCase();
    let credential;

    try {
      // If identifier has no @, resolve mobile number via backend
      if (!rawInput.includes("@")) {
        const lookupRes = await fetch(`${API_URL}/auth/login-lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: rawInput }),
        });
        const lookupData = (await jsonResponse(lookupRes)) as {
          email?: string;
          message?: string;
        };
        if (lookupRes.ok && lookupData.email) {
          resolvedEmail = lookupData.email.trim().toLowerCase();
        } else {
          throw new Error(
            lookupData.message ||
              "No account found registered with this mobile number.",
          );
        }
      }

      try {
        credential = await signInWithEmailAndPassword(
          auth,
          resolvedEmail,
          renterPasswordInput,
        );
      } catch (signInErr: any) {
        if (
          renterPasswordInput !== renterPasswordInput.trim() &&
          String(signInErr?.message || "").includes("invalid-credential")
        ) {
          credential = await signInWithEmailAndPassword(
            auth,
            resolvedEmail,
            renterPasswordInput.trim(),
          );
        } else {
          throw signInErr;
        }
      }
    } catch (err) {
      setError(formatAuthError(err, "RENTER"));
      setLoading(false);
      return;
    }

    // Firebase Auth credentials verified. Now load user profile.
    try {
      const idToken = await credential.user.getIdToken();
      await handleAuthenticatedUser(idToken, "RENTER");
      setError("");
    } catch (err: any) {
      await signOut(auth).catch(() => {});
      setToken(null);
      setCurrentUser(null);
      setError(err?.message || "Failed to load resident profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    renterEmailInput,
    renterPasswordInput,
    handleAuthenticatedUser,
  ]);

  /*
   * ============================================================
   * PASSWORD RESET
   * ============================================================
   */
  const sendPasswordResetLink = useCallback(
    async (targetEmail?: string) => {
      const toEmail = (
        targetEmail ||
        renterEmailInput ||
        email
      ).trim().toLowerCase();

      if (!toEmail) {
        setError(
          "Please enter your registered email address first.",
        );
        return;
      }

      setLoading(true);
      setError("");

      try {
        // Send official Firebase password reset link via Google infrastructure
        await sendPasswordResetEmail(auth, toEmail);
        Alert.alert(
          "Reset Email Sent",
          `A password reset link has been sent to ${toEmail}. Please check your inbox and spam folder, set your password, then return here to log in.`,
        );
      } catch (fbErr: any) {
        const fbMsg = String(fbErr?.message || "");
        if (fbMsg.includes("user-not-found") || fbMsg.includes("invalid-credential")) {
          setError(`No account found registered with ${toEmail}.`);
        } else {
          // Fallback to backend reset endpoint
          try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: toEmail }),
            });
            const resData = (await jsonResponse(res)) as { message?: string };
            Alert.alert(
              "Password Setup Sent",
              resData?.message || `If ${toEmail} is registered, a reset email has been sent.`,
            );
          } catch {
            setError(formatAuthError(fbErr, "RENTER"));
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [renterEmailInput, email],
  );

  /*
   * ============================================================
   * ADMIN / STAFF LOGIN (Supports Email OR Mobile Number)
   * ============================================================
   */
  const loginAdmin = useCallback(async () => {
    const rawIdentifier = email.trim();
    if (!rawIdentifier || !password) {
      setError(
        "Enter your email/mobile number and password.",
      );
      return;
    }

    setLoading(true);
    setError("");

    let resolvedEmail = rawIdentifier.toLowerCase();
    let credential;

    try {
      // If identifier has no @, resolve mobile number via backend
      if (!rawIdentifier.includes("@")) {
        const lookupRes = await fetch(`${API_URL}/auth/login-lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: rawIdentifier }),
        });
        const lookupData = (await jsonResponse(lookupRes)) as {
          success?: boolean;
          email?: string;
          message?: string;
        };
        if (!lookupRes.ok || !lookupData.email) {
          throw new Error(
            lookupData.message ||
              "No account found registered with this mobile number.",
          );
        }
        resolvedEmail = (lookupData.email || "").trim().toLowerCase();
      }

      try {
        credential = await signInWithEmailAndPassword(
          auth,
          resolvedEmail,
          password,
        );
      } catch (signInErr: any) {
        if (
          password !== password.trim() &&
          String(signInErr?.message || "").includes("invalid-credential")
        ) {
          credential = await signInWithEmailAndPassword(
            auth,
            resolvedEmail,
            password.trim(),
          );
        } else {
          throw signInErr;
        }
      }
    } catch (err) {
      setError(formatAuthError(err, "ADMIN"));
      setLoading(false);
      return;
    }

    // Firebase Auth credentials verified. Now load admin profile.
    try {
      const idToken = await credential.user.getIdToken();
      await handleAuthenticatedUser(idToken, "ADMIN");
      setError("");
    } catch (err: any) {
      await signOut(auth).catch(() => {});
      setToken(null);
      setCurrentUser(null);
      setError(err?.message || "Failed to load admin profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    email,
    password,
    handleAuthenticatedUser,
  ]);

  /*
   * ============================================================
   * EXPLICIT LOGOUT
   * ============================================================
   * Only explicit logout clears the saved session.
   * Closing the app never logs the user out.
   */
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("SignOut error:", err);
    }

    await AsyncStorage.removeItem(SESSION_CACHE_KEY).catch(
      () => { },
    );
    await AsyncStorage.removeItem(LEGACY_SESSION_CACHE_KEY).catch(
      () => { },
    );

    setToken(null);
    setCurrentUser(null);
    setCurrentRenterDoc(null);
    setLoginRole("RENTER");

    setEmail("");
    setPassword("");

    setRenterEmailInput("");
    setRenterPasswordInput("");

    setError("");

    callbacks?.onLogout();
  }, [callbacks]);

  return {
    token,
    currentUser,
    currentRenterDoc,
    setCurrentRenterDoc: updateCurrentRenterDoc,

    loading,
    initializing,

    error,
    setError,

    loginRole,
    setLoginRole,

    email,
    setEmail,

    password,
    setPassword,

    showPassword,
    setShowPassword,

    showRenterEmailFallback,
    setShowRenterEmailFallback,

    renterEmailInput,
    setRenterEmailInput,

    renterPasswordInput,
    setRenterPasswordInput,

    loginWithGoogle,
    loginRenterWithEmail,
    sendPasswordResetLink,
    loginAdmin,
    logout,

    handleAuthenticatedUser,
  };
}