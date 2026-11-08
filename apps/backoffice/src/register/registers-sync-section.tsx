import { registerSyncStatusSchema } from "@purosur/contracts";
import {
  dataColumn,
  formatBytes,
  formatDate,
  formatPercent,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Laptop } from "lucide-react";
import { useId } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { schemaText } from "../platform/schema-text";
import type { CloudData } from "../platform/use-cloud-query";
import type { RegisterBattery, RegisterDisk, RegisterSyncStatus } from "./registers-api";

export type RegistersSyncSectionProps = {
  data: CloudData<RegisterSyncStatus[]>;
};

const NO_REGISTERS: RegisterSyncStatus[] = [];

const SYNC_TIME_ZONE = schemaText(
  registerSyncStatusSchema.shape.last_successful_sync_at.meta()?.["timeZone"],
);

function syncDateTime(instant: string): string {
  const date = new Date(instant);
  const day = formatDate(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SYNC_TIME_ZONE,
  });
  const time = formatDate(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SYNC_TIME_ZONE,
  });
  return `${day} ${time}`;
}

function NoData() {
  return <span className="text-text-subtle text-detail">Sin datos</span>;
}

function BatteryCell({ battery }: { battery: RegisterBattery | null }) {
  if (battery === null) {
    return <NoData />;
  }
  if (!battery.present) {
    return <div className="text-warning-strong text-detail">Sin batería</div>;
  }
  const charge = formatPercent(battery.chargePercent);
  return (
    <div className="flex flex-col text-detail">
      {battery.onBattery ? (
        <>
          <div className="text-error-strong">{`A batería · ${charge}`}</div>
          <div className="text-error-strong">{`Sin corriente hace ${battery.onBatteryMinutes} min`}</div>
        </>
      ) : (
        <div className="text-text">{`Con corriente · ${charge}`}</div>
      )}
      {battery.worn && battery.healthPercent !== null ? (
        <div className="text-warning-strong">{`Salud ${formatPercent(battery.healthPercent)}`}</div>
      ) : null}
    </div>
  );
}

function DiskCell({ disk }: { disk: RegisterDisk | null }) {
  if (disk === null) {
    return <NoData />;
  }
  return (
    <div className="flex flex-col text-detail">
      <div className="text-text">{`${formatPercent(Math.round(disk.freeRatio * 100))} libre`}</div>
      <div className="text-text-subtle">{formatBytes(disk.freeBytes)}</div>
    </div>
  );
}

const columns = [
  dataColumn({
    id: "register",
    header: "Caja",
    render: (item: RegisterSyncStatus) => (
      <span className="text-text text-detail">{item.name}</span>
    ),
  }),
  dataColumn({
    id: "lastSync",
    header: "Última sincronización",
    render: (item: RegisterSyncStatus) =>
      item.lastSuccessfulSyncAt === null ? (
        <span className="text-text-subtle text-detail">Nunca sincronizó</span>
      ) : (
        <span className="text-text text-detail">{syncDateTime(item.lastSuccessfulSyncAt)}</span>
      ),
  }),
  dataColumn({
    id: "battery",
    header: "Batería",
    render: (item: RegisterSyncStatus) => <BatteryCell battery={item.battery} />,
  }),
  dataColumn({
    id: "disk",
    header: "Disco",
    render: (item: RegisterSyncStatus) => <DiskCell disk={item.disk} />,
  }),
] as const;

export function RegistersSyncSection({ data }: RegistersSyncSectionProps) {
  const headingId = useId();
  const table = useTableModel({
    items: data.status === "loaded" ? data.value : NO_REGISTERS,
    id: (register) => register.id,
    columns,
  });
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-subheading text-text">
        Estado de las cajas
      </h2>
      <Table
        aria-label="Última sincronización de las cajas"
        table={table}
        {...cloudTableState(data, "las cajas")}
        empty={{
          icon: <Laptop />,
          title: "Todavía no hay cajas registradoras",
          description: "Cuando se cree la primera, aparece acá.",
          variant: "blank",
        }}
      />
    </section>
  );
}
