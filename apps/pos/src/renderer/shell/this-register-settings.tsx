import type { KeyLegendItem } from "@purosur/ui";
import { Eyebrow, formatClockTime, KeyLegend, NoticeTile } from "@purosur/ui";
import { Laptop } from "lucide-react";
import { useState } from "react";
import { fiscalModeText } from "../fiscal/fiscal-mode-text";
import type { SettingsChrome } from "../register/settings-page";
import { SettingsPage, sectionArrows } from "../register/settings-page";
import { SettingsPanel } from "../register/settings-panel";
import { cloudStanding } from "./cloud-standing";
import type { RegisterNotice } from "./register-notices";
import { registerNotices } from "./register-notices";
import { useRegisterStatusData } from "./register-status-context";

type FocusSide = "list" | "notices";

function tileOf({ id: _id, discardable: _discardable, ...tile }: RegisterNotice) {
  return tile;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-detail text-text-subtle">{label}</dt>
      <dd className="text-detail text-text">{value}</dd>
    </div>
  );
}

export function ThisRegisterSettings({
  chrome,
  onClose,
  version,
}: {
  chrome: SettingsChrome;
  onClose: () => void;
  version: string | null;
}) {
  const data = useRegisterStatusData();
  const status = data?.status.status === "loaded" ? data.status.value : undefined;
  const backupTickets =
    data?.backupTickets.status === "loaded" ? data.backupTickets.value : undefined;
  const notices = registerNotices({
    conditions: status?.conditions ?? [],
    contingency: status?.contingency ?? null,
    backupTickets,
  });
  const [side, setSide] = useState<FocusSide>("list");
  const [focusedId, setFocusedId] = useState<string>();
  const focusedAt = Math.max(
    0,
    notices.findIndex((notice) => notice.id === focusedId),
  );
  const focused = notices[focusedAt];
  const canDiscard = focused?.discardable === true;

  function moveNotice(pressed: string) {
    const next = notices[pressed === "ArrowUp" ? focusedAt - 1 : focusedAt + 1];
    if (next !== undefined) {
      setFocusedId(next.id);
    }
  }

  function discard() {
    data?.onDiscardBackupTickets();
  }

  const bindings = [
    sectionArrows((pressed) =>
      side === "list" ? chrome.moveSection(pressed) : moveNotice(pressed),
    ),
    {
      key: "ArrowLeftRight" as const,
      label: "Lista",
      run: () => setSide(side === "list" ? "notices" : "list"),
      enabled: notices.length > 0,
      whileTyping: true,
    },
    { key: "Delete" as const, run: discard, enabled: canDiscard },
  ];
  const panelLegend: KeyLegendItem[] = [
    { keyName: "ArrowUpDown", label: "Aviso" },
    { keyName: "ArrowLeftRight", label: "Lista" },
    ...(canDiscard ? [{ keyName: "Delete" as const, label: "Descartar" }] : []),
  ];
  const cash = data?.cashSession;
  const contingency = status?.contingency ?? null;

  return (
    <SettingsPage
      chrome={chrome}
      bindings={bindings}
      aside={
        <SettingsPanel
          icon={<Laptop />}
          title="Esta caja"
          onClose={onClose}
          footer={
            notices.length > 0 ? (
              <div className="-mx-6 -mb-6 border-t border-border bg-surface-subtle px-6 py-3">
                <KeyLegend items={panelLegend} />
              </div>
            ) : undefined
          }
        >
          <dl className="flex flex-col gap-1.5">
            {status === undefined ? null : (
              <Row label="Nube" value={cloudStanding(status.cloud).text} />
            )}
            {cash?.status === "open" ? (
              <Row label="Sesión" value={`Sesión abierta ${formatClockTime(cash.openedAt)}`} />
            ) : null}
            {cash?.status === "none" ? <Row label="Sesión" value="Sin sesión abierta" /> : null}
            {version === null ? null : <Row label="Versión" value={version} />}
            {contingency === null ? null : (
              <Row label="Facturación" value={fiscalModeText(contingency.kind)} />
            )}
          </dl>
          {notices.length === 0 ? null : (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <Eyebrow text="AVISOS DE ESTA CAJA" />
              <ul aria-label="Avisos de esta caja" className="flex flex-col gap-2">
                {notices.map((notice) => (
                  <li key={notice.id}>
                    <NoticeTile {...tileOf(notice)} focused={notice.id === focused?.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SettingsPanel>
      }
    />
  );
}
