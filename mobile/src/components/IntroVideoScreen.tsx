import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { haptic } from "../utils/haptics";

// Source the introductory video asset
// videoprojects.mp4 placed in mobile/assets/
const introVideoSource = require("../../assets/videoprojects.mp4");

interface IntroVideoScreenProps {
  onFinish: () => void;
}

export function IntroVideoScreen({ onFinish }: IntroVideoScreenProps) {
  const insets = useSafeAreaInsets();
  const [hasFinished, setHasFinished] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? (StatusBar.currentHeight || 28) : 24,
  );

  const handleComplete = useCallback(() => {
    if (hasFinished) return;
    setHasFinished(true);

    // Smooth fade-out transition into the app
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      onFinish();
    });
  }, [hasFinished, fadeAnim, onFinish]);

  // Initialize expo-video player
  const player = useVideoPlayer(introVideoSource, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  // Listen for playback completion
  useEffect(() => {
    const sub = player.addListener("playToEnd", () => {
      handleComplete();
    });

    // Fallback safety timeout in case video ends or cannot play
    const fallbackTimer = setTimeout(() => {
      handleComplete();
    }, 12000);

    return () => {
      sub.remove();
      clearTimeout(fallbackTimer);
    };
  }, [player, handleComplete]);

  const handleSkip = () => {
    haptic.light();
    try {
      player.pause();
    } catch {
      // Safe fallback
    }
    handleComplete();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        },
      ]}
      pointerEvents={hasFinished ? "none" : "auto"}
    >
      <StatusBar hidden />

      {/* Full-screen video player */}
      <VideoView
        player={player}
        style={styles.videoPlayer}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Modern Translucent Skip Button */}
      <View style={[styles.topBar, { top: topInset + 10 }]}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          activeOpacity={0.8}
        >
          <Text style={styles.skipText}>Skip</Text>
          <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000",
    zIndex: 99999,
    elevation: 99999,
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBar: {
    position: "absolute",
    right: 18,
    zIndex: 100000,
    elevation: 100000,
  },
  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  skipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
