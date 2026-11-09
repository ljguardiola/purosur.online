import { externalBillingObservation } from "@purosur/domain";
import type { OpenAlertStanding, OpenAlertStandingReader } from "@purosur/domain/alerts/use-cases";
import type { OpenFiscalTask } from "@purosur/domain/fiscal/use-cases";

export type FiscalTaskAlert = Omit<OpenAlertStanding, "scope">;

type ExternalInvoicingTask = Extract<OpenFiscalTask, { kind: "external_invoicing" }>;

function externalBillingScope({
  pointOfSale,
  documentType,
  number,
}: ExternalInvoicingTask): string {
  const observation = externalBillingObservation({ pointOfSale, documentType, number });
  if (!observation.holds) {
    throw new Error("an invoicing outside the register always holds an alert");
  }
  return observation.alert.scope;
}

export async function openFiscalTaskAlerts(
  standings: OpenAlertStandingReader,
  tasks: readonly OpenFiscalTask[],
): Promise<Map<string, FiscalTaskAlert>> {
  const taskIdsByScope = new Map(
    tasks.flatMap((task) =>
      task.kind === "external_invoicing" ? [[externalBillingScope(task), task.id] as const] : [],
    ),
  );
  const open = await standings.openAlertsOfScopes("external_billing", [...taskIdsByScope.keys()]);
  return new Map(
    open.flatMap(({ scope, level, escalatedAt }) => {
      const taskId = taskIdsByScope.get(scope);
      return taskId === undefined ? [] : [[taskId, { level, escalatedAt }] as const];
    }),
  );
}
