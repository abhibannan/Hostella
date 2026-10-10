import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../contexts/ThemeContext";
import { GRADIENTS, GOLD, RADIUS, shadow } from "../constants/theme";
import { GradientButton } from "../components/common";
import { HostellaBrand } from "../components/HostellaBrand";
import { haptic } from "../utils/haptics";

interface LoginScreenProps {
  loginRole: "RENTER" | "ADMIN";
  setLoginRole: (r: "RENTER" | "ADMIN") => void;
  // Renter fields
  showRenterEmailFallback?: boolean;
  setShowRenterEmailFallback?: (v: boolean) => void;
  renterEmailInput: string;
  setRenterEmailInput: (v: string) => void;
  renterPasswordInput: string;
  setRenterPasswordInput: (v: string) => void;
  onLoginWithGoogle?: () => void;
  onLoginRenterWithEmail: () => void;
  onSendPasswordResetLink?: () => void;
  // Admin fields
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean | ((prev: boolean) => boolean)) => void;
  onLoginAdmin: () => void;
  // Shared
  loading: boolean;
  error: string;
  setError: (e: string) => void;
}

// ── Focus-aware input ────────────────────────────────────────────────────────
function Field({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  trailing,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboardType?: "default" | "email-address";
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: focused ? colors.primary : colors.secondary }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: focused ? colors.card : colors.surfaceSecondary,
            borderColor: focused ? colors.primary : colors.border,
          },
        ]}
      >
        <Ionicons name={icon} size={19} color={focused ? colors.primary : colors.secondary} />
        <TextInput
          style={[styles.fieldInput, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.secondary + "99"}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {trailing}
      </View>
    </View>
  );
}

