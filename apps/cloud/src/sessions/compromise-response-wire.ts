import { type CompromiseResponseBody, compromiseResponseSchema } from "@purosur/contracts";
import type { CompromiseResponseView } from "@purosur/domain/sessions/use-cases";

export function compromiseResponseWire(view: CompromiseResponseView): CompromiseResponseBody {
  return compromiseResponseSchema.parse({
    id: view.id,
    started_at: view.startedAt.toISOString(),
    started_by: view.startedBy,
    completed: view.completed,
    steps: view.steps.map(({ step, done, doneAt, available }) => ({
      step,
      done,
      done_at: doneAt?.toISOString() ?? null,
      available,
    })),
    items: view.items.map(({ item, step, done, doneAt }) => ({
      item,
      step,
      done,
      done_at: doneAt?.toISOString() ?? null,
    })),
  });
}
