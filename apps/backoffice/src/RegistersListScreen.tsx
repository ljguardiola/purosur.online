import { isRegisterNameTooLong } from "@purosur/contracts";
import { Button, InlineNotice, Modal, Table, TableCellText, Tag, TextField } from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, KeySquare, Laptop, Plus, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import { messages } from "./messages";
import {
  type CreateRegisterOutcome,
  createRegister,
  type EmitEnrollmentCodeOutcome,
  emitEnrollmentCode,
  fetchRegisters,
  type RegisterSummary,
} from "./registersApi";
import { ScreenLayout } from "./ScreenLayout";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { sendToMyAccount } from "./settingsRoutes";

export type RegistersListScreenServices = {
  fetchRegisters: typeof fetchRegisters;
  createRegister: typeof createRegister;
  emitEnrollmentCode: typeof emitEnrollmentCode;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultRegistersListScreenServices: RegistersListScreenServices = {
  fetchRegisters,
  createRegister,
  emitEnrollmentCode,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export type RegistersListScreenProps = {
  onSessionEnded: () => void;
  /** Injected in tests so a pending code's elapsed/remaining time is deterministic. */
  now?: () => Date;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: RegistersListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; registers: RegisterSummary[] }
  | { kind: "refreshing"; registers: RegisterSummary[] };

const registersMessages = messages.settings.registers;

/** How often the list re-reads the clock, so a pending code's minutes, and its expiry, stay current. */
const PENDING_CODE_REFRESH_MS = 30_000;

function minutesElapsed(issuedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(issuedAt).getTime()) / 60_000));
}

function minutesRemaining(expiresAt: string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60_000));
}

/** "P4NX7KWE2QRT8MZD" -> "P4NX 7KWE 2QRT 8MZD", the same groups of four the design shows. */
function groupedCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join(" ");
}

function registerNameError(
  name: string,
  modalMessages: { nameRequired: string; nameTooLong: string },
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return modalMessages.nameRequired;
  }
  if (isRegisterNameTooLong(trimmed)) {
    return modalMessages.nameTooLong;
  }
  return undefined;
}

type NewRegisterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSessionEnded: () => void;
  createRegister: typeof createRegister;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

