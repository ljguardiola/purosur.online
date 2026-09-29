import { describe, expect, it } from "vitest";
import { alertDetailSchema } from "./alert-detail.js";

const delivery = {
  channel: "backoffice",
  status: "sent",
  error: null,
  createdAt: "2026-05-04T13:10:05.000Z",
  recipient: {
    id: "user-2",
    firstName: "Lucía",
    role: { id: "role-1", name: "Administrador", isAdministrator: true },
  },
};
const emailChange = {
  id: "alert-1",
  kind: "user_email_changed",
  scope: "user-1",
  scopeDisplay: "Marcela",
  level: "warning",
  audience: "all",
  detail: { previousEmail: "a@example.com", newEmail: "b@example.com", failureCount: 3 },
  openedAt: "2026-05-04T13:10:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  deliveries: [delivery],
};

describe("alertDetailSchema", () => {
  it("accepts an alert with deliveries and one without", () => {
    expect(alertDetailSchema.safeParse(emailChange).data).toEqual(emailChange);
    expect(alertDetailSchema.safeParse({ ...emailChange, deliveries: [] }).data).toEqual({
      ...emailChange,
      deliveries: [],
    });
  });

  it("accepts a closed alert without a scope and a failed delivery with its error", () => {
    const closed = {
      ...emailChange,
      scope: null,
      scopeDisplay: null,
      resolvedAt: "2026-05-04T15:10:00.000Z",
      escalatedAt: "2026-05-04T14:10:00.000Z",
      deliveries: [
        { ...delivery, status: "failed", error: "sin conexión" },
        {
          ...delivery,
          recipient: { ...delivery.recipient, role: { ...delivery.recipient.role, name: null } },
        },
      ],
    };

    expect(alertDetailSchema.safeParse(closed).data).toEqual(closed);
  });

  it("keeps whatever the kind's own detail holds", () => {
    const withDetail = { ...emailChange, detail: { nested: { list: [1, "two", null] } } };

    expect(alertDetailSchema.safeParse(withDetail).data).toEqual(withDetail);
  });

  it("strips keys it does not define, also inside a delivery, its recipient and its role", () => {
    expect(
      alertDetailSchema.safeParse({
        ...emailChange,
        secret: 1,
        deliveries: [
          {
            ...delivery,
            id: "delivery-1",
            recipient: {
              ...delivery.recipient,
              email: "x@example.com",
              role: { ...delivery.recipient.role, permissions: [] },
            },
          },
        ],
      }).data,
    ).toEqual(emailChange);
  });

  it.each(Object.keys(emailChange))("requires %s", (field) => {
    const { [field as keyof typeof emailChange]: _omitted, ...rest } = emailChange;

    expect(alertDetailSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["kind", 1],
    ["level", "info"],
    ["audience", "everyone"],
    ["scope", 1],
    ["scopeDisplay", undefined],
    ["detail", null],
    ["detail", []],
    ["detail", "{}"],
    ["openedAt", 1],
    ["escalatedAt", undefined],
    ["resolvedAt", undefined],
    ["deliveries", null],
    ["deliveries", {}],
  ])("refuses %s as %j", (field, value) => {
    expect(alertDetailSchema.safeParse({ ...emailChange, [field]: value }).success).toBe(false);
  });

  const deliveryFields = ["channel", "status", "error", "createdAt", "recipient"];
  it.each(deliveryFields)("requires a delivery's %s", (field) => {
    const { [field as keyof typeof delivery]: _omitted, ...rest } = delivery;

    expect(alertDetailSchema.safeParse({ ...emailChange, deliveries: [rest] }).success).toBe(false);
  });

  it.each([
    ["channel", 1],
    ["status", null],
    ["error", undefined],
    ["error", 1],
    ["createdAt", 1],
    ["recipient", null],
  ])("refuses a delivery's %s as %j", (field, value) => {
    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, [field]: value }] })
        .success,
    ).toBe(false);
  });

  it.each(["id", "firstName", "role"])("requires a recipient's %s", (field) => {
    const { [field as keyof typeof delivery.recipient]: _omitted, ...recipient } =
      delivery.recipient;

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["id", 1],
    ["firstName", null],
    ["role", null],
  ])("refuses a recipient's %s as %j", (field, value) => {
    const recipient = { ...delivery.recipient, [field]: value };

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each(["id", "name", "isAdministrator"])("requires a role's %s", (field) => {
    const { [field as keyof typeof delivery.recipient.role]: _omitted, ...role } =
      delivery.recipient.role;
    const recipient = { ...delivery.recipient, role };

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["id", 1],
    ["name", 1],
    ["name", undefined],
    ["isAdministrator", "true"],
  ])("refuses a role's %s as %j", (field, value) => {
    const recipient = {
      ...delivery.recipient,
      role: { ...delivery.recipient.role, [field]: value },
    };

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each([undefined, null, [], "alert"])("refuses %j as an alert", (body) => {
    expect(alertDetailSchema.safeParse(body).success).toBe(false);
  });
});
