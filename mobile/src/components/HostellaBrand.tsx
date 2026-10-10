import React from "react";
import { View, Image, StyleSheet, StyleProp, ViewStyle, ImageStyle } from "react-native";

interface HostellaBrandProps {
  /** "full": icon + wordmark, "wordmark": only the cursive logo script, "icon": only the 'h' squircle */
  variant?: "full" | "wordmark" | "icon";
  /** "dark": white wordmark for dark headers; "light": cobalt blue wordmark for light surfaces */
  colorScheme?: "light" | "dark";
  /** Size presets */
  size?: "small" | "medium" | "large";
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export function HostellaBrand({
  variant = "wordmark",
  colorScheme = "dark",
  size = "medium",
  style,
  imageStyle,
}: HostellaBrandProps) {
  // Dimensions for wordmark (native aspect ratio is ~2.65 : 1)
  const wordmarkDims = {
    small: { height: 24, width: 64 },
    medium: { height: 32, width: 85 },
    large: { height: 44, width: 117 },
  }[size];

  // Dimensions for icon (1:1 aspect ratio)
  const iconDims = {
    small: { width: 28, height: 28, borderRadius: 8 },
    medium: { width: 38, height: 38, borderRadius: 10 },
    large: { width: 52, height: 52, borderRadius: 14 },
  }[size];

  const wordmarkSource =
    colorScheme === "dark"
      ? require("../../assets/hostella_wordmark_white.png")
      : require("../../assets/hostella_wordmark_blue.png");

  if (variant === "icon") {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={require("../../assets/hostella_icon.png")}
          style={[
            {
              width: iconDims.width,
              height: iconDims.height,
              borderRadius: iconDims.borderRadius,
            },
            imageStyle,
          ]}
          resizeMode="cover"
        />
      </View>
    );
  }

  if (variant === "wordmark") {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={wordmarkSource}
          style={[
            {
              width: wordmarkDims.width,
              height: wordmarkDims.height,
            },
            imageStyle,
          ]}
          resizeMode="contain"
        />
      </View>
    );
  }

  // variant === "full"
  return (
    <View style={[styles.row, style]}>
      <Image
        source={require("../../assets/hostella_icon.png")}
        style={[
          {
            width: iconDims.width,
            height: iconDims.height,
            borderRadius: iconDims.borderRadius,
          },
          imageStyle,
        ]}
        resizeMode="cover"
      />
      <Image
        source={wordmarkSource}
        style={[
          {
            width: wordmarkDims.width,
            height: wordmarkDims.height,
            marginLeft: size === "small" ? 8 : 10,
          },
          imageStyle,
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});
