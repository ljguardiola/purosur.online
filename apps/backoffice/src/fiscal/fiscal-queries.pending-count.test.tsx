import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { usePendingFiscalTasksCount } from "./fiscal-queries";
import { fiscalTasks, noFiscalTasks } from "./test-support/fiscal-task-fixtures";

function Probe({
  enabled,
  fetchFiscalTasks,
}: {
  enabled: boolean;
  fetchFiscalTasks: Parameters<typeof usePendingFiscalTasksCount>[0]["fetchFiscalTasks"];
}) {
  const count = usePendingFiscalTasksCount({ enabled, fetchFiscalTasks, onSessionEnded: () => {} });
  return <p>{count.status === "loaded" ? `${count.value} fiscal tasks` : count.status}</p>;
}

test("counts the open fiscal tasks the cloud answers", async () => {
  const fetchFiscalTasks = vi.fn().mockResolvedValue({ kind: "ok", value: fiscalTasks });

  const screen = await render(<Probe enabled fetchFiscalTasks={fetchFiscalTasks} />);

  await expect
    .element(screen.getByText(`${fiscalTasks.tasks.length} fiscal tasks`))
    .toBeInTheDocument();
});

test("counts zero when no fiscal task is open", async () => {
  const fetchFiscalTasks = vi.fn().mockResolvedValue({ kind: "ok", value: noFiscalTasks });

  const screen = await render(<Probe enabled fetchFiscalTasks={fetchFiscalTasks} />);

  await expect.element(screen.getByText("0 fiscal tasks")).toBeInTheDocument();
});

test("asks the cloud for nothing while not enabled", async () => {
  const fetchFiscalTasks = vi.fn().mockResolvedValue({ kind: "ok", value: fiscalTasks });

  const screen = await render(<Probe enabled={false} fetchFiscalTasks={fetchFiscalTasks} />);

  await expect.element(screen.getByText("loading")).toBeInTheDocument();
  expect(fetchFiscalTasks).not.toHaveBeenCalled();
});
