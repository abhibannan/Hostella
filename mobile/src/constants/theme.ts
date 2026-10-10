// â”€â”€ THEME PRESETS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The user can try each theme one by one to pick the best fit.
// Presets: "royal_indigo" | "oceanic_cobalt" | "sunset_coral" | "electric_violet"
export type ThemePresetName =
  | "royal_indigo"     // Preset 1: Royal Sapphire / Electric Indigo (Linear / Stripe SaaS style)
  | "oceanic_cobalt"    // Preset 2: Deep Oceanic Cobalt (Booking / Sonder corporate trust style)
  | "sunset_coral"      // Preset 3: Modern Sunset Coral (Airbnb / Boutique hospitality style)
  | "electric_violet"   // Preset 4: Royal Violet / Iris (Exclusive luxury studio style)
  | "amber_bronze"      // Preset 5: Scandinavian Warm Amber & Bronze
  | "monochrome_slate"  // Preset 6: Minimalist Obsidian & Apple Slate
  | "pacific_azure"     // Preset 7: Pacific Azure & Glacier Blue (Revolut / Modern Fintech travel style)
  | "bordeaux_luxury"   // Preset 8: Bordeaux Wine & Warm Oyster (5-Star Soho House & Luxury Co-Living)
  | "cyber_neon";       // Preset 9: Cyberpunk Midnight & Electric Neon Iris

export const ACTIVE_PRESET: ThemePresetName = "royal_indigo";

export const THEME_PRESETS: Record<
  ThemePresetName,
  {
    name: string;
    description: string;
    light: {
      primary: string;
      primaryDark: string;
      primaryLight: string;
      background: string;
      card: string;
      surfaceSecondary: string;
      text: string;
      secondary: string;
      border: string;
      success: string;
      successLight: string;
      danger: string;
      dangerLight: string;
      warning: string;
      warningLight: string;
      purple: string;
      purpleLight: string;
      orange: string;
      orangeLight: string;
      grayFill: string;
      muted: string;
    };
    dark: {
      primary: string;
      primaryDark: string;
      primaryLight: string;
      background: string;
      card: string;
      surfaceSecondary: string;
      text: string;
      secondary: string;
      border: string;
      success: string;
      successLight: string;
      danger: string;
      dangerLight: string;
      warning: string;
      warningLight: string;
      purple: string;
      purpleLight: string;
      orange: string;
      orangeLight: string;
      grayFill: string;
      muted: string;
    };
  }
