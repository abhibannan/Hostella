import React from "react";
import {
  ActivityIndicator,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";

interface AuthLoadingScreenProps {
  mode: "init" | "resolving";
  error?: string;
  onCancel?: () => void;
}

export function AuthLoadingScreen({ mode, error, onCancel }: AuthLoadingScreenProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0
  );

  if (mode === "init") {
    return (
      <View
        style={[
          styles.safeArea,
          {
            backgroundColor: colors.background,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: topInset,
          },
        ]}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
          translucent={Platform.OS === "android"}
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text
          style={{
            marginTop: 16,
            color: colors.secondary,
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 0.5,
          }}
        >
          Hostella
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
          paddingTop: topInset,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
        translucent={Platform.OS === "android"}
      />
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text
        style={{
          marginTop: 16,
          color: colors.text,
          fontSize: 16,
          fontWeight: "700",
          letterSpacing: 0.3,
        }}
      >
        Signing you in…
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: colors.secondary,
          fontSize: 13,
          textAlign: "center",
          lineHeight: 18,
          maxWidth: 320,
        }}
      >
        Connecting to cloud services. If this takes longer than a few moments, tap below to return to the login screen.
      </Text>
      {error ? (
        <Text
          style={{
            marginTop: 12,
            color: colors.danger,
            fontSize: 13,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {error}
        </Text>
      ) : null}
      {onCancel ? (
        <TouchableOpacity
          style={{
            marginTop: 20,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
          onPress={onCancel}
        >
          <Text style={{ fontSize: 13, color: colors.secondary, fontWeight: "600" }}>
            Cancel & Return to Login
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