/** Creates a register ("Nueva caja"), confirming with the shared passkey-authorization modal only when the cloud asks for it. */
function NewRegisterModal({
  isOpen,
  onClose,
  onCreated,
  onSessionEnded,
  createRegister,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: NewRegisterModalProps) {
  const modalMessages = registersMessages.newRegisterModal;
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<CreateRegisterOutcome>({
    action: "registerCreate",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (isOpen) {
      setName("");
      setNameError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  async function handleSubmit() {
    const trimmed = name.trim();
    const invalidName = registerNameError(name, modalMessages);
    if (invalidName) {
      setNameError(invalidName);
      return;
    }
    setNameError(undefined);
    setNotice(null);
    setSubmitting(true);

    const outcome = await run(() => createRegister({ name: trimmed }));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
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
      setNameError(modalMessages.nameTaken);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      setNameError(modalMessages.nameRequired);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<Laptop />}
        context={modalMessages.eyebrow}
        title={modalMessages.heading}
        closable
        closeLabel={modalMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {modalMessages.cancel}
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleSubmit()}
            >
              {modalMessages.submit}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.attemptFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={modalMessages.rateLimitedTitle}
              detail={modalMessages.rateLimitedDetail({
                minutes: Math.ceil(notice.retryAfterSeconds / 60),
              })}
            />
          )}
          <TextField
            kind="plain-text"
            label={modalMessages.nameLabel}
            value={name}
            onChange={(value) => {
              setName(value);
              if (nameError) {
                setNameError(registerNameError(value, modalMessages));
              }
            }}
            required
            {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
          />
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
 * Shows the outcome of emitting one register's enrollment code (in flight, issued, or a failure to
 * retry). Purely presentational: the emission itself is started by the row action's click handler
 * in `RegistersListScreen`, a real user action, never by this component opening or re-rendering —
 * an effect that fired the request instead would run again for reasons that have nothing to do with
 * the person actually asking for a new code (e.g. React Strict Mode's extra development render, or
 * any future change that remounts this component while a target is already set).
 */
function EnrollmentCodeModal({ emission, onClose, onDone, onRetry }: EnrollmentCodeModalProps) {
  const modalMessages = registersMessages.enrollmentCodeModal;
  const isOpen = emission.kind !== "closed";
  const isIssued = emission.kind === "issued";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<KeySquare />}
      {...(emission.kind !== "closed" ? { context: emission.register.name } : {})}
      title={modalMessages.heading}
      // An emission in flight can't be dismissed: the cloud may already have replaced the
      // register's pending code, and only this response carries the new one.
      {...(emission.kind === "issuing"
        ? { closable: false }
        : { closable: true, closeLabel: modalMessages.closeLabel })}
      footer={
        <Button
          variant="primary"
          size="large"
          icon={<Check />}
          fullWidth
          isDisabled={!isIssued}
          onPress={onDone}
        >
          {modalMessages.doneButton}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {emission.kind === "issuing" && <p role="status">{modalMessages.issuing}</p>}
        {emission.kind === "attemptFailed" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.attemptFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              onPress={() => onRetry(emission.register)}
            >
              {modalMessages.retry}
            </Button>
          </>
        )}
        {emission.kind === "rateLimited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={modalMessages.rateLimitedTitle}
              detail={modalMessages.rateLimitedDetail({
                minutes: Math.ceil(emission.retryAfterSeconds / 60),
              })}
            />
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              onPress={() => onRetry(emission.register)}
            >
              {modalMessages.retry}
            </Button>
          </>
        )}
        {emission.kind === "issued" && (
          <>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-bone p-4">
              <p className="font-bold text-2xl text-brand-blue-strong tracking-[0.1em]">
                {groupedCode(emission.code)}
              </p>
              <p className="text-ink-secondary text-sm">{modalMessages.codeExpiresNote}</p>
            </div>
            <p className="text-base text-ink">{modalMessages.description}</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * "Cajas registradoras": the branch's registers, each still unenrolled, with "Nueva caja" and a
 * one-time enrollment code per register. Gated by `enroll_register_devices`: App.tsx only ever
 * routes here for someone who holds it, and a `forbidden` read (a role change mid-session) sends
 * the browser to Mi cuenta instead of showing a notice.
 */
export function RegistersListScreen({ onSessionEnded, now, services }: RegistersListScreenProps) {
  const {
    fetchRegisters,
    createRegister,
    emitEnrollmentCode,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services ?? defaultRegistersListScreenServices;
  const clock = now ?? (() => new Date());
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [emission, setEmission] = useState<EmissionState>({ kind: "closed" });
  const { run: runEmission, modal: emissionAuthModal } =
    useAuthorization<EmitEnrollmentCodeOutcome>({
      action: "registerEnrollmentCodeIssue",
      onSessionEnded,
      services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
    });
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the list and pull
  // the registers out from under an open modal.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  // Only the latest load may settle the list: an earlier one still in flight would otherwise
  // overwrite it with a stale result.
  const latestLoad = useRef(0);
  // Only the latest emission attempt may settle `emission`: closing the modal (or a future click,
  // once nothing is in flight) bumps this, so a response that arrives after the person moved on
  // never resurrects a modal or shows a code paired with the wrong register's name.
  const latestEmission = useRef(0);

  const load = useCallback(async () => {
    latestLoad.current += 1;
    const thisLoad = latestLoad.current;
    // A reload after an action keeps the rows it already has on screen while it fetches. An empty
    // list has nothing worth keeping visible: "loading" shows the initial skeleton (and holds back
    // the "0 cajas" footer) instead of an empty table under a spinning bar, matching how Table
    // itself only ever shows the empty state when it isn't loading at all.
    setList((current) =>
      (current.kind === "loaded" || current.kind === "refreshing") && current.registers.length > 0
        ? { kind: "refreshing", registers: current.registers }
        : { kind: "loading" },
    );
    const outcome = await fetchRegisters();
    if (thisLoad !== latestLoad.current) {
      return;
    }
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", registers: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchRegisters]);

  useEffect(() => {
    void load();
  }, [load]);

  const [, setClockTick] = useState(0);
  useEffect(() => {
    const intervalId = window.setInterval(
      () => setClockTick((tick) => tick + 1),
      PENDING_CODE_REFRESH_MS,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  // Emits a fresh code for `register`, started by the row action's own click — never by an effect,
  // so it runs exactly once per click and never re-fires for reasons that have nothing to do with
  // the click itself. Ignored while another emission is already in flight: the open modal's own
  // backdrop already blocks reaching a different row's action, but this also guards a second Enter/
  // Space activation of the same button before its first request settles.
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
    // `runEmission`'s own attempt always reaches the server before this can resolve "cancelled"
    // (only an `authorization_required` response opens the passkey modal that cancel dismisses),
    // so the same ambiguity closeEmission guards against applies here too: reload every time.
    if (outcome.kind === "cancelled") {
      setEmission({ kind: "closed" });
      void load();
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
      void load();
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
    void load();
  }

  const registers = list.kind === "loaded" || list.kind === "refreshing" ? list.registers : [];

  const columns = [
    {
      key: "register",
      title: registersMessages.columns.register,
      render: (item: RegisterSummary) => (
        <TableCellText detail={registersMessages.noInstallation}>{item.name}</TableCellText>
      ),
    },
    {
      key: "installation",
      title: registersMessages.columns.installation,
      render: (item: RegisterSummary) => {
        const now = clock();
        const pendingCode =
          item.pendingCode && new Date(item.pendingCode.expiresAt) > now ? item.pendingCode : null;
        if (!pendingCode) {
          return (
            <span className="text-ink-secondary text-sm">{registersMessages.codeNotIssued}</span>
          );
        }
        return (
          <div className="flex flex-col gap-1">
            <span className="text-ink text-sm">
              {registersMessages.codeIssued({
                minutes: minutesElapsed(pendingCode.issuedAt, now),
              })}
            </span>
            <span className="text-sm text-status-warning-strong">
              {registersMessages.codeExpiresIn({
                minutes: minutesRemaining(pendingCode.expiresAt, now),
              })}
            </span>
          </div>
        );
      },
    },
    {
      key: "pointsOfSale",
      title: registersMessages.columns.pointsOfSale,
      render: () => (
        <span className="text-ink-secondary text-sm">
          {registersMessages.pointsOfSaleNotConfigured}
        </span>
      ),
    },
    {
      key: "status",
      title: registersMessages.columns.status,
      render: () => <Tag tone="info">{registersMessages.statusPendingEnrollment}</Tag>,
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: registersMessages.rowActionsLabel,
      actions: [
        (item: RegisterSummary) => ({
          icon: <KeySquare />,
          "aria-label": registersMessages.issueCodeAria({ name: item.name }),
          onPress: () => void handleEmitClick(item),
        }),
      ],
    },
  ] as const;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">{registersMessages.breadcrumb}</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">
                {registersMessages.heading}
              </h1>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
              {registersMessages.newRegisterButton}
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {list.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={registersMessages.loadErrorTitle}
              detail={registersMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {registersMessages.retry}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={registersMessages.rateLimitedTitle}
              detail={registersMessages.rateLimitedDetail({
                minutes: Math.ceil(list.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {registersMessages.retry}
            </Button>
          </>
        )}
        {(list.kind === "loading" || list.kind === "loaded" || list.kind === "refreshing") && (
          <Table
            aria-label={registersMessages.heading}
            columns={columns}
            loading={
              list.kind === "loading" ? "initial" : list.kind === "refreshing" ? "updating" : false
            }
            rows={registers.map((register) => ({ id: register.id, item: register }))}
            empty={{
              icon: <Laptop />,
              title: registersMessages.emptyTitle,
              detail: registersMessages.emptyDetail,
              tone: "blank",
            }}
            footer={
              <p className="text-ink-secondary text-sm">
                {registersMessages.count({ count: registers.length })}
              </p>
            }
          />
        )}
      </ScreenLayout>
      <NewRegisterModal
        isOpen={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          void load();
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
