import type { KeyLegendItem, SummaryRowProps } from "@purosur/ui";
import { Eyebrow, formatClockTime, KeyLegend, NoticeTile, SummaryRowGroup } from "@purosur/ui";
import { Laptop } from "lucide-react";
import { useState } from "react";
import { fiscalModeText } from "../fiscal/fiscal-mode-text";
import { cloudStanding } from "../shell/cloud-standing";
import type { RegisterNotice } from "../shell/register-notices";
import { registerNotices } from "../shell/register-notices";
import { useRegisterStatusData } from "../shell/register-status-context";
import type { SettingsChrome } from "./settings-page";
import { SettingsPage, sectionArrows } from "./settings-page";
import { SettingsPanel } from "./settings-panel";

type FocusSide = "list" | "notices";

function tileOf({ id: _id, discardable: _discardable, ...tile }: RegisterNotice) {
  return tile;
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
  const onNotices = side === "notices" && notices.length > 0;
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
    sectionArrows((pressed) => (onNotices ? moveNotice(pressed) : chrome.moveSection(pressed))),
    {
      key: "ArrowLeftRight" as const,
      label: "Lista",
      run: () => setSide(onNotices ? "list" : "notices"),
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
  const [firstRow, ...otherRows] = [
    ...(status === undefined ? [] : [{ label: "Nube", value: cloudStanding(status.cloud).text }]),
    ...(cash?.status === "open"
      ? [{ label: "Sesión", value: `Sesión abierta ${formatClockTime(cash.openedAt)}` }]
      : []),
    ...(cash?.status === "none" ? [{ label: "Sesión", value: "Sin sesión abierta" }] : []),
    ...(version === null ? [] : [{ label: "Versión", value: version }]),
    ...(contingency === null
      ? []
      : [{ label: "Facturación", value: fiscalModeText(contingency.kind) }]),
  ].map((row): SummaryRowProps => ({ ...row, detail: true }));

  return (
    <SettingsPage
      chrome={chrome}
      bindings={bindings}
      aside={
        <SettingsPanel
          icon={<Laptop />}
          title="Esta caja"
          onClose={onClose}
          footer={notices.length > 0 ? <KeyLegend items={panelLegend} /> : undefined}
        >
          {firstRow === undefined ? null : (
            <SummaryRowGroup variant="plain" rows={[firstRow, ...otherRows]} />
          )}
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
