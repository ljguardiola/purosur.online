export const WEIGHT_SOURCES = ["SCALE", "MANUAL"] as const;

export type WeightSource = (typeof WEIGHT_SOURCES)[number];
