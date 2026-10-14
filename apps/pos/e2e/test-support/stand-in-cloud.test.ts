import { approvedOrdersOfRegisterSchema, deviceEnrollmentSchema } from "@purosur/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { type StandInCloud, startStandInCloud } from "./stand-in-cloud";

let cloud: StandInCloud | undefined;

afterEach(async () => {
  await cloud?.stop();
  cloud = undefined;
});

async function enrolledToken(standIn: StandInCloud): Promise<string> {
  const response = await fetch(`${standIn.url}/api/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: standIn.enrollmentCode,
      hostname: "CAJA-MOSTRADOR",
      windows_version: "Windows 11 Pro 10.0.26100",
    }),
  });
  return deviceEnrollmentSchema.parse(await response.json()).device_token;
}

describe("the stand-in cloud", () => {
  it("answers the register's approved orders as none, so its paid-order check ends checked", async () => {
    cloud = await startStandInCloud([]);
    const token = await enrolledToken(cloud);

    const response = await fetch(`${cloud.url}/api/payments/mercado-pago/approved`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(approvedOrdersOfRegisterSchema.parse(await response.json())).toEqual({ orders: [] });
  });
});
