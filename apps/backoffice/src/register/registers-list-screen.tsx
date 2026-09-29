import { registerCreationBodySchema } from "@purosur/contracts";
import { isRegisterNameTooLong, REGISTER_NAME_MAX_LENGTH } from "@purosur/domain";
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
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, KeySquare, Laptop, Plus, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuthorization } from "../access/authorization-modal";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import { useCloudForm } from "../platform/cloud-form";
import { cloudTableState } from "../platform/cloud-table-state";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useRefreshRegisters, useRegistersQuery } from "./register-queries";
import type {
  CreateRegisterOutcome,
  createRegister,
  EmitEnrollmentCodeOutcome,
  RegisterSummary,
} from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";

export type RegistersListScreenProps = {
  onSessionEnded: () => void;
  now?: () => Date;
  services: RegistersListScreenServices;
};

const NO_REGISTERS: RegisterSummary[] = [];

const NEW_REGISTER_NAME_REQUIRED = "Ingresá el nombre de la caja.";
const NEW_REGISTER_NAME_TOO_LONG = `El nombre puede tener hasta ${REGISTER_NAME_MAX_LENGTH} caracteres.`;

function registerNameMessage({ name }: { name: string }): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    return NEW_REGISTER_NAME_REQUIRED;
  }
  return isRegisterNameTooLong(trimmed)
    ? NEW_REGISTER_NAME_TOO_LONG
    : "Revisá el nombre de la caja.";
}

const PENDING_CODE_REFRESH_MS = 30_000;

function minutesElapsed(issuedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(issuedAt).getTime()) / 60_000));
}

function minutesRemaining(expiresAt: string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000));
}

function groupedCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join(" ");
}

type NewRegisterModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSessionEnded: () => void;
  createRegister: typeof createRegister;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function NewRegisterModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  createRegister,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: NewRegisterModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const { run, modal } = useAuthorization<CreateRegisterOutcome>({
    actionName: "Crear una caja",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: { name: "" },
    request: { schema: registerCreationBodySchema, from: ({ name }) => ({ name }) },
    fields: { name: "name" },
    messages: { name: registerNameMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await run(() => createRegister(request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        onCreated();
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
      if (outcome.kind === "name_taken") {
        showFieldError("name", "Ya existe una caja con este nombre.");
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (open) {
      reset();
      setNotice(null);
    }
  }, [open, reset]);

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<Laptop />}
        context="Configuración"
        title="Nueva caja"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              disabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={submitting}
              onPress={() => void submit()}
            >
              Crear la caja
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo crear la caja"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre de la caja" required />}
          </form.AppField>
        </div>
      </Modal>
      {modal}
    </>
  );
}

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

/**
 * Purely presentational: the click handler in RegistersListScreen starts the emission, never an
 * effect here, so React Strict Mode's extra render (or a remount) can't refire the request.
 */
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
    createRegister,
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
  const clockRef = useLatestRef(clock);
  const latestEmission = useRef(0);

  const listSettled = data.status === "loaded" && !data.refreshing;
  useEffect(() => {
    if (listSettled) {
      setCurrentTime(clockRef.current());
    }
  }, [listSettled, clockRef]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setCurrentTime(clockRef.current()),
      PENDING_CODE_REFRESH_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [clockRef]);

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
        createRegister={createRegister}
        fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
        authorizeSession={authorizeSession}
        startAuthentication={startAuthentication}
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
