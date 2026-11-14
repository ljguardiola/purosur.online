import { ticketReferenceFromQrText } from "@purosur/domain";
import { z } from "zod";

const QR_MESSAGE = "text must be the QR of a sale's ticket";

export const scannedTicketTextSchema = z
  .string({ error: QR_MESSAGE })
  .transform((text, context) => {
    const ticket = ticketReferenceFromQrText(text);
    if (ticket === null) {
      context.addIssue({ code: "custom", message: QR_MESSAGE });
      return z.NEVER;
    }
    return ticket;
  });
