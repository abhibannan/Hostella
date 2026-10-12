import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, TouchableWithoutFeedback } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  centerText: string;
  centerSub: string;
}

export function DonutChart({ data, centerText, centerSub }: DonutChartProps) {
  const { colors } = useTheme();
  const size = 135;
  const strokeWidth = 16;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0);

  const animation = useRef(new Animated.Value(0)).current;

  const playAnimation = () => {
    animation.setValue(0);
    Animated.timing(animation, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    playAnimation();
  }, [data]);

  let offset = 0;
  const circles = data.map((item, index) => {
    const fraction = total > 0 ? Math.max(0, item.value) / total : 0;
    const dash = fraction * circumference;

    const strokeDasharray = animation.interpolate({
      inputRange: [0, 1],
      outputRange: [`0 ${circumference}`, `${dash} ${circumference - dash}`],
    });

    const element = (
      <AnimatedCircle
        key={`${item.label}-${index}`}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={item.color}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray as any}
        strokeDashoffset={-offset}
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
        strokeLinecap="round"
      />
    );
    offset += dash;
    return element;
  });

  return (
    <View style={styles.chartBlock}>
      <TouchableWithoutFeedback onPress={playAnimation}>
        <View style={{ alignItems: "center" }}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors.surfaceSecondary}
              strokeWidth={strokeWidth}
            />
            {circles}
            <SvgText
              x={size / 2}
              y={size / 2 - 2}
              textAnchor="middle"
              fontSize="18"
              fontWeight="800"
              fill={colors.text}
            >
              {centerText}
            </SvgText>
            <SvgText
              x={size / 2}
              y={size / 2 + 16}
              textAnchor="middle"
              fontSize="10"
              fill={colors.secondary}
            >
              {centerSub}
            </SvgText>
          </Svg>
        </View>
      </TouchableWithoutFeedback>
      <View style={styles.legendList}>
        {data.map((item) => (
          <View key={item.label} style={styles.legendRow}>
            <View style={styles.legendLeft}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={[styles.legendLabel, { color: colors.secondary }]}>
                {item.label}
              </Text>
            </View>
            <Text style={[styles.legendValue, { color: colors.text }]}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface MonthlyTrendData {
  month: string;
  collected: number;
  outstanding: number;
}

interface RevenueTrendChartProps {
  data: MonthlyTrendData[];
}

/** Revenue Trend Chart: Dual bar comparison of Collected vs Outstanding over months */
export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const { colors, isDark } = useTheme();
  const width = 330;
  const height = 190;
  const paddingLeft = 24;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 32;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.collected, d.outstanding])
  );

  const groupGap = 16;
  const groupWidth = data.length > 0 ? (chartWidth - groupGap * (data.length - 1)) / data.length : 0;
  const barWidth = Math.max(6, (groupWidth - 4) / 2);

  return (
    <View style={styles.trendContainer}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        <Line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke={colors.border} strokeWidth="1" strokeDasharray="4,4" />
        <Line x1={paddingLeft} y1={paddingTop + chartHeight / 2} x2={width - paddingRight} y2={paddingTop + chartHeight / 2} stroke={colors.border} strokeWidth="1" strokeDasharray="4,4" />
        <Line x1={paddingLeft} y1={paddingTop + chartHeight} x2={width - paddingRight} y2={paddingTop + chartHeight} stroke={colors.border} strokeWidth="1" />

        {data.map((item, index) => {
          const groupX = paddingLeft + index * (groupWidth + groupGap);

          const hCollected = (item.collected / maxVal) * chartHeight;
          const yCollected = paddingTop + chartHeight - hCollected;

          const hOutstanding = (item.outstanding / maxVal) * chartHeight;
          const yOutstanding = paddingTop + chartHeight - hOutstanding;

          return (
            <G key={item.month}>
              {/* Collected Bar (Green / Primary) */}
              <Rect
                x={groupX}
                y={yCollected}
                width={barWidth}
                height={Math.max(3, hCollected)}
                rx="4"
                fill="#10B981"
              />
              {/* Outstanding Bar (Amber / Coral) */}
              <Rect
                x={groupX + barWidth + 3}
                y={yOutstanding}
                width={barWidth}
                height={Math.max(3, hOutstanding)}
                rx="4"
                fill="#F43F5E"
              />
              {/* Month Label */}
              <SvgText
                x={groupX + barWidth}
                y={height - 12}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={colors.secondary}
              >
                {item.month}
              </SvgText>
            </G>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.trendLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: "#10B981" }]} />
          <Text style={[styles.legendText, { color: colors.secondary }]}>Collected</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: "#F43F5E" }]} />
          <Text style={[styles.legendText, { color: colors.secondary }]}>Outstanding</Text>
        </View>
      </View>
    </View>
  );
}

