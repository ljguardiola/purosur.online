import type { RegisterPurchaseOutcome } from "@purosur/domain/purchasing/use-cases";
import type { FastifyReply } from "fastify";

export type PurchaseRefusal = Exclude<RegisterPurchaseOutcome, { kind: "registered" }>;

function lineDetails(lineIndex: number) {
  return [{ field: "lines", lineIndex }];
}

export async function sendPurchaseRefusal(
  reply: FastifyReply,
  refusal: PurchaseRefusal,
): Promise<void> {
  switch (refusal.kind) {
    case "no_lines":
      await reply.code(400).send({
        code: "validation_failed",
        message: "a purchase needs at least one line",
        details: [{ field: "lines" }],
      });
      return;
    case "date_in_future":
      await reply.code(400).send({
        code: "validation_failed",
        message: "a purchase cannot be dated in the future",
        details: [{ field: "purchasedOn" }],
      });
      return;
    case "supplier_not_found":
      await reply
        .code(404)
        .send({ code: "supplier_not_found", message: "no supplier with that id" });
      return;
    case "supplier_inactive":
      await reply
        .code(409)
        .send({ code: "supplier_inactive", message: "the supplier is deactivated" });
      return;
    case "product_not_found":
      await reply.code(404).send({
        code: "product_not_found",
        message: "no product with that id",
        details: lineDetails(refusal.lineIndex),
      });
      return;
    case "product_inactive":
      await reply.code(409).send({
        code: "product_inactive",
        message: "the product is deactivated",
        details: lineDetails(refusal.lineIndex),
      });
      return;
    case "invalid_quantity":
      await reply.code(400).send({
        code: "validation_failed",
        message: "the line's quantity is not one its product may be received in",
        details: lineDetails(refusal.lineIndex),
      });
      return;
  }
}
