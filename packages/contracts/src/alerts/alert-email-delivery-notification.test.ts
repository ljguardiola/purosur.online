import { describe, expect, it } from "vitest";
import { alertEmailDeliveryNotificationSchema } from "./alert-email-delivery-notification.js";

describe("alertEmailDeliveryNotificationSchema", () => {
  it("accepts an email event with the id of the email it is about, dropping what it does not define", () => {
    expect(
      alertEmailDeliveryNotificationSchema.safeParse({
        type: "email.bounced",
        created_at: "2026-10-01T11:59:00.000Z",
        data: { email_id: "email-1", subject: "Alerta" },
      }).data,
    ).toEqual({ type: "email.bounced", data: { email_id: "email-1" } });
  });

  it.each(["domain.updated", "contact.created", "email", "emails.sent"])(
    "accepts an event of type %s, which is not about an email, with no email id",
    (type) => {
      expect(alertEmailDeliveryNotificationSchema.safeParse({ type, data: {} }).data).toEqual({
        type,
      });
    },
  );

  it.each([
    ["an email event with no email id", { type: "email.bounced", data: {} }],
    ["an email event with no data", { type: "email.bounced" }],
    ["an email event with an empty email id", { type: "email.bounced", data: { email_id: "" } }],
    ["an email event whose email id is not text", { type: "email.bounced", data: { email_id: 7 } }],
    ["an event with no type", { data: { email_id: "email-1" } }],
    ["an event whose type is not text", { type: 3, data: { email_id: "email-1" } }],
    ["a body that is not an object", null],
  ])("refuses %s", (_case, body) => {
    expect(alertEmailDeliveryNotificationSchema.safeParse(body).success).toBe(false);
  });
});
