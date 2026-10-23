import type { FiscalTaskItem } from "@purosur/contracts";
import {
  dataColumn,
  formatTimeAgo,
  StatusIndicator,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { ListChecks } from "lucide-react";
import { ALERT_LEVEL_LABELS } from "../platform/alert-level-label";
import { ALERT_LEVEL_TONE } from "../platform/alert-level-tone";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { useFiscalTasksQuery } from "./fiscal-queries";
import { fiscalTaskDate, fiscalTaskDayAndTime } from "./fiscal-task-moments";
import {
  fiscalTaskDescription,
  fiscalTaskTitle,
  openFiscalTasksCountText,
} from "./fiscal-task-text";
import type { FiscalTasksScreenServices } from "./fiscal-tasks-services";

export type FiscalTasksScreenProps = {
  onSessionEnded: () => void;
  services: FiscalTasksScreenServices;
};

const NO_TASKS: FiscalTaskItem[] = [];

function openedSince(task: FiscalTaskItem) {
  const since = formatTimeAgo(task.open_for_seconds);
  if (task.alert?.level === "critical") {
    return (
      <TableCellText strong description={since} descriptionTone="error">
        {fiscalTaskDate(task.created_at)}
      </TableCellText>
    );
  }
  if (task.kind === "deferred_sale_expired") {
    return (
      <TableCellText strong description={since} descriptionTone="warning">
        {fiscalTaskDate(task.created_at)}
      </TableCellText>
    );
  }
  return (
    <TableCellText strong description={since}>
      {fiscalTaskDate(task.created_at)}
    </TableCellText>
  );
}

function alertCell(task: FiscalTaskItem) {
  if (task.alert === null) {
    return task.kind === "deferred_sale_expired" ? (
      <TableCellText description="Pasó a regularización manual">Sin aviso</TableCellText>
    ) : (
      "Sin aviso"
    );
  }
  const badge = (
    <StatusIndicator tone={ALERT_LEVEL_TONE[task.alert.level]}>
      {ALERT_LEVEL_LABELS[task.alert.level]}
    </StatusIndicator>
  );
  return task.alert.escalated_at === null ? (
    badge
  ) : (
    <div className="flex flex-col gap-1">
      {badge}
      <span className="text-caption text-text-subtle">
        Escaló el {fiscalTaskDayAndTime(task.alert.escalated_at)}
      </span>
    </div>
  );
}

const columns = [
  dataColumn({ id: "openedSince", header: "Abierta", width: 140, render: openedSince }),
  dataColumn({
    id: "task",
    header: "Tarea",
    render: (task: FiscalTaskItem) => (
      <TableCellText description={fiscalTaskDescription(task)}>
        {fiscalTaskTitle(task)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "register",
    header: "Caja",
    width: 120,
    render: (task: FiscalTaskItem) => task.register_name,
  }),
  dataColumn({ id: "alert", header: "Aviso", width: 210, render: alertCell }),
] as const;

export function FiscalTasksScreen({ onSessionEnded, services }: FiscalTasksScreenProps) {
  const data = useFiscalTasksQuery({
    fetchFiscalTasks: services.fetchFiscalTasks,
    onSessionEnded,
  });
  const tasks = data.status === "loaded" ? data.value.tasks : NO_TASKS;
  const table = useTableModel({ items: tasks, id: (task) => task.id, columns });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Caja y fiscal · Tareas" title="Tareas fiscales" />}
      bodyClassName="gap-4 p-6"
    >
      <Table
        aria-label="Tareas fiscales"
        table={table}
        {...cloudTableState(data, "las tareas fiscales")}
        empty={{
          icon: <ListChecks />,
          title: "Sin tareas fiscales abiertas",
          description:
            "Aparecen acá cuando hay que resolver a mano un comprobante o una venta diferida vencida.",
          variant: "blank",
        }}
        footer={
          tasks.length === 0 ? undefined : (
            <p className="text-text-subtle text-detail">{openFiscalTasksCountText(tasks.length)}</p>
          )
        }
      />
    </ScreenLayout>
  );
}
