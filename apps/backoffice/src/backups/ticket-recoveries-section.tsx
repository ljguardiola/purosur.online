import type { ContingencyTicketRecoveriesResponse } from "@purosur/contracts";
import { actionsColumn, dataColumn, InlineNotice, Table, useTableModel } from "@purosur/ui";
import { CircleCheck, Printer } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import type { ContingencyTicketRecovery } from "./contingency-ticket-recovery-api";
import { recoveryAwaitingSinceText } from "./ticket-recovery-text";

type TicketRecoveriesSectionProps = {
  data: CloudData<ContingencyTicketRecoveriesResponse>;
  onFinish: (recovery: ContingencyTicketRecovery) => void;
};

const NO_RECOVERIES: ContingencyTicketRecovery[] = [];

function columnsFor(onFinish: (recovery: ContingencyTicketRecovery) => void) {
  return [
    dataColumn({
      id: "register",
      header: "Caja",
      render: (item: ContingencyTicketRecovery) => item.register_name,
    }),
    dataColumn({
      id: "awaitingSince",
      header: "Esperando desde",
      render: (item: ContingencyTicketRecovery) => recoveryAwaitingSinceText(item.opened_at),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: ContingencyTicketRecovery) => ({
          icon: <CircleCheck />,
          "aria-label": `Terminar el rescate de ${item.register_name}`,
          onPress: () => onFinish(item),
        }),
      ],
    }),
  ] as const;
}

export function TicketRecoveriesSection({ data, onFinish }: TicketRecoveriesSectionProps) {
  const recoveries = data.status === "loaded" ? data.value.recoveries : NO_RECOVERIES;
  const table = useTableModel({
    items: recoveries,
    id: (recovery) => recovery.recovery_id,
    columns: columnsFor(onFinish),
  });

  const loaded = data.status === "loaded";
  if (loaded && recoveries.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-4">
      {loaded ? (
        <InlineNotice
          tone="info"
          icon={<Printer />}
          title="Antes de escanear, revisá la impresora y el mostrador: el último ticket de respaldo suele seguir ahí."
        />
      ) : null}
      <Table
        aria-label="Cajas esperando el rescate de tickets"
        table={table}
        {...cloudTableState(data, "las cajas esperando el rescate")}
      />
    </section>
  );
}
