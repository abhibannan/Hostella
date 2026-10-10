import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../contexts/ThemeContext";
import { GRADIENTS, RADIUS, shadow } from "../constants/theme";
import { haptic } from "../utils/haptics";

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton — soft shimmer placeholder
// ─────────────────────────────────────────────────────────────────────────────
export function Skeleton({ width, height, borderRadius = 10, style }: any) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.8, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.grayFill, opacity: anim }, style]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AnimatedPressable — springy press feedback
// ─────────────────────────────────────────────────────────────────────────────
export function AnimatedPressable({ children, onPress, style, containerStyle, scaleTo = 0.96 }: any) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => {
        haptic.cardPress();
        Animated.spring(scale, { toValue: scaleTo, speed: 40, bounciness: 0, useNativeDriver: true }).start();
      }}
      onPressOut={() => Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true }).start()}
      onPress={onPress}
      style={containerStyle}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reveal — staggered fade-up entrance
// ─────────────────────────────────────────────────────────────────────────────
export function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 520,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [a, delay]);
  return (
    <Animated.View
      style={[
        { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CountUp — numbers that roll up to their value
// ─────────────────────────────────────────────────────────────────────────────
export function CountUp({
  value,
  format,
  style,
  duration = 700,
}: {
  value: number;
  format?: (n: number) => string;
  style?: any;
  duration?: number;
}) {
  const from = useRef(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (from.current !== 0 || value === 0) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = new Animated.Value(from.current);
    const id = a.addListener(({ value: v }) => setShown(v));
    Animated.timing(a, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      from.current = value;
      setShown(value);
    });
    return () => {
      a.removeListener(id);
      a.stopAnimation();
    };
  }, [value, duration]);
  const n = Math.round(shown);
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit>
      {format ? format(n) : String(n)}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card — the base surface used everywhere
// ─────────────────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  padded = true,
  level = 1,
}: {
  children: React.ReactNode;
  style?: any;
  padded?: boolean;
  level?: 1 | 2 | 3;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: RADIUS.xl,
          padding: padded ? 16 : 0,
        },
        shadow(level, isDark),
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill — tiny status chip
// ─────────────────────────────────────────────────────────────────────────────
export function Pill({
  label,
  tone = "primary",
  icon,
}: {
  label: string;
  tone?: "primary" | "success" | "warning" | "danger" | "purple" | "neutral";
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const map = {
    primary: [colors.primaryLight, colors.primary],
    success: [colors.successLight, colors.success],
    warning: [colors.warningLight, colors.warning],
    danger: [colors.dangerLight, colors.danger],
    purple: [colors.purpleLight, colors.purple],
    neutral: [colors.grayFill, colors.secondary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GradientButton — the primary call-to-action
// ─────────────────────────────────────────────────────────────────────────────
export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: any;
}) {
  const { isDark } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const inactive = disabled || loading;
  return (
    <Pressable
      disabled={inactive}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, speed: 40, bounciness: 0, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true }).start()}
      onPress={() => {
        haptic.medium();
        onPress();
      }}
    >
      <Animated.View
        style={[
          { transform: [{ scale }], opacity: disabled ? 0.55 : 1 },
          shadow(2, isDark),
          { shadowColor: "#5B4DF5" },
          style,
        ]}
      >
        <LinearGradient
          colors={GRADIENTS.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBtn}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.gradientBtnText}>{label}</Text>
              {icon ? <Ionicons name={icon} size={18} color="#FFFFFF" /> : null}
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header — screen title block (same props as before + optional extras)
// ─────────────────────────────────────────────────────────────────────────────
interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  eyebrow?: string;
  right?: React.ReactNode;
}

export function Header({ title, subtitle, eyebrow, right }: HeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={[styles.headerEyebrow, { color: colors.primary }]}>{eyebrow}</Text> : null}
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.secondary }]}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={{ marginLeft: 12 }}>{right}</View> : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCard — KPI tile with ghost icon watermark
// ─────────────────────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "blue" | "green" | "orange" | "purple" | "red";
  onPress?: () => void;
}

