import {
  Button,
  Card,
  dataColumn,
  FigureStat,
  FloatingNotification,
  formatBytes,
  formatNumber,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Check, HardDriveDownload, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ChangeSnapshotLifecycleRulesModal } from "./change-snapshot-lifecycle-rules-modal";
import { useRefreshRegisters, useSnapshotBackupsQuery } from "./register-queries";
import { RotateSnapshotKeyModal } from "./rotate-snapshot-key-modal";
import type { SnapshotBackupGeneration, SnapshotBackupRegister } from "./snapshot-backups-api";
import type { SnapshotBackupsSectionServices } from "./snapshot-backups-services";
import {
  SNAPSHOT_LOCATION_TEXT,
  snapshotGenerationDate,
  snapshotRecentCaption,
  snapshotTierCaptions,
} from "./snapshot-backups-text";

export type SnapshotBackupsSectionProps = {
  register: SnapshotBackupRegister;
  onSessionEnded: () => void;
  services: SnapshotBackupsSectionServices;
};

type Notice = { id: number; title: string; description: string };

const NO_GENERATIONS: SnapshotBackupGeneration[] = [];

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

export function SnapshotBackupsSection({
  register,
  onSessionEnded,
  services,
}: SnapshotBackupsSectionProps) {
  const backupsData = useSnapshotBackupsQuery({
    registerId: register.id,
    fetchSnapshotBackups: services.fetchSnapshotBackups,
    onSessionEnded,
  });
  const refreshRegisters = useRefreshRegisters();
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rotationTarget, setRotationTarget] = useState<SnapshotBackupRegister | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [noticeCount, setNoticeCount] = useState(0);

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
      id: "location",
      header: "Dónde",
      render: (generation: SnapshotBackupGeneration) => (
        <span className="text-detail text-text">{SNAPSHOT_LOCATION_TEXT[generation.location]}</span>
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

  const captions = backups === undefined ? undefined : snapshotTierCaptions(backups.rules);
  const tiers = [
    {
      label: "Recientes",
      count:
        backups && `${formatNumber(backups.tiers.recent)} de ${formatNumber(backups.recentLimit)}`,
      caption: backups && snapshotRecentCaption(backups.recentLimit),
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
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            icon={<RefreshCw />}
            dataStatus={backupsData.status}
            onPress={() => setRotationTarget(register)}
          >
            Rotar la clave de cifrado
          </Button>
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
          <div className="grid grid-cols-2 gap-4">
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
          aria-label={`Últimas generaciones de ${register.name}`}
          table={table}
          {...cloudTableState(backupsData, "los backups")}
          empty={{
            icon: <HardDriveDownload />,
            title: "Esta caja todavía no generó backups",
            description: "Aparecen acá apenas la caja genere el primero.",
            variant: "blank",
          }}
        />
      </div>
      {backups === undefined ? null : (
        <ChangeSnapshotLifecycleRulesModal
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
              `Las próximas generaciones de ${rotated.name} se cifran con la versión ${keyVersion} de su clave.`,
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
