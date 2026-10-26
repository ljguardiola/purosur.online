import type { ContingencyBackupTicketRescueResponse } from "@purosur/contracts";
import {
  dataColumn,
  FloatingNotification,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { useMutation } from "@tanstack/react-query";
import { Check, QrCode, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useContingencyTicketRecoveriesQuery, useRefreshBackups } from "./backups-queries";
import {
  type ContingencyTicketRecovery,
  fetchContingencyTicketRecoveries,
} from "./contingency-ticket-recovery-api";
import type { RescueContingencyBackupTicketOutcome } from "./contingency-ticket-rescue-api";
import type { ContingencyTicketRescueScreenServices } from "./contingency-ticket-rescue-services";
import {
  type FinishedRecoveryOutcome,
  FinishTicketRecoveryModal,
} from "./finish-ticket-recovery-modal";
import {
  REFUSED_TICKET_STATUS,
  REFUSED_TICKET_TITLE,
  rescuedTicketTitle,
  rescuedTicketTotalText,
  rescuedTicketVouchersText,
} from "./rescued-ticket-text";
import { TicketRecoveriesSection } from "./ticket-recoveries-section";
import { NO_PENDING_TICKETS, scanTicketCode } from "./ticket-scan";
import { TicketScanPanel } from "./ticket-scan-panel";

type Rescued = Extract<ContingencyBackupTicketRescueResponse, { outcome: "rescued" }>;
type Refused = Exclude<ContingencyBackupTicketRescueResponse, Rescued>;

type ScannedTicketResult =
  | { kind: "verifying" }
  | { kind: "rescued"; rescued: Rescued }
  | { kind: "refused"; outcome: Refused["outcome"] }
  | { kind: "send_failed" };

type ScannedTicket = { id: number; result: ScannedTicketResult };

type RecoveryNotice = {
  id: number;
  tone: "success" | "error";
  title: string;
  description: string;
};

function finishedNotice(
  outcome: FinishedRecoveryOutcome,
  registerName: string,
): Omit<RecoveryNotice, "id"> {
  if (outcome === "finished") {
    return {
      tone: "success",
      title: `Rescate de ${registerName} terminado`,
      description: "Los tickets que se escaneen ahora ya no llegan a esa caja.",
    };
  }
  return outcome === "already_finished"
    ? {
        tone: "success",
        title: `El rescate de ${registerName} ya estaba terminado`,
        description: "La lista ya está actualizada.",
      }
    : {
        tone: "error",
        title: `No se encontró el rescate de ${registerName}`,
        description: "La lista ya está actualizada.",
      };
}

export type ContingencyTicketRescueScreenProps = {
  onSessionEnded: () => void;
  services: ContingencyTicketRescueScreenServices;
};

function resultOf(response: ContingencyBackupTicketRescueResponse): ScannedTicketResult {
  return response.outcome === "rescued"
    ? { kind: "rescued", rescued: response }
    : { kind: "refused", outcome: response.outcome };
}

function ticketCell({ result }: ScannedTicket) {
  if (result.kind === "rescued") {
    const vouchers = rescuedTicketVouchersText(result.rescued.summary);
    return (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-body text-text">
          {rescuedTicketTitle(result.rescued.summary)}
        </span>
        {vouchers === undefined ? null : (
          <span className="text-detail text-text-subtle">{vouchers}</span>
        )}
      </div>
    );
  }
  const title =
    result.kind === "refused"
      ? REFUSED_TICKET_TITLE[result.outcome]
      : result.kind === "send_failed"
        ? "No se pudo enviar el ticket"
        : "Ticket leído";
  return <span className="font-semibold text-body text-text">{title}</span>;
}

function resultCell({ result }: ScannedTicket) {
  if (result.kind === "verifying") {
    return (
      <StatusIndicator tone="neutral" busy>
        Verificando
      </StatusIndicator>
    );
  }
  if (result.kind === "rescued") {
    return result.rescued.received === 0 ? (
      <StatusIndicator tone="info">Ya estaba recuperado</StatusIndicator>
    ) : (
      <StatusIndicator tone="success">Verificado y recuperado</StatusIndicator>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusIndicator tone="error">
        {result.kind === "send_failed"
          ? "No se pudo verificar"
          : REFUSED_TICKET_STATUS[result.outcome]}
      </StatusIndicator>
      <span className="text-detail text-text-subtle">
        {result.kind === "send_failed" ? "Mostralo de nuevo" : "No se recuperó nada"}
      </span>
    </div>
  );
}

export function ContingencyTicketRescueScreen({
  onSessionEnded,
  services,
}: ContingencyTicketRescueScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const recoveries = useContingencyTicketRecoveriesQuery({
    fetchContingencyTicketRecoveries:
      services.fetchContingencyTicketRecoveries ?? fetchContingencyTicketRecoveries,
    onSessionEnded,
  });
  const refreshBackups = useRefreshBackups();
  const [finishTarget, setFinishTarget] = useState<ContingencyTicketRecovery | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<RecoveryNotice | null>(null);
  const lastNoticeId = useRef(0);
  const rescue = useMutation({
    mutationFn: (qrCodes: string[]) => services.rescueContingencyBackupTicket(qrCodes),
  });
  const [pending, setPending] = useState(NO_PENDING_TICKETS);
  const [progress, setProgress] = useState<{ read: number; of: number } | null>(null);
  const [tickets, setTickets] = useState<ScannedTicket[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [inFlight, setInFlight] = useState<string[]>([]);

  function settle(id: number, key: string, outcome: RescueContingencyBackupTicketOutcome) {
    const result: ScannedTicketResult =
      outcome.kind === "ok" ? resultOf(outcome.value) : { kind: "send_failed" };
    setTickets((current) => current.map((ticket) => (ticket.id === id ? { id, result } : ticket)));
    setInFlight((current) => current.filter((sent) => sent !== key));
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    }
  }

  function send(qrCodes: string[]) {
    const key = qrCodes.join("\n");
    if (inFlight.includes(key)) {
      return;
    }
    const id = sentCount;
    setSentCount(id + 1);
    setInFlight((current) => [...current, key]);
    setTickets((current) => [{ id, result: { kind: "verifying" } }, ...current]);
    rescue.mutateAsync(qrCodes).then(
      (outcome) => settle(id, key, outcome),
      () => settle(id, key, { kind: "failed" }),
    );
  }

  function handleCode(text: string) {
    const step = scanTicketCode(pending, text);
    if (step.kind === "already_read") {
      return;
    }
    if (step.kind === "unreadable") {
      const id = sentCount;
      setSentCount(id + 1);
      setTickets((current) => [
        { id, result: { kind: "refused", outcome: "unreadable" } },
        ...current,
      ]);
      return;
    }
    setPending(step.pending);
    if (step.kind === "waiting") {
      setProgress({ read: step.read, of: step.of });
      return;
    }
    setProgress(null);
    send(step.qrCodes);
  }

  const columns = [
    dataColumn({ id: "ticket", header: "Ticket", render: ticketCell }),
    dataColumn({
      id: "register",
      header: "Caja",
      width: 120,
      render: ({ result }: ScannedTicket) => (
        <span className="text-detail text-text">
          {result.kind === "rescued" ? result.rescued.register_name : "—"}
        </span>
      ),
    }),
    dataColumn({
      id: "total",
      header: "Total",
      align: "end",
      width: 140,
      render: ({ result }: ScannedTicket) => (
        <span className="font-semibold text-body text-text">
          {result.kind === "rescued" ? rescuedTicketTotalText(result.rescued.summary) : "—"}
        </span>
      ),
    }),
    dataColumn({ id: "result", header: "Resultado", width: 240, render: resultCell }),
  ] as const;

  const table = useTableModel({
    items: tickets,
    id: (ticket) => String(ticket.id),
    columns,
  });

  function handleFinished(outcome: FinishedRecoveryOutcome) {
    if (finishTarget) {
      lastNoticeId.current += 1;
      setRecoveryNotice({
        id: lastNoticeId.current,
        ...finishedNotice(outcome, finishTarget.register_name),
      });
    }
    setFinishTarget(null);
    void refreshBackups();
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración</p>
              <ScreenTitle>Rescate de tickets</ScreenTitle>
            </div>
          </div>
        }
        bodyClassName="flex-row gap-4 p-6"
      >
        <TicketScanPanel scanner={services.scanner} progress={progress} onCode={handleCode} />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <TicketRecoveriesSection data={recoveries} onFinish={setFinishTarget} />
          <Table
            aria-label="Tickets leídos"
            table={table}
            empty={{
              icon: <QrCode />,
              title: "Todavía no se leyó ningún ticket",
              variant: "blank",
            }}
          />
        </div>
      </ScreenLayout>
      <FinishTicketRecoveryModal
        target={finishTarget}
        onClose={() => setFinishTarget(null)}
        onFinished={handleFinished}
        onSessionEnded={onSessionEnded}
        {...(services.finishTicketRecoveryModal
          ? { services: services.finishTicketRecoveryModal }
          : {})}
      />
      {recoveryNotice ? (
        <FloatingNotification
          key={recoveryNotice.id}
          tone={recoveryNotice.tone}
          icon={recoveryNotice.tone === "success" ? <Check /> : <TriangleAlert />}
          title={recoveryNotice.title}
          description={recoveryNotice.description}
          onDismiss={() => setRecoveryNotice(null)}
        />
      ) : null}
    </>
  );
}
