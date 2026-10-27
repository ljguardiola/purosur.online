import { expect, test } from "vitest";
import {
  fiscalTaskDescription,
  fiscalTaskTitle,
  openFiscalTasksCountText,
} from "./fiscal-task-text";
import {
  creditNoteRejectedTask,
  deferredSaleExpiredTask,
  externalInvoicingTask,
} from "./test-support/fiscal-task-fixtures";

test("names a voucher issued outside the system", () => {
  expect(fiscalTaskTitle(externalInvoicingTask)).toBe("Facturación externa");
  expect(fiscalTaskDescription(externalInvoicingTask)).toBe(
    "Comprobante 00004-00001234 autorizado por ARCA fuera del sistema",
  );
});

test("names a credit note issued outside the system as a credit note", () => {
  const task = { ...externalInvoicingTask, document_type: "credit_note_c" } as const;

  expect(fiscalTaskDescription(task)).toBe(
    "Nota de crédito 00004-00001234 autorizada por ARCA fuera del sistema",
  );
});

test("names a credit note ARCA rejected", () => {
  expect(fiscalTaskTitle(creditNoteRejectedTask)).toBe("Nota de crédito rechazada");
  expect(fiscalTaskDescription(creditNoteRejectedTask)).toBe(
    "ARCA rechazó la nota de crédito 00004-00000017",
  );
});

test("names a credit note that has no number and needs regularization", () => {
  const task = { ...creditNoteRejectedTask, number: null, rejections: [] };

  expect(fiscalTaskTitle(task)).toBe("Nota de crédito a regularizar");
  expect(fiscalTaskDescription(task)).toBe(
    "La nota de crédito no pudo emitirse con su fecha y debe regularizarse ante ARCA",
  );
});

test("names an expired deferred sale with the day of the sale and its total", () => {
  expect(fiscalTaskTitle(deferredSaleExpiredTask)).toBe("Venta diferida vencida");
  expect(fiscalTaskDescription(deferredSaleExpiredTask)).toBe(
    "Venta del 06/09/2026 por $ 18.200,00 que no llegó a facturarse",
  );
});

test.each([
  [1, "1 tarea abierta"],
  [3, "3 tareas abiertas"],
  [1200, "1.200 tareas abiertas"],
])("counts %i open tasks as %s", (count, text) => {
  expect(openFiscalTasksCountText(count)).toBe(text);
});
