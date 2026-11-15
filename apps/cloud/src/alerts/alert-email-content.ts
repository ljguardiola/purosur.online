import { type AlertEmailStage, type AlertLevel, ARGENTINA_TIME_ZONE } from "@purosur/domain";
import type { AlertEmail } from "@purosur/domain/alerts/use-cases";
import { formatDayAndTime } from "@purosur/formatting";
import { alertEmailKindTexts } from "./alert-email-kind-texts.js";

export interface AlertEmailContent {
  subject: string;
  text: string;
  html: string;
}

const SUBJECT_PREFIXES: Record<AlertEmailStage, string> = {
  opened: "Alerta abierta",
  escalated: "Alerta escalada a crítica",
  resolved: "Alerta resuelta",
};

const OCCURRED_WORDS: Record<AlertEmailStage, string> = {
  opened: "Abierta el",
  escalated: "Escalada el",
  resolved: "Resuelta el",
};

const LEVEL_NAMES: Record<AlertLevel, string> = {
  informational: "Informativa",
  warning: "Advertencia",
  critical: "Crítica",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function alertEmailContent(email: AlertEmail, backofficeOrigin: string): AlertEmailContent {
  const texts = alertEmailKindTexts(email.kind);
  const facts = [
    `Nivel: ${LEVEL_NAMES[email.level]}`,
    ...(email.branchName === null ? [] : [`Sucursal: ${email.branchName}`]),
    `${OCCURRED_WORDS[email.stage]} ${formatDayAndTime(email.occurredAt.toISOString(), ARGENTINA_TIME_ZONE)}`,
  ];
  const link = `${backofficeOrigin}/?alert=${email.alertId}`;
  return {
    subject: `${SUBJECT_PREFIXES[email.stage]}: ${texts.label}${
      email.branchName === null ? "" : ` — ${email.branchName}`
    }`,
    text: [texts.description, "", ...facts, "", `Ver la alerta: ${link}`].join("\n"),
    html:
      `<p>${escapeHtml(texts.description)}</p>` +
      `<p>${facts.map(escapeHtml).join("<br>")}</p>` +
      `<p>Ver la alerta: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
  };
}
