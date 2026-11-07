export interface MercadoPagoScrubReplacement {
  field: string;
  count: number;
}

export interface MercadoPagoScrubResult {
  value: unknown;
  replacements: MercadoPagoScrubReplacement[];
}

export interface MercadoPagoRecordingSecrets {
  accessToken: string;
  accountId: string;
  externalPosId: string;
  terminalId: string;
  externalReferences: readonly string[];
}

const FICTIONAL_ACCESS_TOKEN = "FICTIONAL-ACCESS-TOKEN";
const FICTIONAL_ACCOUNT_ID = 1_234_567_890;
const FICTIONAL_EXTERNAL_POS_ID = "STORE01POS01";
const FICTIONAL_TERMINAL_ID = "FICTIONAL__SMARTPOS1";
const FICTIONAL_APPLICATION_ID = 1_234_567_890_123_456;
const IDENTIFIER_FIELDS = new Set(["id", "reference_id", "transaction_id"]);
const IDENTIFIER_TEXT = /^(?=[A-Z]*\d)[0-9A-Z]{8,}$/;
const LEADING_LETTERS = /^[A-Z]*/;
const IDENTIFIER_NUMBER_DIGITS = 8;

const idOf = (original: unknown): unknown =>
  typeof original === "number" ? FICTIONAL_ACCOUNT_ID : String(FICTIONAL_ACCOUNT_ID);

const REPLACEMENT_BY_KEY: ReadonlyMap<string, (original: unknown) => unknown> = new Map([
  ["user_id", idOf],
  ["collector_id", idOf],
  [
    "application_id",
    (original) =>
      typeof original === "number" ? FICTIONAL_APPLICATION_ID : String(FICTIONAL_APPLICATION_ID),
  ],
  ["external_pos_id", () => FICTIONAL_EXTERNAL_POS_ID],
  ["terminal_id", () => FICTIONAL_TERMINAL_ID],
  ["qr_data", () => "FICTIONAL-QR-DATA"],
  ["email", () => "comprador@example.com"],
  ["first_name", () => "Nombre"],
  ["last_name", () => "Apellido"],
  ["identification", () => ({ type: "DNI", number: "12345678" })],
  ["phone", () => ({ area_code: "11", number: "12345678" })],
  ["cardholder", () => ({ name: "NOMBRE APELLIDO" })],
  ["card_holder", () => ({ name: "NOMBRE APELLIDO" })],
  ["first_six_digits", () => "000000"],
  ["last_four_digits", () => "0000"],
]);

interface KnownValue {
  field: string;
  original: string;
  fictional: string;
}

function fictionalExternalReference(position: number): string {
  return `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`;
}

function escapedForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isIdentifierNumber(value: number): boolean {
  return Number.isSafeInteger(value) && String(value).length >= IDENTIFIER_NUMBER_DIGITS;
}

function identifierTextOf(key: string, value: unknown): string | undefined {
  if (!IDENTIFIER_FIELDS.has(key)) {
    return undefined;
  }
  if (typeof value === "string" && IDENTIFIER_TEXT.test(value)) {
    return value;
  }
  return typeof value === "number" && isIdentifierNumber(value) ? String(value) : undefined;
}

export function mercadoPagoRecordingScrubber(
  secrets: MercadoPagoRecordingSecrets,
): (value: unknown) => MercadoPagoScrubResult {
  const recordingValues: KnownValue[] = [
    {
      field: "external_pos_id",
      original: secrets.externalPosId,
      fictional: FICTIONAL_EXTERNAL_POS_ID,
    },
    { field: "terminal_id", original: secrets.terminalId, fictional: FICTIONAL_TERMINAL_ID },
    ...secrets.externalReferences.map((original, index) => ({
      field: "external_reference",
      original,
      fictional: fictionalExternalReference(index + 1),
    })),
  ].filter(({ original }) => original !== "");
  const identifiers = new Map<string, KnownValue>();
  const accountIdInText = new RegExp(`(?<!\\d)${escapedForPattern(secrets.accountId)}(?!\\d)`, "g");

  const learnIdentifier = (field: string, original: string, isNumber: boolean) => {
    if (original === secrets.accountId || identifiers.has(original)) {
      return;
    }
    const position = identifiers.size + 1;
    const prefix = LEADING_LETTERS.exec(original)?.[0] ?? "";
    const fictional = isNumber
      ? String(10 ** (original.length - 1) + position)
      : `${prefix}${String(position).padStart(original.length - prefix.length, "0")}`;
    identifiers.set(original, { field, original, fictional });
  };

  const learn = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(learn);
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const identifier = identifierTextOf(key, child);
      if (identifier !== undefined) {
        learnIdentifier(key, identifier, typeof child === "number");
      } else if (!REPLACEMENT_BY_KEY.has(key)) {
        learn(child);
      }
    }
  };

  return (value) => {
    const counts = new Map<string, number>();
    const count = (field: string, times = 1) => {
      counts.set(field, (counts.get(field) ?? 0) + times);
    };
    const replacedEverywhere = (text: string, known: KnownValue): string => {
      const parts = text.split(known.original);
      if (parts.length > 1) {
        count(known.field, parts.length - 1);
      }
      return parts.join(known.fictional);
    };

    const scrubbedString = (text: string): string => {
      let result = text;
      if (secrets.accessToken !== "") {
        result = replacedEverywhere(result, {
          field: "access token",
          original: secrets.accessToken,
          fictional: FICTIONAL_ACCESS_TOKEN,
        });
      }
      result = result.replace(accountIdInText, () => {
        count("account id");
        return String(FICTIONAL_ACCOUNT_ID);
      });
      for (const known of [...recordingValues, ...identifiers.values()]) {
        result = replacedEverywhere(result, known);
      }
      return result;
    };

    const scrubbedNumber = (number: number): number => {
      if (String(number) === secrets.accountId) {
        count("account id");
        return FICTIONAL_ACCOUNT_ID;
      }
      const identifier = identifiers.get(String(number));
      if (identifier === undefined) {
        return number;
      }
      count(identifier.field);
      return Number(identifier.fictional);
    };

    const walk = (node: unknown): unknown => {
      if (typeof node === "string") {
        return scrubbedString(node);
      }
      if (typeof node === "number") {
        return scrubbedNumber(node);
      }
      if (Array.isArray(node)) {
        return node.map(walk);
      }
      if (typeof node === "object" && node !== null) {
        return Object.fromEntries(
          Object.entries(node).map(([key, child]) => {
            const replacement = REPLACEMENT_BY_KEY.get(key);
            if (replacement !== undefined && child !== null) {
              count(key);
              return [key, replacement(child)];
            }
            return [key, walk(child)];
          }),
        );
      }
      return node;
    };

    learn(value);
    return {
      value: walk(value),
      replacements: [...counts].map(([field, times]) => ({ field, count: times })),
    };
  };
}