export function LoginScreen({
  loginRole,
  setLoginRole,
  renterEmailInput,
  setRenterEmailInput,
  renterPasswordInput,
  setRenterPasswordInput,
  onLoginRenterWithEmail,
  onSendPasswordResetLink,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  onLoginAdmin,
  loading,
  error,
  setError,
}: LoginScreenProps) {
  const { colors, isDark } = useTheme();
  const [showRenterPassword, setShowRenterPassword] = useState(false);

  // Sliding role indicator (optimized for instant snappy sliding)
  const [switchWidth, setSwitchWidth] = useState(0);
  const slide = useRef(new Animated.Value(loginRole === "RENTER" ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(slide, {
      toValue: loginRole === "RENTER" ? 0 : 1,
      speed: 36,
      bounciness: 2,
      useNativeDriver: true,
    }).start();
  }, [loginRole, slide]);
  const segW = Math.max(0, (switchWidth - 8) / 2);
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, segW] });

  const pick = (r: "RENTER" | "ADMIN") => {
    if (r === loginRole) return;
    haptic.selection();
    setLoginRole(r);
    setError("");
  };

  const heroColors = isDark ? GRADIENTS.heroDark : GRADIENTS.hero;
  const isRenter = loginRole === "RENTER";

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 20}
    >
      {/* Hero backdrop */}
      <LinearGradient
        colors={heroColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { height: 330 }]}
      >
        <View style={[styles.orb, { width: 260, height: 260, top: -90, right: -80, backgroundColor: "rgba(255,255,255,0.10)" }]} />
        <View style={[styles.orb, { width: 180, height: 180, top: 120, left: -70, backgroundColor: "rgba(139,92,246,0.35)" }]} />
        <View style={[styles.orb, { width: 90, height: 90, top: 70, right: 40, backgroundColor: "rgba(245,181,68,0.22)" }]} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingTop: 28, paddingHorizontal: 20, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.inner}>
          {/* Brand */}
          <View style={styles.brandRow}>
            <HostellaBrand variant="icon" size="large" />
            <View style={{ marginLeft: 14, justifyContent: "center" }}>
              <HostellaBrand variant="wordmark" colorScheme="dark" size="large" style={{ alignItems: "flex-start" }} />
              <Text style={styles.brandTag}>Smart hostel & PG management</Text>
            </View>
          </View>

          <Text style={styles.heroLine}>Run your{"\n"}property beautifully.</Text>

          <View style={styles.chipRow}>
            {[
              { i: "home-outline", t: "Rooms" },
              { i: "wallet-outline", t: "Rent" },
              { i: "build-outline", t: "Repairs" },
            ].map((c) => (
              <View key={c.t} style={styles.chip}>
                <Ionicons name={c.i as any} size={12} color="#FFFFFF" />
                <Text style={styles.chipText}>{c.t}</Text>
              </View>
            ))}
          </View>

          {/* Auth card */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
              shadow(3, isDark),
            ]}
          >
            {/* Role switch */}
            <View
              style={[styles.switch, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
              onLayout={(e: LayoutChangeEvent) => setSwitchWidth(e.nativeEvent.layout.width)}
            >
              {segW > 0 ? (
                <Animated.View
                  style={[
                    styles.switchThumb,
                    { width: segW, transform: [{ translateX }] },
                    shadow(1, isDark),
                    { backgroundColor: colors.card },
                  ]}
                />
              ) : null}
              <Pressable style={styles.switchTab} onPress={() => pick("RENTER")}>
                <Ionicons
                  name={isRenter ? "person" : "person-outline"}
                  size={16}
                  color={isRenter ? colors.primary : colors.secondary}
                />
                <Text style={[styles.switchText, { color: isRenter ? colors.primary : colors.secondary }]}>
                  Resident
                </Text>
              </Pressable>
              <Pressable style={styles.switchTab} onPress={() => pick("ADMIN")}>
                <Ionicons
                  name={!isRenter ? "shield-checkmark" : "shield-checkmark-outline"}
                  size={16}
                  color={!isRenter ? colors.primary : colors.secondary}
                />
                <Text style={[styles.switchText, { color: !isRenter ? colors.primary : colors.secondary }]}>
                  Hostel Admin
                </Text>
              </Pressable>
            </View>

            <View>
              {isRenter ? (
                <>
                  <Text style={[styles.title, { color: colors.text }]}>Resident Portal</Text>
                  <Text style={[styles.subtitle, { color: colors.secondary }]}>
                    Check your rent, upload payment proof and raise repair requests.
                  </Text>

                  <Field
                    label="EMAIL"
                    icon="mail-outline"
                    value={renterEmailInput}
                    onChangeText={(t) => {
                      setRenterEmailInput(t);
                      if (error) setError("");
                    }}
                    placeholder="Enter registered email"
                    keyboardType="email-address"
                  />
                  <Field
                    label="PASSWORD"
                    icon="lock-closed-outline"
                    value={renterPasswordInput}
                    onChangeText={(t) => {
                      setRenterPasswordInput(t);
                      if (error) setError("");
                    }}
                    placeholder="Enter your password"
                    secure={!showRenterPassword}
                    trailing={
                      <Pressable hitSlop={10} onPress={() => setShowRenterPassword((v) => !v)}>
                        <Ionicons
                          name={showRenterPassword ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={colors.secondary}
                        />
                      </Pressable>
                    }
                  />

                  <GradientButton
                    label="Sign In as Resident"
                    icon="arrow-forward"
                    loading={loading}
                    onPress={onLoginRenterWithEmail}
                    style={{ marginTop: 6 }}
                  />

                  {onSendPasswordResetLink ? (
                    <Pressable style={styles.linkBtn} onPress={onSendPasswordResetLink} hitSlop={8}>
                      <Text style={[styles.linkText, { color: colors.primary }]}>
                        Need to set or forgot password? Send Setup Link
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[styles.title, { color: colors.text }]}>Admin Login</Text>
                  <Text style={[styles.subtitle, { color: colors.secondary }]}>
                    Manage properties, rooms, residents and collections.
                  </Text>

                  <Field
                    label="EMAIL OR MOBILE NUMBER"
                    icon="person-outline"
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (error) setError("");
                    }}
                    placeholder="Enter email or mobile number"
                  />
                  <Field
                    label="PASSWORD"
                    icon="lock-closed-outline"
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      if (error) setError("");
                    }}
                    placeholder="Enter your password"
                    secure={!showPassword}
                    trailing={
                      <Pressable hitSlop={10} onPress={() => setShowPassword((v) => !v)}>
                        <Ionicons
                          name={showPassword ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={colors.secondary}
                        />
                      </Pressable>
                    }
                  />

                  <GradientButton
                    label="Sign In to Management"
                    icon="arrow-forward"
                    loading={loading}
                    onPress={onLoginAdmin}
                    style={{ marginTop: 6 }}
                  />

                  {onSendPasswordResetLink ? (
                    <Pressable style={styles.linkBtn} onPress={onSendPasswordResetLink} hitSlop={8}>
                      <Text style={[styles.linkText, { color: colors.primary }]}>
                        Forgot password? Send Reset Email
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: colors.dangerLight,
                    borderColor: isDark ? "rgba(255,92,122,0.35)" : "#FFD0D8",
                  },
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            ) : null}
          </View>

          {/* Trust footer */}
          <View style={styles.trust}>
            <Ionicons name="shield-checkmark" size={13} color={GOLD} />
            <Text style={[styles.trustText, { color: colors.secondary }]}>
              256-bit encrypted cloud operations • Hostella
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  hero: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: RADIUS.xxl + 8,
    borderBottomRightRadius: RADIUS.xxl + 8,
    overflow: "hidden",
  },
  orb: { position: "absolute", borderRadius: 999 },
  inner: { width: "100%", maxWidth: 460, alignSelf: "center" },

  brandRow: { flexDirection: "row", alignItems: "center" },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandSpark: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  brandTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.7 },
  brandTag: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "600", marginTop: 1 },

  heroLine: {
    color: "#FFFFFF",
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: 26,
  },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 26 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  chipText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },

  card: {
    borderRadius: RADIUS.xxl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 22,
  },
  switch: {
    flexDirection: "row",
    borderRadius: RADIUS.md,
    padding: 4,
    marginBottom: 22,
    borderWidth: 1,
  },
  switchThumb: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: RADIUS.sm,
  },
  switchTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
  },
  switchText: { fontSize: 13, fontWeight: "800" },

  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 20 },

  label: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1, marginBottom: 7, marginLeft: 2 },
  field: {
    minHeight: 54,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldInput: { flex: 1, minHeight: 52, marginLeft: 11, fontSize: 15, fontWeight: "500" },

  linkBtn: { marginTop: 18, alignItems: "center" },
  linkText: { fontSize: 13, fontWeight: "700" },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 13,
    marginTop: 16,
  },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

  trust: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22 },
  trustText: { fontSize: 11, fontWeight: "600" },
});