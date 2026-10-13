import React from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { COLORS } from "../constants/theme";
import { useTheme } from "../contexts/ThemeContext";

interface AuthLoadingScreenProps {
  mode: "init" | "resolving";
  error?: string;
  onCancel?: () => void;
}

export function AuthLoadingScreen({ mode, error, onCancel }: AuthLoadingScreenProps) {
  const { colors, isDark } = useTheme();

  if (mode === "init") {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