/** Occupancy Gauge: Radial Arc progress gauge showing % fill per hostel */
export function OccupancyGauge({
  percentage,
  occupiedBeds,
  totalBeds,
}: {
  percentage: number;
  occupiedBeds: number;
  totalBeds: number;
}) {
  const { colors, isDark } = useTheme();
  const radius = 54;
  const strokeWidth = 14;
  const normalized = Math.min(100, Math.max(0, percentage));
  const arcLength = Math.PI * radius; // 180 degree semi-circle
  const strokeDashoffset = arcLength * (1 - normalized / 100);

  const gaugeColor =
    normalized >= 85 ? "#10B981" : normalized >= 60 ? "#3B82F6" : "#F59E0B";

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={140} height={85} viewBox="0 0 140 85">
        {/* Background track (semi-circle) */}
        <Path
          d="M 15 75 A 55 55 0 0 1 125 75"
          fill="none"
          stroke={colors.surfaceSecondary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Active Gauge Fill */}
        <Path
          d="M 15 75 A 55 55 0 0 1 125 75"
          fill="none"
          stroke={gaugeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
        <SvgText
          x="70"
          y="62"
          textAnchor="middle"
          fontSize="22"
          fontWeight="800"
          fill={colors.text}
        >
          {`${Math.round(percentage)}%`}
        </SvgText>
        <SvgText
          x="70"
          y="77"
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill={colors.secondary}
        >
          OCCUPANCY
        </SvgText>
      </Svg>

      <Text style={[styles.gaugeDetails, { color: colors.secondary }]}>
        <Text style={{ fontWeight: "700", color: colors.text }}>{occupiedBeds}</Text> of{" "}
        <Text style={{ fontWeight: "700", color: colors.text }}>{totalBeds}</Text> occupied
      </Text>
    </View>
  );
}

