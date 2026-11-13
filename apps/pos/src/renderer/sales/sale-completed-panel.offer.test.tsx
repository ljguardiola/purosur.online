import type { AnswerReceiptQuestionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  CASH,
  expectAlertText,
  found,
  renderPanel,
  ticketOf,
} from "./test-support/sale-completed-panel";

afterEach(() => {
  vi.useRealTimers();
});

describe("SaleCompletedPanel asking whether to print the customer's ticket", () => {
  const awaiting = async () => found("awaiting_answer");

  it("asks with the question, a 10 s countdown and Sí and Omitir with their keys, keeping the change and the amounts visible", async () => {
    const { screen } = await renderPanel(CASH, { readReceiptStatus: awaiting });

    await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
    await expect.element(screen.getByRole("group", { name: "¿Imprimir ticket?" })).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByRole("timer")).toHaveTextContent("10 s");
    const yes = screen.getByRole("button", { name: "Sí" });
    const skip = screen.getByRole("button", { name: "Omitir" });
    expect((yes.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("Enter");
    expect((skip.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("Esc");
    await expect
      .element(screen.getByRole("button", { name: "Nueva venta" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "No" })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("leaves out the ticket row while it asks, since the question already names the ticket", async () => {
    const { screen } = await renderPanel(CASH, { readReceiptStatus: awaiting });

    await expect.element(screen.getByRole("group", { name: "¿Imprimir ticket?" })).toBeVisible();
    await expect.element(screen.getByText("Ticket", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Imprimiendo")).not.toBeInTheDocument();
  });

  it("counts down the seconds left the core reports at each reading", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const readings = [10_000, 9000, 8000].map((remaining_ms) =>
      found("awaiting_answer", { offer: { remaining_ms, length_ms: 10_000 } }),
    );
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: async () => readings.shift() ?? found("awaiting_answer"),
    });
    await expect.element(screen.getByRole("timer")).toHaveTextContent("10 s");

    await vi.advanceTimersByTimeAsync(1000);
    await expect.element(screen.getByRole("timer")).toHaveTextContent("9 s");

    await vi.advanceTimersByTimeAsync(1000);
    await expect.element(screen.getByRole("timer")).toHaveTextContent("8 s");
  });

  it("asks the core again when the time it reported left reaches the next whole second", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { screen, readReceiptStatus } = await renderPanel(CASH, {
      readReceiptStatus: async () =>
        found("awaiting_answer", { offer: { remaining_ms: 9600, length_ms: 10_000 } }),
    });
    await expect.element(screen.getByRole("timer")).toHaveTextContent("10 s");
    const readsBefore = readReceiptStatus.mock.calls.length;

    await vi.advanceTimersByTimeAsync(599);
    expect(readReceiptStatus.mock.calls.length).toBe(readsBefore);

    await vi.advanceTimersByTimeAsync(1);
    expect(readReceiptStatus.mock.calls.length).toBe(readsBefore + 1);
  });

  it("shows the length of the offer the core reports, not a length of its own", async () => {
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: async () =>
        found("awaiting_answer", { offer: { remaining_ms: 5000, length_ms: 5000 } }),
    });

    await expect.element(screen.getByRole("timer")).toHaveTextContent("5 s");
  });

  it("starts the countdown from the time the core says is left, rounded up to whole seconds", async () => {
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: async () =>
        found("awaiting_answer", { offer: { remaining_ms: 1200, length_ms: 3000 } }),
    });

    await expect.element(screen.getByRole("timer")).toHaveTextContent("2 s");
  });

  it("keeps Nueva venta disabled, with the ticket shown as printing, while the core prepares the ticket", async () => {
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => found("preparing"),
    });

    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(onNewSale).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole("group", { name: "¿Imprimir ticket?" }))
      .not.toBeInTheDocument();
  });

  it("offers a new sale once the core prints a ticket it prepared without asking", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const answers = [found("preparing"), found("printing")];
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => answers.shift() ?? found("printing"),
    });
    await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeDisabled();

    await vi.advanceTimersByTimeAsync(1000);

    await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Nueva venta" }));
    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it("prints the ticket with Enter", async () => {
    const { screen, answerReceiptQuestion } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
    });
    await expect.element(screen.getByRole("button", { name: "Sí" })).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => answerReceiptQuestion.mock.calls).toEqual([["sale-1", true]]);
  });

  it("prints the ticket when the cashier presses Sí", async () => {
    const { screen, answerReceiptQuestion } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
    });

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));

    await expect.poll(() => answerReceiptQuestion.mock.calls).toEqual([["sale-1", true]]);
  });

  it("answers no and starts a new sale with Esc", async () => {
    const { screen, answerReceiptQuestion, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
    });
    await expect.element(screen.getByRole("button", { name: "Sí" })).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => answerReceiptQuestion.mock.calls).toEqual([["sale-1", false]]);
    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it("answers no and starts a new sale when the cashier presses Omitir", async () => {
    const { screen, answerReceiptQuestion, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
    });

    await userEvent.click(screen.getByRole("button", { name: "Omitir" }));

    await expect.poll(() => answerReceiptQuestion.mock.calls).toEqual([["sale-1", false]]);
    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it("starts the new sale once even when the core then reports the ticket declined", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let status = found("awaiting_answer");
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => status,
      answerReceiptQuestion: async () => {
        status = found("declined");
        return { kind: "declined" };
      },
    });
    await expect.element(screen.getByRole("button", { name: "Omitir" })).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await vi.advanceTimersByTimeAsync(3000);

    expect(onNewSale).toHaveBeenCalledOnce();
  });

  it("starts a new sale without printing when the core reports the offer lapsed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let status = found("awaiting_answer");
    const { screen, onNewSale, answerReceiptQuestion } = await renderPanel(CASH, {
      readReceiptStatus: async () => status,
    });
    await expect.element(screen.getByRole("timer")).toHaveTextContent("10 s");
    expect(onNewSale).not.toHaveBeenCalled();

    status = found("declined");
    await vi.advanceTimersByTimeAsync(1000);

    await expect.poll(() => onNewSale.mock.calls.length).toBe(1);
    expect(answerReceiptQuestion).not.toHaveBeenCalled();
  });

  it("counts no time of its own, keeping the offer open with the time the core still reports", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { screen, onNewSale } = await renderPanel(CASH, { readReceiptStatus: awaiting });
    await expect.element(screen.getByRole("timer")).toHaveTextContent("10 s");

    await vi.advanceTimersByTimeAsync(11_000);

    await expect.element(screen.getByRole("timer")).toHaveTextContent("10 s");
    expect(onNewSale).not.toHaveBeenCalled();
  });

  it("starts a new sale without printing when the core answers Sí too late", async () => {
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
      answerReceiptQuestion: async () => ({ kind: "lapsed" }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));

    await expect.poll(() => onNewSale.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it("disables both answers while one is being sent, and sends it once", async () => {
    let resolveAnswer: (outcome: AnswerReceiptQuestionOutcome) => void = () => {};
    const pending = new Promise<AnswerReceiptQuestionOutcome>((resolve) => {
      resolveAnswer = resolve;
    });
    const { screen, answerReceiptQuestion, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
      answerReceiptQuestion: () => pending,
    });

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));

    await expect.element(screen.getByRole("button", { name: "Sí" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Omitir" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Enter}");
    expect(answerReceiptQuestion).toHaveBeenCalledTimes(1);
    expect(onNewSale).not.toHaveBeenCalled();
    resolveAnswer({ kind: "printing" });
  });

  it("goes on to the printing flow once the core prints the ticket, and then offers a new sale with Enter", async () => {
    let status = found("awaiting_answer");
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => status,
      answerReceiptQuestion: async () => {
        status = found("printing");
        return { kind: "printing" };
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));

    await expect.element(screen.getByText("Imprimiendo")).toBeVisible();
    status = found("printed", { printed: true });
    await expect.element(screen.getByText("Impreso")).toBeVisible();
    const newSale = screen.getByRole("button", { name: "Nueva venta" });
    expect((newSale.element() as HTMLElement).querySelector("kbd")?.textContent).toBe("Enter");
    await userEvent.keyboard("{Enter}");
    expect(onNewSale).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the contingency backup ticket row when the customer's copy was declined", async () => {
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: async () =>
        found("declined", {
          comprobante: {
            kind: "fiscal",
            document_type: "factura_c",
            authorization: "offline_code",
            point_of_sale: 8,
            number: 412,
          },
        }),
      readBackupTicket: async () => ticketOf("to_print"),
    });

    await expect.element(screen.getByText("Ticket de respaldo de contingencia")).toBeVisible();
    await expect.element(screen.getByText("Factura C", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("No impreso")).toBeVisible();
  });

  it("shows a ticket declined before the panel was opened as not printed, and offers a new sale without leaving by itself", async () => {
    const { screen, onNewSale } = await renderPanel(CASH, {
      readReceiptStatus: async () => found("declined"),
    });

    await expect.element(screen.getByText("No impreso")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeEnabled();
    expect(onNewSale).not.toHaveBeenCalled();
  });

  it("only refreshes the status when the core says it was not waiting for an answer", async () => {
    let status = found("awaiting_answer");
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: async () => status,
      answerReceiptQuestion: async () => {
        status = found("printed", { printed: true });
        return { kind: "not_awaiting" };
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));

    await expect.element(screen.getByText("Impreso")).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeVisible();
  });

  it.each(["not_signed_in", "not_found", "unavailable"] as const)(
    "tells the cashier the answer was not sent on %s and lets them answer again",
    async (kind) => {
      const outcomes: AnswerReceiptQuestionOutcome[] = [{ kind }, { kind: "printing" }];
      const { screen, answerReceiptQuestion } = await renderPanel(CASH, {
        readReceiptStatus: awaiting,
        answerReceiptQuestion: async () => outcomes.shift() ?? { kind: "printing" },
      });

      await userEvent.click(screen.getByRole("button", { name: "Sí" }));

      await expectAlertText(screen, "No se pudo enviar la respuesta. Probá de nuevo.");
      await expect.element(screen.getByRole("button", { name: "Sí" })).toBeEnabled();
      await expect
        .element(screen.getByRole("button", { name: "Nueva venta" }))
        .not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Sí" }));
      await expect
        .poll(() => answerReceiptQuestion.mock.calls)
        .toEqual([
          ["sale-1", true],
          ["sale-1", true],
        ]);
    },
  );

  it("retries the answer with Enter after one that was not sent", async () => {
    const outcomes: AnswerReceiptQuestionOutcome[] = [
      { kind: "unavailable" },
      { kind: "printing" },
    ];
    const { screen, answerReceiptQuestion } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
      answerReceiptQuestion: async () => outcomes.shift() ?? { kind: "printing" },
    });
    await expect.element(screen.getByRole("button", { name: "Sí" })).toBeVisible();

    await userEvent.keyboard("{Enter}");
    await expectAlertText(screen, "No se pudo enviar la respuesta. Probá de nuevo.");
    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => answerReceiptQuestion.mock.calls)
      .toEqual([
        ["sale-1", true],
        ["sale-1", true],
      ]);
  });

  it("tells the cashier the answer was not sent when the request itself fails", async () => {
    const { screen } = await renderPanel(CASH, {
      readReceiptStatus: awaiting,
      answerReceiptQuestion: async () => {
        throw new Error("port closed");
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));

    await expectAlertText(screen, "No se pudo enviar la respuesta. Probá de nuevo.");
  });

  it.each<[string, () => Promise<AnswerReceiptQuestionOutcome>]>([
    ["came back unavailable", async () => ({ kind: "unavailable" })],
    [
      "failed",
      async () => {
        throw new Error("port closed");
      },
    ],
  ])(
    "starts a new sale without printing when the core lapses the offer after an answer that %s",
    async (_, answerReceiptQuestion) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      let status = found("awaiting_answer");
      const { screen, onNewSale } = await renderPanel(CASH, {
        readReceiptStatus: async () => status,
        answerReceiptQuestion,
      });

      await userEvent.click(screen.getByRole("button", { name: "Sí" }));
      await expectAlertText(screen, "No se pudo enviar la respuesta. Probá de nuevo.");
      expect(onNewSale).not.toHaveBeenCalled();

      status = found("declined");
      await vi.advanceTimersByTimeAsync(1000);

      await expect.poll(() => onNewSale.mock.calls.length).toBe(1);
    },
  );

  it.each([
    ["not decided yet", () => found(null)],
    ["printing", () => found("printing")],
    ["printed", () => found("printed", { printed: true })],
    [
      "a deferred sale's document",
      () => found("printing", { comprobante: { kind: "deferred_non_fiscal" } }),
    ],
  ])("never asks when the status is %s", async (_name, status) => {
    const { screen, answerReceiptQuestion } = await renderPanel(CASH, {
      readReceiptStatus: async () => status(),
    });

    await expect.element(screen.getByRole("button", { name: "Nueva venta" })).toBeVisible();
    await expect
      .element(screen.getByRole("group", { name: "¿Imprimir ticket?" }))
      .not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(answerReceiptQuestion).not.toHaveBeenCalled();
  });
});
