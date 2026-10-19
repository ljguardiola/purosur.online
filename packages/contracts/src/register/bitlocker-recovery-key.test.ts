import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type BitlockerRecoveryKeyBody,
  type BitlockerRecoveryKeyLoadBody,
  bitlockerRecoveryKeyLoadBodySchema,
  bitlockerRecoveryKeySchema,
} from "./bitlocker-recovery-key.js";

const loadBody = {
  recovery_key: "000011-000022-000033-000044-000055-000066-000077-000088",
  key_identifier: "8F3A2C1D",
};

describe("bitlockerRecoveryKeyLoadBodySchema", () => {
  it("accepts a recovery key and its identifier", () => {
    expect(bitlockerRecoveryKeyLoadBodySchema.safeParse(loadBody).data).toEqual(loadBody);
  });

  it("strips keys it does not define", () => {
    expect(
      bitlockerRecoveryKeyLoadBodySchema.safeParse({ ...loadBody, register_id: "abc" }).data,
    ).toEqual(loadBody);
  });

  it.each(["recovery_key", "key_identifier"])("requires %s", (field) => {
    expect(
      bitlockerRecoveryKeyLoadBodySchema.safeParse({ ...loadBody, [field]: undefined }).success,
    ).toBe(false);
  });

  it.each([
    "000011-000022-000033-000044-000055-000066-000077",
    "000011-000022-000033-000044-000055-000066-000077-000089",
    "000011-000022-000033-000044-000055-000066-000077-720896",
    "000011000022000033000044000055000066000077000088",
    "",
    7,
    null,
  ])("refuses the recovery key %j", (recoveryKey) => {
    expect(
      bitlockerRecoveryKeyLoadBodySchema.safeParse({ ...loadBody, recovery_key: recoveryKey })
        .success,
    ).toBe(false);
  });

  it.each(["8F3A2C1", "8f3a2c1d", "8F3A2C1G", "", 12345678, null])(
    "refuses the key identifier %j",
    (keyIdentifier) => {
      expect(
        bitlockerRecoveryKeyLoadBodySchema.safeParse({ ...loadBody, key_identifier: keyIdentifier })
          .success,
      ).toBe(false);
    },
  );

  it("does not repeat the refused key in its issues", () => {
    const refused = "000011-000022-000033-000044-000055-000066-000077-000089";

    const result = bitlockerRecoveryKeyLoadBodySchema.safeParse({
      ...loadBody,
      recovery_key: refused,
    });

    expect(JSON.stringify(result.error?.issues)).not.toContain(refused);
  });

  it("types its input as the wire shape", () => {
    expectTypeOf<BitlockerRecoveryKeyLoadBody>().toEqualTypeOf<{
      recovery_key: string;
      key_identifier: string;
    }>();
  });
});

describe("bitlockerRecoveryKeySchema", () => {
  it("accepts a recovery key with its identifier", () => {
    expect(bitlockerRecoveryKeySchema.safeParse(loadBody).data).toEqual(loadBody);
  });

  it("strips keys it does not define", () => {
    expect(
      bitlockerRecoveryKeySchema.safeParse({ ...loadBody, installation_id: "abc" }).data,
    ).toEqual(loadBody);
  });

  it.each(["recovery_key", "key_identifier"])("requires %s", (field) => {
    expect(bitlockerRecoveryKeySchema.safeParse({ ...loadBody, [field]: undefined }).success).toBe(
      false,
    );
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<BitlockerRecoveryKeyBody>().toEqualTypeOf<{
      recovery_key: string;
      key_identifier: string;
    }>();
  });
});
