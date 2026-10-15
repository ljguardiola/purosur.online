import { snapshotBackupsSchema } from "@purosur/contracts";
import { formatDate, plural } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";
import type { SnapshotBackupGeneration, SnapshotLifecycleRules } from "./snapshot-backups-api";

const GENERATION_TIME_ZONE = schemaText(
  snapshotBackupsSchema.shape.generations.element.shape.created_at.meta()?.["timeZone"],
);

export function snapshotGenerationDate(instant: string): string {
  const moment = new Date(instant);
  const day = formatDate(moment, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: GENERATION_TIME_ZONE,
  });
  const clock = formatDate(moment, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: GENERATION_TIME_ZONE,
  });
  return `${day} ${clock}`;
}

export function snapshotTierCaptions(rules: SnapshotLifecycleRules) {
  return {
    hourly: plural(rules.hourly, { one: "Última hora", other: `Últimas ${rules.hourly} horas` }),
    daily: plural(rules.daily, { one: "Último día", other: `Últimos ${rules.daily} días` }),
    monthly: plural(rules.monthly, { one: "Hasta 1 mes", other: `Hasta ${rules.monthly} meses` }),
  };
}

export function snapshotRecentCaption(limit: number): string {
  return plural(limit, { one: "La más nueva", other: `Las ${limit} más nuevas` });
}

export const SNAPSHOT_LOCATION_TEXT: Record<SnapshotBackupGeneration["location"], string> = {
  disk_and_bucket: "Disco y bucket",
  bucket: "Solo bucket",
  disk: "Solo disco",
  nowhere: "En ningún lado",
};
