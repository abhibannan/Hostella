import React, { useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export interface SwipeAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
  textColor?: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  rightActions?: SwipeAction[];
  leftActions?: SwipeAction[];
  actionWidth?: number;
}

export function SwipeableRow({
  children,
  rightActions = [],
  leftActions = [],
  actionWidth = 76,
}: SwipeableRowProps) {
  const panX = useRef(new Animated.Value(0)).current;
  const currentOffset = useRef(0);

  const maxRightOffset = -(rightActions.length * actionWidth);
  const maxLeftOffset = leftActions.length * actionWidth;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        // Capture horizontal movements early so parent scroll view does not hijack the swipe
        return Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4;
      },
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
      },
      onPanResponderTerminationRequest: () => false, // Prevent parent ScrollView from canceling the swipe
      onPanResponderGrant: () => {
        panX.setOffset(currentOffset.current);
        panX.setValue(0);
      },
      onPanResponderMove: (_, gesture) => {
        const potential = currentOffset.current + gesture.dx;

        // Apply progressive rubber-band damping beyond action thresholds
        if (potential < maxRightOffset && rightActions.length > 0) {
          const excess = potential - maxRightOffset;
          panX.setValue(gesture.dx - excess * 0.72);
        } else if (potential > maxLeftOffset && leftActions.length > 0) {
          const excess = potential - maxLeftOffset;
          panX.setValue(gesture.dx - excess * 0.72);
        } else if (potential < 0 && rightActions.length === 0) {
          // Hard resistance if no right actions
          panX.setValue(gesture.dx * 0.15);
        } else if (potential > 0 && leftActions.length === 0) {
          // Hard resistance if no left actions
          panX.setValue(gesture.dx * 0.15);
        } else {
          panX.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        panX.flattenOffset();
        const totalX = currentOffset.current + gesture.dx;
        const vx = gesture.vx;

        let targetX = 0;

        // Velocity or distance based snapping
        if (rightActions.length > 0 && (vx < -0.45 || totalX < maxRightOffset * 0.45)) {
          targetX = maxRightOffset;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (leftActions.length > 0 && (vx > 0.45 || totalX > maxLeftOffset * 0.45)) {
          targetX = maxLeftOffset;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (Math.abs(vx) > 0.4) {
          // Quick swipe back to close
          targetX = 0;
        }

        currentOffset.current = targetX;
        Animated.spring(panX, {
          toValue: targetX,
          useNativeDriver: true,
          tension: 85,
          friction: 12,
        }).start();
      },
      onPanResponderTerminate: () => {
        panX.flattenOffset();
        Animated.spring(panX, {
          toValue: currentOffset.current,
          useNativeDriver: true,
          tension: 90,
          friction: 12,
        }).start();
      },
    })
  ).current;

  const close = () => {
    currentOffset.current = 0;
    Animated.spring(panX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
  };

  // Interpolations for smooth action reveals
  const leftOpacity = leftActions.length > 0
    ? panX.interpolate({
        inputRange: [0, maxLeftOffset * 0.35, maxLeftOffset],
        outputRange: [0, 0.65, 1],
        extrapolate: "clamp",
      })
    : 0;

  const rightOpacity = rightActions.length > 0
    ? panX.interpolate({
        inputRange: [maxRightOffset, maxRightOffset * 0.35, 0],
        outputRange: [1, 0.65, 0],
        extrapolate: "clamp",
      })
    : 0;

  return (
    <View style={styles.container}>
      {/* Left Revealed Actions */}
      {leftActions.length > 0 && (
        <Animated.View
          style={[
            styles.actionsContainer,
            styles.leftActions,
            { opacity: leftOpacity },
          ]}
        >
          {leftActions.map((action, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.actionBtn,
                { width: actionWidth, backgroundColor: action.backgroundColor },
              ]}
              onPress={() => {
                close();
                action.onPress();
              }}
              activeOpacity={0.82}
            >
              <Ionicons name={action.icon} size={21} color={action.textColor || "#FFF"} />
              <Text style={[styles.actionLabel, { color: action.textColor || "#FFF" }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* Right Revealed Actions */}
      {rightActions.length > 0 && (
        <Animated.View
          style={[
            styles.actionsContainer,
            styles.rightActions,
            { opacity: rightOpacity },
          ]}
        >
          {rightActions.map((action, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.actionBtn,
                { width: actionWidth, backgroundColor: action.backgroundColor },
              ]}
              onPress={() => {
                close();
                action.onPress();
              }}
              activeOpacity={0.82}
            >
              <Ionicons name={action.icon} size={21} color={action.textColor || "#FFF"} />
              <Text style={[styles.actionLabel, { color: action.textColor || "#FFF" }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* Foreground Swipeable Content */}
      <Animated.View
        style={{ transform: [{ translateX: panX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
  },
  actionsContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "stretch",
    zIndex: 1,
  },
  leftActions: {
    left: 0,
  },
  rightActions: {
    right: 0,
  },
  actionBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
});