> = {
  royal_indigo: {
    name: "Theme 1: Royal Navy & Crisp Sapphire",
    description: "Executive hospitality aesthetic matching Hostella mockup with deep navy hero and porcelain canvas.",
    light: {
      primary: "#3B5BFF",
      primaryDark: "#2744D6",
      primaryLight: "#EEF2FF",
      background: "#F4F7FC",
      card: "#FFFFFF",
      surfaceSecondary: "#F8FAFD",
      text: "#0F172A",
      secondary: "#64748B",
      border: "#E5EDF6",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F1F5F9",
    },
    dark: {
      primary: "#6366F1",
      primaryDark: "#818CF8",
      primaryLight: "rgba(99, 102, 241, 0.16)",
      background: "#090D16",
      card: "#131B2E",
      surfaceSecondary: "#1A253C",
      text: "#F8FAFC",
      secondary: "#94A3B8",
      border: "#24334F",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#1A253C",
      muted: "#131B2E",
    },
  },

  oceanic_cobalt: {
    name: "Theme 2: Deep Oceanic Cobalt & Ice",
    description: "Corporate, authoritative hospitality trust (Booking / Sonder). Crisp blue with cool ice canvas.",
    light: {
      primary: "#2563EB",
      primaryDark: "#1D4ED8",
      primaryLight: "#EFF6FF",
      background: "#F0F4F8",
      card: "#FFFFFF",
      surfaceSecondary: "#F8FAFC",
      text: "#0F172A",
      secondary: "#64748B",
      border: "#E2E8F0",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F0F4F8",
    },
    dark: {
      primary: "#3B82F6",
      primaryDark: "#60A5FA",
      primaryLight: "rgba(59, 130, 246, 0.16)",
      background: "#080E1A",
      card: "#111C30",
      surfaceSecondary: "#172642",
      text: "#F8FAFC",
      secondary: "#94A3B8",
      border: "#1E3356",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#172642",
      muted: "#111C30",
    },
  },

  sunset_coral: {
    name: "Theme 3: Modern Sunset Coral & Warm Linen",
    description: "Warm, welcoming boutique hospitality (Airbnb co-living). Vibrant rose/coral with warm canvas.",
    light: {
      primary: "#E11D48",
      primaryDark: "#BE123C",
      primaryLight: "#FFE4E6",
      background: "#F8FAFC",
      card: "#FFFFFF",
      surfaceSecondary: "#FFF1F2",
      text: "#0F172A",
      secondary: "#64748B",
      border: "#E2E8F0",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F8FAFC",
    },
    dark: {
      primary: "#FB7185",
      primaryDark: "#F43F5E",
      primaryLight: "rgba(251, 113, 133, 0.16)",
      background: "#130A0D",
      card: "#211219",
      surfaceSecondary: "#2E1A23",
      text: "#F8FAFC",
      secondary: "#94A3B8",
      border: "#3F222F",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#2E1A23",
      muted: "#211219",
    },
  },

  electric_violet: {
    name: "Theme 4: Royal Violet & Studio Iris",
    description: "High-end luxury residence & designer co-living. Royal violet with sleek architectural canvas.",
    light: {
      primary: "#7C3AED",
      primaryDark: "#6D28D9",
      primaryLight: "#F5F3FF",
      background: "#F3F4F8",
      card: "#FFFFFF",
      surfaceSecondary: "#FAF5FF",
      text: "#0F172A",
      secondary: "#64748B",
      border: "#E2E8F0",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#7C3AED",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F3F4F8",
    },
    dark: {
      primary: "#A78BFA",
      primaryDark: "#8B5CF6",
      primaryLight: "rgba(167, 139, 250, 0.16)",
      background: "#0D0A14",
      card: "#191428",
      surfaceSecondary: "#231B38",
      text: "#F8FAFC",
      secondary: "#94A3B8",
      border: "#332752",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#231B38",
      muted: "#191428",
    },
  },

  amber_bronze: {
    name: "Theme 5: Scandinavian Warm Amber & Bronze",
    description: "Nordic warm architectural aesthetic. Rich amber/bronze with crisp warm paper canvas.",
    light: {
      primary: "#D97706",
      primaryDark: "#B45309",
      primaryLight: "#FEF3C7",
      background: "#F9FAFB",
      card: "#FFFFFF",
      surfaceSecondary: "#FFFBEB",
      text: "#0F172A",
      secondary: "#64748B",
      border: "#E2E8F0",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F9FAFB",
    },
    dark: {
      primary: "#FBBF24",
      primaryDark: "#F59E0B",
      primaryLight: "rgba(251, 191, 36, 0.16)",
      background: "#120F08",
      card: "#1E1A11",
      surfaceSecondary: "#2A2315",
      text: "#F8FAFC",
      secondary: "#94A3B8",
      border: "#3D3422",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#2A2315",
      muted: "#1E1A11",
    },
  },

  monochrome_slate: {
    name: "Theme 6: Minimalist Obsidian & Apple Slate",
    description: "Ultra-sleek monochrome design. Pure architectural charcoal and pristine white elevation.",
    light: {
      primary: "#0F172A",
      primaryDark: "#020617",
      primaryLight: "#F1F5F9",
      background: "#F8FAFC",
      card: "#FFFFFF",
      surfaceSecondary: "#F1F5F9",
      text: "#0F172A",
      secondary: "#64748B",
      border: "#CBD5E1",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F8FAFC",
    },
    dark: {
      primary: "#F8FAFC",
      primaryDark: "#E2E8F0",
      primaryLight: "rgba(248, 250, 252, 0.16)",
      background: "#05070B",
      card: "#0E131F",
      surfaceSecondary: "#161D2E",
      text: "#F8FAFC",
      secondary: "#94A3B8",
      border: "#28354D",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#161D2E",
      muted: "#0E131F",
    },
  },

  pacific_azure: {
    name: "Theme 7: Pacific Azure & Glacier Blue",
    description: "Vibrant, ultra-refreshing electric sky & glacier palette (Revolut / N26 style).",
    light: {
      primary: "#0284C7",
      primaryDark: "#0369A1",
      primaryLight: "#E0F2FE",
      background: "#F0F6FA",
      card: "#FFFFFF",
      surfaceSecondary: "#F0F9FF",
      text: "#0F172A",
      secondary: "#64748B",
      border: "#E2E8F0",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F0F6FA",
    },
    dark: {
      primary: "#38BDF8",
      primaryDark: "#0EA5E9",
      primaryLight: "rgba(56, 189, 248, 0.16)",
      background: "#070E18",
      card: "#0E1A2C",
      surfaceSecondary: "#14253E",
      text: "#F8FAFC",
      secondary: "#94A3B8",
      border: "#1D3455",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#14253E",
      muted: "#0E1A2C",
    },
  },

  bordeaux_luxury: {
    name: "Theme 8: Bordeaux Wine & Warm Oyster (Soho House Luxury)",
    description: "Quiet luxury, boutique editorial hotel & exclusive residential aesthetic.",
    light: {
      primary: "#9F1239",
      primaryDark: "#881337",
      primaryLight: "#FFE4E6",
      background: "#FAF7F5",
      card: "#FFFFFF",
      surfaceSecondary: "#F5EFEB",
      text: "#1C1917",
      secondary: "#78716C",
      border: "#E7E0D8",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#D97706",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#EA580C",
      orangeLight: "#FFF7ED",
      grayFill: "#E7E0D8",
      muted: "#FAF7F5",
    },
    dark: {
      primary: "#FB7185",
      primaryDark: "#F43F5E",
      primaryLight: "rgba(251, 113, 133, 0.16)",
      background: "#140A0E",
      card: "#221218",
      surfaceSecondary: "#2F1922",
      text: "#FBF9F7",
      secondary: "#A8A29E",
      border: "#42202E",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#2F1922",
      muted: "#221218",
    },
  },

  cyber_neon: {
    name: "Theme 9: Cyberpunk Midnight & Electric Iris",
    description: "Neo-futuristic high contrast with electric iris accents against pitch deep space.",
    light: {
      primary: "#6366F1",
      primaryDark: "#4F46E5",
      primaryLight: "#EEF2FF",
      background: "#F4F6FC",
      card: "#FFFFFF",
      surfaceSecondary: "#EDF2FF",
      text: "#0B0F19",
      secondary: "#64748B",
      border: "#CBD5E1",
      success: "#10B981",
      successLight: "#ECFDF5",
      danger: "#EF4444",
      dangerLight: "#FEF2F2",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      purple: "#8B5CF6",
      purpleLight: "#F5F3FF",
      orange: "#F97316",
      orangeLight: "#FFF7ED",
      grayFill: "#E2E8F0",
      muted: "#F4F6FC",
    },
    dark: {
      primary: "#818CF8",
      primaryDark: "#6366F1",
      primaryLight: "rgba(129, 140, 248, 0.18)",
      background: "#060911",
      card: "#0D1322",
      surfaceSecondary: "#141D33",
      text: "#FFFFFF",
      secondary: "#94A3B8",
      border: "#1E2C4B",
      success: "#22C55E",
      successLight: "rgba(34, 197, 94, 0.16)",
      danger: "#F43F5E",
      dangerLight: "rgba(244, 63, 94, 0.16)",
      warning: "#FBBF24",
      warningLight: "rgba(251, 191, 36, 0.16)",
      purple: "#A78BFA",
      purpleLight: "rgba(167, 139, 250, 0.16)",
      orange: "#FB923C",
      orangeLight: "rgba(251, 146, 60, 0.16)",
      grayFill: "#141D33",
      muted: "#0D1322",
    },
  },
};

