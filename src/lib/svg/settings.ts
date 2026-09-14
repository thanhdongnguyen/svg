import type { ConversionSettings, Quality } from "../../types/conversion";

export const PRESETS: Record<Quality, { colors: number; tolerance: number; omit: number }> = {
  fast: { colors: 12, tolerance: 2, omit: 16 },
  balanced: { colors: 32, tolerance: 1, omit: 8 },
  maximum: { colors: 64, tolerance: 0.35, omit: 4 },
};
export const DEFAULT_SETTINGS: ConversionSettings = { quality: "balanced", mode: "color", colors: 32, threshold: 128 };

