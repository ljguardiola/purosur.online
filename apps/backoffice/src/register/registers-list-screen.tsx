import {
  Button,
  InlineNotice,
  Modal,
  plural,
  Table,
  TableCellText,
  Tag,
  tableRows,
} from "@purosur/ui";
import { Check, KeySquare, Laptop, Plus, RotateCcw, ShieldX, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAuthorization } from "../access/authorization-modal";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { cloudTableState } from "../platform/cloud-table-state";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { groupedCode, minutesElapsed, minutesRemaining } from "./enrollment-code";
import { NewRegisterModal } from "./new-register-modal";
import { useRefreshRegisters, useRegistersQuery } from "./register-queries";
import type { EmitEnrollmentCodeOutcome, RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";

export type RegistersListScreenProps = {
  onSessionEnded: () => void;
  now?: () => Date;
  services: RegistersListScreenServices;
};

const NO_REGISTERS: RegisterSummary[] = [];

const PENDING_CODE_REFRESH_MS = 30_000;

type EmissionState =
  | { kind: "closed" }
  | { kind: "issuing"; register: RegisterSummary }
  | { kind: "attemptFailed"; register: RegisterSummary }
  | { kind: "rateLimited"; register: RegisterSummary; retryAfterSeconds: number }
  | { kind: "issued"; register: RegisterSummary; code: string };

type EnrollmentCodeModalProps = {
  emission: EmissionState;
  onClose: () => void;
  onDone: () => void;
  onRetry: (register: RegisterSummary) => void;
};

// Purely presentational: the click handler in RegistersListScreen starts the emission, never an
// effect here, so React Strict Mode's extra render (or a remount) can't refire the request.
function EnrollmentCodeModal({ emission, onClose, onDone, onRetry }: EnrollmentCodeModalProps) {
  const open = emission.kind !== "closed";
  const isIssued = emission.kind === "issued";

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<KeySquare />}
      {...(emission.kind !== "closed" ? { context: emission.register.name } : {})}
      title="Código de alta"
      // An emission in flight can't be dismissed: the cloud may already have replaced the
      // register's pending code, and only this response carries the new one.
      closable={emission.kind !== "issuing"}
      footer={
        <Button
          variant="primary"
          size="large"
          icon={<Check />}
          fullWidth
          disabled={!isIssued}
          onPress={onDone}
        >
          Listo
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {emission.kind === "issuing" && <p role="status">Emitiendo el código…</p>}
        {emission.kind === "attemptFailed" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo emitir el código"
              description="Probá de nuevo."
            />
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              onPress={() => onRetry(emission.register)}
            >
              Reintentar
            </Button>
          </>
        )}
        {emission.kind === "rateLimited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(emission.retryAfterSeconds)}
            />
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              onPress={() => onRetry(emission.register)}
            >
              Reintentar
            </Button>
          </>
        )}
        {emission.kind === "issued" && (
          <>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-subtle p-4">
              <p className="text-title text-text-accent tracking-md">
                {groupedCode(emission.code)}
              </p>
              <p className="text-text-subtle text-detail">
                Vence en 15 minutos · se usa una sola vez
              </p>
            </div>
            <p className="text-body text-text">
              En la notebook nueva, al abrir la caja por primera vez, se escribe este código.
              Después de 5 intentos equivocados deja de servir y hay que emitir otro.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

export function RegistersListScreen({ onSessionEnded, now, services }: RegistersListScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchRegisters,
    emitEnrollmentCode,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const clock = now ?? (() => new Date());
  const data = useRegistersQuery({ fetchRegisters, onSessionEnded });
  const refreshRegisters = useRefreshRegisters();
  const [currentTime, setCurrentTime] = useState(() => clock());
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [emission, setEmission] = useState<EmissionState>({ kind: "closed" });
  const { run: runEmission, modal: emissionAuthModal } =
    useAuthorization<EmitEnrollmentCodeOutcome>({
      actionName: "Emitir un código de alta",
      onSessionEnded,
      services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
    });
  const readClock = useEffectEvent(clock);
  const latestEmission = useRef(0);

  const listSettled = data.status === "loaded" && !data.refreshing;
  useEffect(() => {
    if (listSettled) {
      setCurrentTime(readClock());
    }
  }, [listSettled]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setCurrentTime(readClock()),
      PENDING_CODE_REFRESH_MS,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  // Guards a second Enter/Space activation before the first request settles (the modal backdrop
  // blocks other rows).
  async function handleEmitClick(register: RegisterSummary) {
    if (emission.kind === "issuing") {
      return;
    }
    latestEmission.current += 1;
    const thisEmission = latestEmission.current;
    setEmission({ kind: "issuing", register });

    const outcome = await runEmission(() => emitEnrollmentCode(register.id));
    if (thisEmission !== latestEmission.current) {
      return;
    }
    // The attempt always reaches the server before "cancelled" can resolve (only
    // `authorization_required` opens the modal that cancel dismisses), so reload every time.
    if (outcome.kind === "cancelled") {
      setEmission({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "ok") {
      setEmission({ kind: "issued", register, code: outcome.value.code });
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "not_found") {
      setEmission({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setEmission({ kind: "rateLimited", register, retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setEmission({ kind: "attemptFailed", register });
  }

  // Reloads after every outcome, not just an issued code: a failure seen here (a dropped
  // connection, an unreadable 200) may still follow a code the cloud already committed.
  function closeEmission() {
    latestEmission.current += 1;
    setEmission({ kind: "closed" });
    void refreshRegisters();
  }

  const registers = data.status === "loaded" ? data.value : NO_REGISTERS;

  const columns = [
    {
      key: "register",
      header: "Caja",
      render: (item: RegisterSummary) => (
        <TableCellText description="Sin instalación">{item.name}</TableCellText>
      ),
    },
    {
      key: "installation",
      header: "Instalación",
      render: (item: RegisterSummary) => {
        const now = currentTime;
        const pendingCode =
          item.pendingCode && new Date(item.pendingCode.expiresAt) > now ? item.pendingCode : null;
        if (!pendingCode) {
          return <span className="text-text-subtle text-detail">—</span>;
        }
        const elapsedMinutes = minutesElapsed(pendingCode.issuedAt, now);
        const remainingMinutes = minutesRemaining(pendingCode.expiresAt, now);
        return (
          <div className="flex flex-col gap-1">
            <span className="text-text text-detail">
              {elapsedMinutes < 1
                ? "Código emitido recién"
                : `Código emitido hace ${plural(elapsedMinutes, { one: "1 minuto", other: `${elapsedMinutes} minutos` })}`}
            </span>
            <span className="text-detail text-warning-strong">
              {`Vence en ${plural(remainingMinutes, { one: "1 minuto", other: `${remainingMinutes} minutos` })}`}
            </span>
          </div>
        );
      },
    },
    {
      key: "pointsOfSale",
      header: "Puntos de venta",
      render: () => <span className="text-text-subtle text-detail">Sin configurar</span>,
    },
    {
      key: "status",
      header: "Estado",
      render: () => <Tag tone="info">Esperando alta</Tag>,
    },
    {
      key: "actions",
      kind: "actions",
      header: "Acciones",
      actions: [
        (item: RegisterSummary) => ({
          icon: <KeySquare />,
          "aria-label": `Emitir código de alta para ${item.name}`,
          onPress: () => void handleEmitClick(item),
        }),
      ],
    },
  ] as const;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración</p>
              <ScreenTitle>Cajas registradoras</ScreenTitle>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
              Nueva caja
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <Table
          aria-label="Cajas registradoras"
          columns={columns}
          {...cloudTableState(data, "las cajas registradoras")}
          rows={tableRows({ items: registers, id: (register) => register.id }).rows}
          empty={{
            icon: <Laptop />,
            title: "Todavía no hay cajas registradoras",
            description: "Creá la primera para verla en la lista.",
            variant: "blank",
          }}
          footer={
            registers.length === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(registers.length, { one: "1 caja", other: `${registers.length} cajas` })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewRegisterModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshRegisters();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <EnrollmentCodeModal
        emission={emission}
        onClose={closeEmission}
        onDone={closeEmission}
        onRetry={(register) => void handleEmitClick(register)}
      />
      {emissionAuthModal}
    </>
  );
}
