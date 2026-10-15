import {
  Button,
  Card,
  dataColumn,
  EmptyState,
  FigureStat,
  FloatingNotification,
  formatBytes,
  formatNumber,
  ListFilter,
  LoadFailure,
  StatusIndicator,
  sortedItems,
  Table,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { Check, HardDriveDownload, Laptop, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  useRefreshRegisters,
  useSnapshotBackupRegistersQuery,
  useSnapshotBackupsQuery,
} from "./register-queries";
import { RotateSnapshotKeyModal } from "./rotate-snapshot-key-modal";
import type { SnapshotBackupsFilters } from "./routes";
import type { SnapshotBackupGeneration, SnapshotBackupRegister } from "./snapshot-backups-api";
import type { SnapshotBackupsScreenServices } from "./snapshot-backups-services";
import { snapshotGenerationDate, snapshotTierCaptions } from "./snapshot-backups-text";
import { SnapshotLifecycleRulesModal } from "./snapshot-lifecycle-rules-modal";

export type SnapshotBackupsScreenProps = {
  filters: SnapshotBackupsFilters;
  onFiltersChange: (filters: SnapshotBackupsFilters) => void;
  onSessionEnded: () => void;
  services: SnapshotBackupsScreenServices;
};

type Notice = { id: number; title: string; description: string };

const NO_REGISTERS: SnapshotBackupRegister[] = [];
const NO_GENERATIONS: SnapshotBackupGeneration[] = [];

const registerOrder = textOrder((register: { label: string }) => register.label);

function generationStatus(generation: SnapshotBackupGeneration) {
  if (generation.status === "verified") {
    return <StatusIndicator tone="success">Verificada</StatusIndicator>;
  }
  if (generation.status === "failed") {
    return <StatusIndicator tone="error">No pasó la verificación</StatusIndicator>;
  }
  return (
    <StatusIndicator tone="neutral" busy>
      Verificando
    </StatusIndicator>
  );
}

export function SnapshotBackupsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: SnapshotBackupsScreenProps) {
  const registersData = useSnapshotBackupRegistersQuery({
    fetchSnapshotBackupRegisters: services.fetchSnapshotBackupRegisters,
    onSessionEnded,
  });
  const registers = registersData.status === "loaded" ? registersData.value : NO_REGISTERS;
  const chosen = registers.find((register) => register.id === filters.register) ?? registers[0];
  const backupsData = useSnapshotBackupsQuery({
    registerId: chosen?.id,
    fetchSnapshotBackups: services.fetchSnapshotBackups,
    onSessionEnded,
  });
  const refreshRegisters = useRefreshRegisters();
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rotationTarget, setRotationTarget] = useState<SnapshotBackupRegister | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [noticeCount, setNoticeCount] = useState(0);

  const registersListed = registersData.status === "loaded";
  const registerOffered = chosen !== undefined && chosen.id === filters.register;
  const resetRegister = useEffectEvent(() => onFiltersChange({ register: "" }));

  useEffect(() => {
    if (registersListed && filters.register !== "" && !registerOffered) {
      resetRegister();
    }
  }, [registersListed, registerOffered, filters.register]);

  function showNotice(title: string, description: string) {
    setNotice({ id: noticeCount, title, description });
    setNoticeCount(noticeCount + 1);
  }

  const backups = backupsData.status === "loaded" ? backupsData.value : undefined;
  const generations = backups?.generations ?? NO_GENERATIONS;

  const columns = [
    dataColumn({
      id: "generated",
      header: "Generada",
      render: (generation: SnapshotBackupGeneration) => (
        <span className="font-semibold text-body text-text">
          {snapshotGenerationDate(generation.createdAt)}
        </span>
      ),
    }),
    dataColumn({
      id: "size",
      header: "Tamaño",
      align: "end",
      render: (generation: SnapshotBackupGeneration) => (
        <span className="text-detail text-text">{formatBytes(generation.size)}</span>
      ),
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (generation: SnapshotBackupGeneration) => (
        <div className="flex flex-col items-start gap-1">
          {generationStatus(generation)}
          {generation.countsForRestore ? null : (
            <span className="text-detail text-text-subtle">No cuenta para restaurar</span>
          )}
        </div>
      ),
    }),
  ] as const;

  const table = useTableModel({
    items: generations,
    id: (generation) => generation.id,
    columns,
  });

  const registerOptions = sortedItems(
    registers.map(({ id, name }) => ({ value: id, label: name })),
    { order: registerOrder, direction: "ascending" },
  );
  const [firstOption, ...otherOptions] = registerOptions;

  const captions = backups === undefined ? undefined : snapshotTierCaptions(backups.rules);
  const tiers = [
    {
      label: "Recientes",
      count: backups && ` de `,
      caption: "En el disco y en el bucket",
    },
    {
      label: "Por hora",
      count: backups && formatNumber(backups.tiers.hourly),
      caption: captions?.hourly,
    },
    {
      label: "Diarias",
      count: backups && formatNumber(backups.tiers.daily),
      caption: captions?.daily,
    },
    {
      label: "Mensuales",
      count: backups && formatNumber(backups.tiers.monthly),
      caption: captions?.monthly,
    },
  ];

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración</p>
              <ScreenTitle>Backups</ScreenTitle>
            </div>
            <Button
              variant="primary"
              icon={<RefreshCw />}
              dataStatus={backupsData.status}
              onPress={() => setRotationTarget(chosen ?? null)}
            >
              Rotar la clave de cifrado
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {registersData.status === "failed" ? (
          <LoadFailure {...cloudLoadFailure(registersData, "los backups")} variant="screen" />
        ) : registersListed && registers.length === 0 ? (
          <EmptyState
            icon={<Laptop />}
            title="Todavía no hay cajas registradoras"
            description="Los backups aparecen cuando una caja se da de alta."
            variant="blank"
          />
        ) : (
          <>
            <div className="flex items-center gap-3">
              {firstOption === undefined ? null : (
                <ListFilter
                  name="register"
                  label="Caja:"
                  options={[firstOption, ...otherOptions]}
                  value={chosen?.id ?? firstOption.value}
                  onChange={(register) => onFiltersChange({ register })}
                />
              )}
              <div className="flex-1" />
              <Button
                variant="secondary"
                icon={<SlidersHorizontal />}
                dataStatus={backupsData.status}
                onPress={() => setRulesModalOpen(true)}
              >
                Cambiar las reglas
              </Button>
            </div>
            {backupsData.status === "failed" ? null : (
              <div className="grid grid-cols-4 gap-4">
                {tiers.map(({ label, count, caption }) => (
                  <Card key={label}>
                    {count === undefined || caption === undefined ? (
                      <FigureStat size="heading" label={label} loading />
                    ) : (
                      <FigureStat size="heading" label={label} value={count} detail={caption} />
                    )}
                  </Card>
                ))}
              </div>
            )}
            <Table
              aria-label={`Últimas generaciones de ${chosen?.name ?? "la caja"}`}
              table={table}
              {...cloudTableState(backupsData, "los backups")}
              empty={{
                icon: <HardDriveDownload />,
                title: "Esta caja todavía no generó backups",
                description: "Aparecen acá apenas la caja genere el primero.",
                variant: "blank",
              }}
            />
          </>
        )}
      </ScreenLayout>
      {backups === undefined ? null : (
        <SnapshotLifecycleRulesModal
          open={rulesModalOpen}
          rules={backups.rules}
          onClose={() => setRulesModalOpen(false)}
          onChanged={() => {
            setRulesModalOpen(false);
            void refreshRegisters();
            showNotice("Reglas cambiadas", "Las reglas nuevas rigen para todas las cajas.");
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      )}
      <RotateSnapshotKeyModal
        target={rotationTarget}
        onClose={() => setRotationTarget(null)}
        onRotated={(keyVersion) => {
          const rotated = rotationTarget;
          setRotationTarget(null);
          void refreshRegisters();
          if (rotated !== null) {
            showNotice(
              "Clave rotada",
              `${rotated.name} ahora cifra con la versión ${keyVersion} de su clave.`,
            );
          }
        }}
        onRegisterNotFound={() => {
          setRotationTarget(null);
          void refreshRegisters();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      {notice === null ? null : (
        <FloatingNotification
          key={notice.id}
          tone="success"
          icon={<Check />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      )}
    </>
  );
}
