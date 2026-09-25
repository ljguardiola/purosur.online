import { REGISTER_NAME_MAX_LENGTH, registerNameLength } from "@purosur/contracts";
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
  | { kind: "loaded"; registers: RegisterSummary[] };

const registersMessages = messages.settings.registers;

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
  if (registerNameLength(trimmed) > REGISTER_NAME_MAX_LENGTH) {
    return modalMessages.nameTooLong;
  }
  return undefined;
}

type NewRegisterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (register: RegisterSummary) => void;
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
      onCreated({ ...outcome.value, pendingCode: null });
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

type EnrollmentCodeState =
  | { kind: "issuing" }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "issued"; code: string; expiresAt: string };

type EnrollmentCodeModalProps = {
  target: RegisterSummary | null;
  onClose: () => void;
  onDone: () => void;
  onVanished: () => void;
  onSessionEnded: () => void;
  emitEnrollmentCode: typeof emitEnrollmentCode;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

/**
 * Emits a fresh enrollment code for one register as soon as it opens, confirming with the shared
 * passkey-authorization modal only when the cloud asks for it, then shows the code. "Listo" is the
 * only way out: there is nothing to cancel, since the code is already issued once this is open.
 */
function EnrollmentCodeModal({
  target,
  onClose,
  onDone,
  onVanished,
  onSessionEnded,
  emitEnrollmentCode,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: EnrollmentCodeModalProps) {
  const modalMessages = registersMessages.enrollmentCodeModal;
  const isOpen = target !== null;
  const [state, setState] = useState<EnrollmentCodeState>({ kind: "issuing" });
  const targetRef = useRef(target);
  targetRef.current = target;
  const { run, modal } = useAuthorization<EmitEnrollmentCodeOutcome>({
    action: "registerEnrollmentCodeIssue",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  // Read every one of these through a ref, not as reactive `useCallback` dependencies: the parent
  // hands fresh function references on every render (each session-activity touch re-renders it),
  // which would otherwise retrigger the effect below and re-emit the code on an open modal.
  const runRef = useRef(run);
  runRef.current = run;
  const emitEnrollmentCodeRef = useRef(emitEnrollmentCode);
  emitEnrollmentCodeRef.current = emitEnrollmentCode;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const onVanishedRef = useRef(onVanished);
  onVanishedRef.current = onVanished;

  const handleEmit = useCallback(async () => {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    setState({ kind: "issuing" });
    const outcome = await runRef.current(() => emitEnrollmentCodeRef.current(current.id));
    if (outcome.kind === "cancelled") {
      onCloseRef.current();
      return;
    }
    if (outcome.kind === "ok") {
      setState({ kind: "issued", code: outcome.value.code, expiresAt: outcome.value.expiresAt });
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "not_found") {
      onVanishedRef.current();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setState({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setState({ kind: "attemptFailed" });
  }, []);

  useEffect(() => {
    if (isOpen) {
      void handleEmit();
    }
  }, [isOpen, handleEmit]);

  const isIssued = state.kind === "issued";

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
        icon={<KeySquare />}
        {...(target ? { context: target.name } : {})}
        title={modalMessages.heading}
        closable
        closeLabel={modalMessages.closeLabel}
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
          {state.kind === "issuing" && <p role="status">{modalMessages.issuing}</p>}
          {state.kind === "attemptFailed" && (
            <>
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title={modalMessages.attemptFailedTitle}
                detail={modalMessages.attemptFailedDetail}
              />
              <Button variant="secondary" icon={<RotateCcw />} onPress={() => void handleEmit()}>
                {modalMessages.retry}
              </Button>
            </>
          )}
          {state.kind === "rateLimited" && (
            <>
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title={modalMessages.rateLimitedTitle}
                detail={modalMessages.rateLimitedDetail({
                  minutes: Math.ceil(state.retryAfterSeconds / 60),
                })}
              />
              <Button variant="secondary" icon={<RotateCcw />} onPress={() => void handleEmit()}>
                {modalMessages.retry}
              </Button>
            </>
          )}
          {state.kind === "issued" && (
            <>
              <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-bone p-4">
                <p className="font-bold text-2xl text-brand-blue-strong tracking-[0.1em]">
                  {groupedCode(state.code)}
                </p>
                <p className="text-ink-secondary text-sm">{modalMessages.codeExpiresNote}</p>
              </div>
              <p className="text-base text-ink">{modalMessages.description}</p>
            </>
          )}
        </div>
      </Modal>
      {modal}
    </>
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
  const listRef = useRef(list);
  listRef.current = list;
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [emitTarget, setEmitTarget] = useState<RegisterSummary | null>(null);
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the list and pull
  // the registers out from under an open modal.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  // Only the latest load may settle the list: an earlier one still in flight would otherwise
  // overwrite it with a stale result.
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    latestLoad.current += 1;
    const thisLoad = latestLoad.current;
    setList({ kind: "loading" });
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

  const registers = list.kind === "loaded" ? list.registers : [];

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
        if (!item.pendingCode) {
          return (
            <span className="text-ink-secondary text-sm">{registersMessages.codeNotIssued}</span>
          );
        }
        const now = clock();
        return (
          <div className="flex flex-col gap-1">
            <span className="text-ink text-sm">
              {registersMessages.codeIssued({
                minutes: minutesElapsed(item.pendingCode.issuedAt, now),
              })}
            </span>
            <span className="text-sm text-status-warning-strong">
              {registersMessages.codeExpiresIn({
                minutes: minutesRemaining(item.pendingCode.expiresAt, now),
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
          onPress: () => setEmitTarget(item),
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
        {(list.kind === "loading" || list.kind === "loaded") && (
          <Table
            aria-label={registersMessages.heading}
            columns={columns}
            loading={list.kind === "loading" ? "initial" : false}
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
        onCreated={(register) => {
          setNewModalOpen(false);
          // Read through a ref: this runs after the create request's await, when `list` from the
          // render that started it may be stale.
          const current = listRef.current;
          if (current.kind === "loaded") {
            setList({ kind: "loaded", registers: [...current.registers, register] });
          } else {
            void load();
          }
        }}
        onSessionEnded={onSessionEnded}
        createRegister={createRegister}
        fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
        authorizeSession={authorizeSession}
        startAuthentication={startAuthentication}
      />
      <EnrollmentCodeModal
        target={emitTarget}
        onClose={() => setEmitTarget(null)}
        onDone={() => {
          setEmitTarget(null);
          void load();
        }}
        onVanished={() => {
          setEmitTarget(null);
          void load();
        }}
        onSessionEnded={onSessionEnded}
        emitEnrollmentCode={emitEnrollmentCode}
        fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
        authorizeSession={authorizeSession}
        startAuthentication={startAuthentication}
      />
    </>
  );
}