export function StatCard({ title, value, icon, tone, onPress }: StatCardProps) {
  const { colors, isDark } = useTheme();
  const toneMap = {
    blue: { bg: colors.primaryLight, fg: colors.primary },
    green: { bg: colors.successLight, fg: colors.success },
    orange: { bg: colors.orangeLight, fg: colors.orange },
    purple: { bg: colors.purpleLight, fg: colors.purple },
    red: { bg: colors.dangerLight, fg: colors.danger },
  } as const;
  const t = toneMap[tone];

  const content = (
    <View
      style={[
        styles.statCardInner,
        { backgroundColor: colors.card, borderColor: colors.border },
        shadow(1, isDark),
      ]}
    >
      <Ionicons name={icon} size={70} color={t.fg} style={styles.statGhost} />
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={19} color={t.fg} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.statTitle, { color: colors.secondary }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        containerStyle={styles.statCardWrapper}
        style={{ flex: 1 }}
        scaleTo={0.97}
        onPress={onPress}
      >
        {content}
      </AnimatedPressable>
    );
  }
  return <View style={styles.statCardWrapper}>{content}</View>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionTitle
// ─────────────────────────────────────────────────────────────────────────────
interface SectionTitleProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionTitle({ title, action, onAction }: SectionTitleProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={[styles.sectionTick, { backgroundColor: colors.primary }]} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState — concentric halo icon
// ─────────────────────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyHaloOuter, { backgroundColor: colors.primaryLight }]}>
        <View style={[styles.emptyHaloInner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name={icon} size={26} color={colors.primary} />
        </View>
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyDescription, { color: colors.secondary }]}>{description}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BottomTab — gradient active chip, springy icon
// ─────────────────────────────────────────────────────────────────────────────
interface BottomTabProps {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number | string;
}

export function BottomTab({ icon, activeIcon, label, active, onPress, badge }: BottomTabProps) {
  const { colors } = useTheme();
  const lift = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lift, { toValue: active ? 1 : 0, duration: 100, useNativeDriver: true }).start();
  }, [active, lift]);

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <Pressable
      style={styles.bottomTab}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      android_ripple={{ color: colors.primaryLight, borderless: true, radius: 36 }}
    >
      <Animated.View style={{ alignItems: "center", transform: [{ translateY }, { scale }] }}>
        <View style={styles.tabIconSlot}>
          {active ? (
            <LinearGradient
              colors={GRADIENTS.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tabIconActive}
            >
              <Ionicons name={activeIcon} size={20} color="#FFFFFF" />
            </LinearGradient>
          ) : (
            <View style={styles.tabIconIdle}>
              <Ionicons name={icon} size={22} color={colors.secondary} />
            </View>
          )}
          {Boolean(badge) && (
            <View style={[styles.tabBadge, { backgroundColor: colors.danger, borderColor: colors.card }]}>
              <Text style={styles.tabBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.bottomLabel,
            { color: active ? colors.primary : colors.secondary },
            active && styles.bottomLabelActive,
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },

  gradientBtn: {
    minHeight: 54,
    borderRadius: RADIUS.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
  },
  gradientBtnText: { color: "#FFFFFF", fontSize: 15.5, fontWeight: "800", letterSpacing: 0.2 },

  header: { flexDirection: "row", alignItems: "center", paddingBottom: 20, paddingTop: 6 },
  headerEyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 4 },
  headerTitle: { fontSize: 30, fontWeight: "800", letterSpacing: -0.9 },
  headerSubtitle: { marginTop: 5, fontSize: 14, lineHeight: 20 },

  statCardWrapper: { width: "48%", marginBottom: 12 },
  statCardInner: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: RADIUS.xl,
    padding: 15,
    flex: 1,
    overflow: "hidden",
    minHeight: 118,
  },
  statGhost: { position: "absolute", right: -10, top: -8, opacity: 0.07 },
  statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.6 },
  statTitle: { marginTop: 3, fontSize: 12, fontWeight: "600" },

  sectionHeader: {
    marginTop: 26,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTick: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontWeight: "800" },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 44, paddingHorizontal: 24 },
  emptyHaloOuter: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  emptyHaloInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", marginBottom: 6, letterSpacing: -0.2 },
  emptyDescription: { fontSize: 13, textAlign: "center", lineHeight: 19 },

  bottomTab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  tabIconSlot: { position: "relative", alignItems: "center", justifyContent: "center" },
  tabIconActive: { width: 46, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tabIconIdle: { width: 46, height: 32, alignItems: "center", justifyContent: "center" },
  bottomLabel: { fontSize: 10.5, marginTop: 3, fontWeight: "600" },
  bottomLabelActive: { fontWeight: "800" },
  tabBadge: {
    position: "absolute",
    right: -2,
    top: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  tabBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
});