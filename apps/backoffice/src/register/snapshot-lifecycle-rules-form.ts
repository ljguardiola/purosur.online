import { snapshotLifecycleRulesSchema } from "@purosur/contracts";
import { schemaLimit } from "../platform/schema-limit";
import type { SnapshotLifecycleRules } from "./snapshot-backups-api";

export type SnapshotLifecycleRulesFormValues = {
  hourly: string;
  daily: string;
  monthly: string;
};

export const EMPTY_SNAPSHOT_LIFECYCLE_RULES_FORM: SnapshotLifecycleRulesFormValues = {
  hourly: "",
  daily: "",
  monthly: "",
};

export function snapshotLifecycleRulesFormValuesFrom(
  rules: SnapshotLifecycleRules,
): SnapshotLifecycleRulesFormValues {
  return {
    hourly: String(rules.hourly),
    daily: String(rules.daily),
    monthly: String(rules.monthly),
  };
}

function wholeNumberFrom(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export function snapshotLifecycleRulesRequestFrom(
  values: SnapshotLifecycleRulesFormValues,
): SnapshotLifecycleRules {
  return {
    hourly: wholeNumberFrom(values.hourly),
    daily: wholeNumberFrom(values.daily),
    monthly: wholeNumberFrom(values.monthly),
  };
}

function limitsOf(tier: keyof SnapshotLifecycleRules) {
  const schema = snapshotLifecycleRulesSchema.shape[tier];
  return { min: schemaLimit(schema.minValue), max: schemaLimit(schema.maxValue) };
}

export function snapshotLifecycleRangeHint(tier: keyof SnapshotLifecycleRules): string {
  const { min, max } = limitsOf(tier);
  return `Entre ${min} y ${max}`;
}

function wholeNumberMessage(tier: keyof SnapshotLifecycleRules): () => string {
  return () => {
    const { min, max } = limitsOf(tier);
    return `Ingresá un número entero entre ${min} y ${max}.`;
  };
}

export const SNAPSHOT_LIFECYCLE_RULES_MESSAGES = {
  hourly: wholeNumberMessage("hourly"),
  daily: wholeNumberMessage("daily"),
  monthly: wholeNumberMessage("monthly"),
};