export const LIGHT_COLORS = THEME_PRESETS[ACTIVE_PRESET].light;
export const DARK_COLORS = THEME_PRESETS[ACTIVE_PRESET].dark;

export type ThemeColors = typeof LIGHT_COLORS;
export type ThemeMode = "light" | "dark" | "system";

export const COLORS: ThemeColors = { ...LIGHT_COLORS };

export function applyTheme(mode: ThemeMode, systemColorScheme?: string | null) {
  const effectiveDark = mode === "dark" || (mode === "system" && systemColorScheme === "dark");
  Object.assign(COLORS, effectiveDark ? DARK_COLORS : LIGHT_COLORS);
}

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 9999,
};
export const GOLD = "#F59E0B";
export const GRADIENTS = {
  primary: ["#3B5BFF", "#4F46E5"] as const,
  success: ["#22C55E", "#16A34A"] as const,
  warning: ["#F59E0B", "#D97706"] as const,
  danger: ["#EF4444", "#DC2626"] as const,
  brand: ["#3B5BFF", "#6366F1"] as const,
  hero: ["#0A1333", "#122566", "#1E3A8A"] as const,
  heroDark: ["#050B1E", "#0B163B", "#132357"] as const,
};
export const shadow = (elevation: number, isDark: boolean = false) => ({
  shadowColor: isDark ? "#000" : "#64748B",
  shadowOffset: { width: 0, height: elevation },
  shadowOpacity: isDark ? 0.4 : 0.1,
  shadowRadius: elevation * 1.5,
  elevation
});