/** Month-over-Month Comparison Card */
export function MonthOverMonthCard({
  thisMonthAmount,
  lastMonthAmount,
}: {
  thisMonthAmount: number;
  lastMonthAmount: number;
}) {
  const { colors, isDark } = useTheme();

  const current = Number(thisMonthAmount) || 0;
  const previous = Number(lastMonthAmount) || 0;
  const diff = current - previous;
  const percentChange =
    previous > 0 ? (diff / previous) * 100 : current > 0 ? 100 : 0;
  const isPositive = diff >= 0;
  const formattedPercent = Number.isFinite(percentChange) ? Math.abs(percentChange).toFixed(1) : "0.0";

  return (
    <View
      style={[
        styles.momCard,
        {
          backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : colors.surfaceSecondary,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.momTitle, { color: colors.secondary }]}>
          Month-over-Month Growth
        </Text>
        <Text style={[styles.momValue, { color: colors.text }]}>
          ₹{current.toLocaleString()}{" "}
          <Text style={{ fontSize: 11, fontWeight: "400", color: colors.secondary }}>
            vs ₹{previous.toLocaleString()} last mo.
          </Text>
        </Text>
      </View>

      <View
        style={[
          styles.badge,
          {
            backgroundColor: isPositive
              ? isDark
                ? "rgba(16, 185, 129, 0.2)"
                : "#DCFCE7"
              : isDark
              ? "rgba(239, 68, 68, 0.2)"
              : "#FEE2E2",
          },
        ]}
      >
        <Ionicons
          name={isPositive ? "trending-up" : "trending-down"}
          size={14}
          color={isPositive ? "#16A34A" : "#DC2626"}
        />
        <Text
          style={[
            styles.badgeText,
            { color: isPositive ? "#15803D" : "#B91C1C" },
          ]}
        >
          {`${isPositive ? "+" : "-"}${formattedPercent}%`}
        </Text>
      </View>
    </View>
  );
}

interface BarChartProps {
  data: { label: string; value: number; color: string }[];
}

export function BarChart({ data }: BarChartProps) {
  const { colors } = useTheme();
  const width = 330;
  const height = 220;
  const paddingLeft = 16;
  const paddingRight = 16;
  const paddingTop = 14;
  const paddingBottom = 34;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const max = Math.max(1, ...data.map((item) => item.value));
  const gap = 12;
  const barWidth = data.length > 0 ? (chartWidth - gap * (data.length - 1)) / data.length : 0;

  return (
    <View style={styles.barChartContainer}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke={colors.border} strokeWidth="1" />
        <Line x1={paddingLeft} y1={paddingTop + chartHeight / 2} x2={width - paddingRight} y2={paddingTop + chartHeight / 2} stroke={colors.border} strokeWidth="1" />
        <Line x1={paddingLeft} y1={paddingTop + chartHeight} x2={width - paddingRight} y2={paddingTop + chartHeight} stroke={colors.border} strokeWidth="1" />
        {data.map((item, index) => {
          const x = paddingLeft + index * (barWidth + gap);
          const h = (item.value / max) * chartHeight;
          const y = paddingTop + chartHeight - h;
          return (
            <G key={`${item.label}-${index}`}>
              <Rect x={x} y={y} width={barWidth} height={Math.max(2, h)} rx="7" fill={item.color} />
              <SvgText x={x + barWidth / 2} y={Math.max(12, y - 7)} textAnchor="middle" fontSize="10" fontWeight="700" fill={colors.text}>
                {item.value}
              </SvgText>
              <SvgText x={x + barWidth / 2} y={height - 10} textAnchor="middle" fontSize="9" fill={colors.secondary}>
                {item.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

interface HorizontalBarsProps {
  data: { label: string; value: number; color: string }[];
}

export function HorizontalBars({ data }: HorizontalBarsProps) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <View style={{ gap: 14 }}>
      {data.map((item) => (
        <View key={item.label}>
          <View style={styles.horizontalBarHeader}>
            <Text style={[styles.horizontalBarLabel, { color: colors.secondary }]}>{item.label}</Text>
            <Text style={[styles.horizontalBarValue, { color: colors.text }]}>{item.value}</Text>
          </View>
          <View style={[styles.horizontalTrack, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={[styles.horizontalFill, { width: `${(item.value / max) * 100}%`, backgroundColor: item.color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chartBlock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  legendList: { flex: 1, marginLeft: 13, gap: 9 },
  legendRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  legendLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 9, marginRight: 7 },
  legendLabel: { fontSize: 12, flexShrink: 1 },
  legendValue: { fontSize: 13, fontWeight: "800" },
  barChartContainer: { marginTop: 12, alignItems: "center" },
  horizontalBarHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  horizontalBarLabel: { fontSize: 12 },
  horizontalBarValue: { fontSize: 12, fontWeight: "800" },
  horizontalTrack: { height: 10, borderRadius: 99, overflow: "hidden" },
  horizontalFill: { height: "100%", borderRadius: 99 },
  trendContainer: { marginTop: 10, alignItems: "center" },
  trendLegend: { flexDirection: "row", gap: 16, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendBox: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, fontWeight: "600" },
  gaugeContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  gaugeDetails: { fontSize: 12, marginTop: 4 },
  momCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  momTitle: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  momValue: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: { fontSize: 12, fontWeight: "800" },
});
