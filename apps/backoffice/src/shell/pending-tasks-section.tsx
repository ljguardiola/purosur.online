import { CountCard, EmptyState, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { useId } from "react";
import { usePendingFiscalTasksCount } from "../fiscal/fiscal-queries";
import type { fetchFiscalTasks } from "../fiscal/fiscal-tasks-api";
import { usePendingRefundCounts } from "../payments/payments-queries";
import type { fetchPendingRefunds } from "../payments/refunds-api";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { mapCloudData } from "../platform/map-cloud-data";
import { type PagePart, pagePartsFor } from "../platform/page-parts";
import type { CloudData } from "../platform/use-cloud-query";
import type { fetchPrices } from "../pricing/prices-api";
import { usePendingPricesCount } from "../pricing/pricing-queries";
import {
  type BackofficeAccess,
  canSeeFiscalInformation,
  canSeePricesArea,
  canSeeRefundsArea,
} from "./backoffice-access";

const CountCardLink = createLink(CountCard);

export type PendingTasksSectionServices = {
  fetchFiscalTasks: typeof fetchFiscalTasks;
  fetchPendingRefunds: typeof fetchPendingRefunds;
  fetchPrices: typeof fetchPrices;
};

export type PendingTasksSectionProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: PendingTasksSectionServices;
};

type TaskKey = "fiscal" | "mercado-pago-refunds" | "outside-refunds" | "prices";

const TASK_PARTS: readonly PagePart<BackofficeAccess, TaskKey>[] = [
  { key: "fiscal", isVisibleTo: canSeeFiscalInformation },
  { key: "mercado-pago-refunds", isVisibleTo: canSeeRefundsArea },
  { key: "outside-refunds", isVisibleTo: canSeeRefundsArea },
  { key: "prices", isVisibleTo: canSeePricesArea },
];

type Task = {
  key: TaskKey;
  label: string;
  subject: string;
  count: CloudData<number>;
} & (
  | { to: "/fiscal" | "/products/prices" }
  | { to: "/refunds"; channel: "mercado-pago" | "without-api" }
);

function TaskCard({ task }: { task: Task }) {
  if (task.count.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (task.count.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(task.count, task.subject)} />;
  }
  return task.to === "/refunds" ? (
    <CountCardLink
      to="/refunds"
      search={{ channel: task.channel }}
      label={task.label}
      count={task.count.value}
      tone="warning"
    />
  ) : (
    <CountCardLink to={task.to} label={task.label} count={task.count.value} tone="warning" />
  );
}

function PendingTasks({
  visible,
  onSessionEnded,
  services,
}: Omit<PendingTasksSectionProps, "access"> & { visible: readonly TaskKey[] }) {
  const headingId = useId();
  const fiscal = usePendingFiscalTasksCount({
    enabled: visible.includes("fiscal"),
    fetchFiscalTasks: services.fetchFiscalTasks,
    onSessionEnded,
  });
  const refunds = usePendingRefundCounts({
    enabled: visible.includes("mercado-pago-refunds") || visible.includes("outside-refunds"),
    fetchPendingRefunds: services.fetchPendingRefunds,
    onSessionEnded,
  });
  const prices = usePendingPricesCount({
    enabled: visible.includes("prices"),
    fetchPrices: services.fetchPrices,
    onSessionEnded,
  });
  const mercadoPagoRefunds = mapCloudData(refunds, (counts) => counts.mercadoPago);
  const outsideRefunds = mapCloudData(refunds, (counts) => counts.outsideTheSystem);
  const refundsFailureShownOnce =
    outsideRefunds.status === "failed" && visible.includes("mercado-pago-refunds");
  const candidates: Task[] = [
    {
      key: "fiscal",
      label: "Tareas fiscales",
      subject: "las tareas fiscales",
      to: "/fiscal",
      count: fiscal,
    },
    {
      key: "mercado-pago-refunds",
      label: "Reembolsos por Mercado Pago",
      subject: "los reembolsos",
      to: "/refunds",
      channel: "mercado-pago",
      count: mercadoPagoRefunds,
    },
    {
      key: "outside-refunds",
      label: "Reembolsos fuera del sistema",
      subject: "los reembolsos",
      to: "/refunds",
      channel: "without-api",
      count: outsideRefunds,
    },
    {
      key: "prices",
      label: "Precios a revisar",
      subject: "los precios a revisar",
      to: "/products/prices",
      count: prices,
    },
  ];
  const tasks = candidates.filter(
    (task) =>
      visible.includes(task.key) &&
      !(task.count.status === "loaded" && task.count.value === 0) &&
      !(task.key === "outside-refunds" && refundsFailureShownOnce),
  );
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-subheading text-text">
        Tareas pendientes
      </h2>
      {tasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No hay tareas pendientes"
          description="Cuando haya trabajo por hacer, aparece acá."
          variant="blank"
        />
      ) : (
        <ul className="grid grid-cols-3 gap-4">
          {tasks.map((task) => (
            <li key={task.key} className="grid">
              <TaskCard task={task} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PendingTasksSection({
  access,
  onSessionEnded,
  services,
}: PendingTasksSectionProps) {
  const parts = pagePartsFor(access, TASK_PARTS);
  return parts.kind === "hidden" ? null : (
    <PendingTasks visible={parts.visible} onSessionEnded={onSessionEnded} services={services} />
  );
}
