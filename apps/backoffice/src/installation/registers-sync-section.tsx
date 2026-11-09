import { registerSyncStatusSchema } from "@purosur/contracts";
import {
  dataColumn,
  formatDate,
  formatFreeBytes,
  formatFreeRatio,
  formatNumber,
  formatPercent,
  Table,
  TableCellText,
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
  return (
    <TableCellText tone="subtle" size="detail">
      Sin datos
    </TableCellText>
  );
}

function BatteryCell({ battery }: { battery: RegisterBattery | null }) {
  if (battery === null) {
    return <NoData />;
  }
  if (!battery.present) {
    return (
      <TableCellText tone="warning" size="detail">
        Sin batería
      </TableCellText>
    );
  }
  const charge = formatPercent(battery.chargePercent);
  const health =
    battery.worn && battery.healthPercent !== null
      ? `Salud ${formatPercent(battery.healthPercent)}`
      : undefined;
  if (!battery.onBattery) {
    return (
      <TableCellText size="detail" description={health} descriptionTone="warning">
        {`Con corriente · ${charge}`}
      </TableCellText>
    );
  }
  return (
    <TableCellText
      tone="error"
      size="detail"
      description={`Sin corriente hace ${formatNumber(battery.onBatteryMinutes)} min`}
      descriptionTone="error"
      secondDescription={health}
      secondDescriptionTone="warning"
    >
      {`A batería · ${charge}`}
    </TableCellText>
  );
}

function DiskCell({ disk }: { disk: RegisterDisk | null }) {
  if (disk === null) {
    return <NoData />;
  }
  return (
    <TableCellText size="detail" description={formatFreeBytes(disk.freeBytes)}>
      {`${formatFreeRatio(disk.freeRatio)} libre`}
    </TableCellText>
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
        aria-label="Estado de las cajas"
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
