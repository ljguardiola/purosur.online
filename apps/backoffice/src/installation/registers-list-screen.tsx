import {
  actionsColumn,
  Button,
  ButtonLink,
  dataColumn,
  FloatingNotification,
  formatNumber,
  formatPointOfSaleNumber,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { createLink, useNavigate } from "@tanstack/react-router";
import { Check, Laptop, Plus } from "lucide-react";
import { Suspense, useEffect, useEffectEvent, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { cloudTableState } from "../platform/cloud-table-state";
import type { RegisterPanelSections } from "../platform/register-panel-sections";
import type {
  RegisterPaymentAndKeyModalRequest,
  RegisterPaymentAndKeyModals,
} from "../platform/register-payment-and-key-modals";
import type { RegisterPointOfSaleSection } from "../platform/register-point-of-sale-section";
import { useRefreshRegisters } from "../platform/register-query-roots";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type BackofficeAccess,
  canEnrollRegisters,
  canRevokeInstallations,
  canSeeRegistersArea,
} from "../shell/backoffice-access";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { type EmissionState, EnrollmentCodeModal } from "./enrollment-code-modal";
import {
  useRegisterCoverageQuery,
  useRegistersQuery,
  useReloadRegister,
} from "./installation-queries";
import { NewRegisterModal } from "./new-register-modal";
import { RegisterCoverageNotice } from "./register-coverage-notice";
import {
  InstallationStatusTag,
  RegisterInstallationSummary,
  useSecondsSinceRead,
} from "./register-installation-summary";
import { RegisterNamesListScreen } from "./register-names-list-screen";
import { RegisterPanel } from "./register-panel";
import { type RegisterActions, registerRowActions } from "./register-row-actions";
import type { EmitEnrollmentCodeOutcome, RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import { RevokeEveryInstallationCallout } from "./revoke-every-installation-callout";
import { RevokeEveryInstallationModal } from "./revoke-every-installation-modal";
import { RevokeRegisterModal } from "./revoke-register-modal";

export type RegistersListScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: RegistersListScreenServices;
  registerPointOfSaleSection: RegisterPointOfSaleSection;
  registerPanelSections: RegisterPanelSections;
  registerPaymentAndKeyModals: RegisterPaymentAndKeyModals;
  openRegister?: string | undefined;
  tab?: string | undefined;
  sessionsPeriod: ReportPeriodFilters;
  onSessionsPeriodChange: (period: ReportPeriodFilters) => void;
};

const RegisterRowLink = createLink(ButtonLink);

const NO_REGISTERS: RegisterSummary[] = [];

export function RegistersListScreen(props: RegistersListScreenProps) {
  return canSeeRegistersArea(props.access) ? (
    <FullRegistersListScreen {...props} />
  ) : (
    <RegisterNamesListScreen {...props} />
  );
}

function FullRegistersListScreen({
  access,
  onSessionEnded,
  services,
  registerPointOfSaleSection,
  registerPanelSections,
  registerPaymentAndKeyModals: PaymentAndKeyModals,
  openRegister,
  tab,
  sessionsPeriod,
  onSessionsPeriodChange,
}: RegistersListScreenProps) {
  const navigate = useNavigate();
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchRegisters,
    fetchRegisterCoverage,
    emitEnrollmentCode,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const data = useRegistersQuery({ fetchRegisters, onSessionEnded });
  const coverage = useRegisterCoverageQuery({ fetchRegisterCoverage, onSessionEnded });
  const refreshRegisters = useRefreshRegisters();
  const reloadRegister = useReloadRegister({ fetchRegisters });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [modalRequest, setModalRequest] = useState<RegisterPaymentAndKeyModalRequest | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RegisterSummary | null>(null);
  const [revokeEveryOpen, setRevokeEveryOpen] = useState(false);
  const [revokedNotice, setRevokedNotice] = useState<{ id: number; registers: number } | null>(
    null,
  );
  const [revokedNoticeCount, setRevokedNoticeCount] = useState(0);
  const [emission, setEmission] = useState<EmissionState>({ kind: "closed" });
  const { run: runEmission, modal: emissionAuthModal } =
    useAuthorization<EmitEnrollmentCodeOutcome>({
      actionName: "Emitir un código de alta",
      onSessionEnded,
      services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
    });
  // Guards a second Enter/Space activation before the first request settles (the modal backdrop
  // blocks other rows); a request that is no longer the open one leaves the modal as it is.
  async function handleEmitClick(register: RegisterSummary) {
    if (emission.kind === "issuing") {
      return;
    }
    const issuing: EmissionState = { kind: "issuing", register };
    setEmission(issuing);
    const settle = (next: EmissionState) =>
      setEmission((current) => (current === issuing ? next : current));

    const outcome = await runEmission(() => emitEnrollmentCode(register.id));
    // The attempt always reaches the server before "cancelled" can resolve (only
    // `authorization_required` opens the modal that cancel dismisses), so reload every time.
    if (outcome.kind === "cancelled") {
      settle({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "ok") {
      settle({ kind: "issued", register, code: outcome.value.code });
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
      settle({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "rate_limited") {
      settle({ kind: "rateLimited", register, retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    settle({ kind: "attemptFailed", register });
  }

  // Reloads after every outcome, not just an issued code: a failure seen here (a dropped
  // connection, an unreadable 200) may still follow a code the cloud already committed.
  function closeEmission() {
    setEmission({ kind: "closed" });
    void refreshRegisters();
  }

  const registers = data.status === "loaded" ? data.value : NO_REGISTERS;
  const secondsSinceRead = useSecondsSinceRead(registers);

  const openRegisterSummary = registers.find((register) => register.id === openRegister);
  const closeUnlistedRegister = useEffectEvent(() => {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: undefined, tab: undefined }),
      replace: true,
    });
  });
  useEffect(() => {
    if (
      data.status === "loaded" &&
      openRegister !== undefined &&
      openRegisterSummary === undefined
    ) {
      closeUnlistedRegister();
    }
  }, [data.status, openRegister, openRegisterSummary]);

  function closeRegister() {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: undefined, tab: undefined }),
    });
  }

  function openRegisterPanel(id: string) {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: id, tab: undefined }),
    });
  }

  const mayEnroll = canEnrollRegisters(access);
  const mayRevoke = canRevokeInstallations(access);
  const actions: RegisterActions = {
    emitCode: (register) => void handleEmitClick(register),
    revoke: setRevokeTarget,
    loadKey: (register) => setModalRequest({ kind: "loadKey", register }),
    consultKey: (register) => setModalRequest({ kind: "consultKey", register }),
    assignTerminal: (register) => setModalRequest({ kind: "assignTerminal", register }),
    assignQr: (register) => setModalRequest({ kind: "assignQr", register }),
  };
  const rowActions = registerRowActions(access, actions);

  const columns = [
    dataColumn({
      id: "register",
      header: "Caja",
      render: (item: RegisterSummary) => (
        <TableCellText
          description={
            item.installation?.state === "enrolled" ? item.installation.hostname : "Sin instalación"
          }
        >
          <RegisterRowLink
            from="/registers"
            to="/registers"
            search={(previous) => ({ ...previous, register: item.id, tab: undefined })}
            variant="text"
          >
            {item.name}
          </RegisterRowLink>
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "installation",
      header: "Instalación",
      render: (item: RegisterSummary) => (
        <RegisterInstallationSummary register={item} secondsSinceRead={secondsSinceRead} />
      ),
    }),
    dataColumn({
      id: "pointsOfSale",
      header: "Punto de venta",
      render: (item: RegisterSummary) =>
        item.pointOfSaleNumber === null ? (
          <span className="text-text-subtle text-detail">Sin configurar</span>
        ) : (
          <span className="text-text text-detail">
            {formatPointOfSaleNumber(item.pointOfSaleNumber)}
          </span>
        ),
    }),
    dataColumn({
      id: "pointTerminal",
      header: "Terminal Point",
      render: (item: RegisterSummary) =>
        item.pointTerminalId === null ? (
          <span className="text-text-subtle text-detail">Sin asignar</span>
        ) : (
          <span className="text-text text-detail">{item.pointTerminalId}</span>
        ),
    }),
    dataColumn({
      id: "qrPointOfSale",
      header: "QR de Mercado Pago",
      render: (item: RegisterSummary) =>
        item.qrExternalPosId === null ? (
          <span className="text-text-subtle text-detail">Sin asignar</span>
        ) : (
          <span className="text-text text-detail">{item.qrExternalPosId}</span>
        ),
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: RegisterSummary) => <InstallationStatusTag installation={item.installation} />,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      ...rowActions,
    }),
  ] as const;

  const table = useTableModel({
    items: registers,
    id: (register) => register.id,
    columns,
  });

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          {mayEnroll && (
            <div className="flex justify-end">
              <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
                Nueva caja
              </Button>
            </div>
          )}
          <Table
            aria-label="Cajas registradoras"
            table={table}
            onRowPress={(item) => openRegisterPanel(item.id)}
            rowState={(item) => (item.id === openRegister ? "selected" : undefined)}
            {...cloudTableState(data, "las cajas registradoras")}
            empty={{
              icon: <Laptop />,
              title: "Todavía no hay cajas registradoras",
              description: "Creá la primera para verla en la lista.",
              variant: "blank",
            }}
            footer={
              registers.length === 0 ? undefined : (
                <p className="text-text-subtle text-detail">
                  {plural(registers.length, {
                    one: "1 caja",
                    other: `${formatNumber(registers.length)} cajas`,
                  })}
                </p>
              )
            }
          />
          {mayRevoke && (
            <RevokeEveryInstallationCallout onRevoke={() => setRevokeEveryOpen(true)} />
          )}
          <RegisterCoverageNotice coverage={coverage} />
        </div>
        {openRegisterSummary === undefined ? null : (
          <RegisterPanel
            key={openRegisterSummary.id}
            register={openRegisterSummary}
            summary={openRegisterSummary}
            actions={actions}
            secondsSinceRead={secondsSinceRead}
            access={access}
            tab={tab}
            sessionsPeriod={sessionsPeriod}
            onSessionsPeriodChange={onSessionsPeriodChange}
            onClose={closeRegister}
            onPointOfSaleSaved={() => void refreshRegisters()}
            onSessionEnded={onSessionEnded}
            registerPanelSections={registerPanelSections}
            registerPointOfSaleSection={registerPointOfSaleSection}
          />
        )}
      </div>
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
      <RevokeEveryInstallationModal
        open={revokeEveryOpen}
        onClose={() => setRevokeEveryOpen(false)}
        onRevoked={({ revokedRegisters }) => {
          void refreshRegisters();
          setRevokedNotice({ id: revokedNoticeCount, registers: revokedRegisters });
          setRevokedNoticeCount(revokedNoticeCount + 1);
        }}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      {revokedNotice === null ? null : (
        <FloatingNotification
          key={revokedNotice.id}
          tone="success"
          icon={<Check />}
          title="Instalaciones revocadas"
          description={plural(revokedNotice.registers, {
            one: "Se revocó 1 caja.",
            other: `Se revocaron ${formatNumber(revokedNotice.registers)} cajas.`,
          })}
          onDismiss={() => setRevokedNotice(null)}
        />
      )}
      <EnrollmentCodeModal
        emission={emission}
        onClose={closeEmission}
        onDone={closeEmission}
        onRetry={(register) => void handleEmitClick(register)}
      />
      <RevokeRegisterModal
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onRevoked={() => void refreshRegisters()}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <Suspense fallback={null}>
        <PaymentAndKeyModals
          request={modalRequest}
          reload={reloadRegister}
          onClose={() => setModalRequest(null)}
          onAssigned={() => {
            setModalRequest(null);
            void refreshRegisters();
          }}
          onKeyLoaded={() => void refreshRegisters()}
          onOutdated={() => void refreshRegisters()}
          onSessionEnded={onSessionEnded}
        />
      </Suspense>
      {emissionAuthModal}
    </>
  );
}
