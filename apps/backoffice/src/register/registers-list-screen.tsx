import { Button, plural, Table, TableCellText, Tag, tableRows } from "@purosur/ui";
import { KeySquare, Laptop, Plus } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAuthorization } from "../access/authorization-modal";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { minutesElapsed, minutesRemaining } from "./enrollment-code";
import { type EmissionState, EnrollmentCodeModal } from "./enrollment-code-modal";
import { NewRegisterModal } from "./new-register-modal";
import { RegisterCoverageNotice } from "./register-coverage-notice";
import {
  useRefreshRegisters,
  useRegisterCoverageQuery,
  useRegistersQuery,
} from "./register-queries";
import type { EmitEnrollmentCodeOutcome, RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";

export type RegistersListScreenProps = {
  onSessionEnded: () => void;
  now?: () => Date;
  services: RegistersListScreenServices;
};

const NO_REGISTERS: RegisterSummary[] = [];

const PENDING_CODE_REFRESH_MS = 30_000;

export function RegistersListScreen({ onSessionEnded, now, services }: RegistersListScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchRegisters,
    fetchRegisterCoverage,
    emitEnrollmentCode,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const clock = now ?? (() => new Date());
  const data = useRegistersQuery({ fetchRegisters, onSessionEnded });
  const coverage = useRegisterCoverageQuery({ fetchRegisterCoverage, onSessionEnded });
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
        <RegisterCoverageNotice coverage={coverage} />
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
