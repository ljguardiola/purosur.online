export interface MercadoPagoScrubReplacement {
  field: string;
  count: number;
}

export interface MercadoPagoScrubResult {
  value: unknown;
  replacements: MercadoPagoScrubReplacement[];
}

const FICTIONAL_ACCESS_TOKEN = "FICTIONAL-ACCESS-TOKEN";
const FICTIONAL_ACCOUNT_ID = 1_234_567_890;

const idOf = (original: unknown): unknown =>
  typeof original === "number" ? FICTIONAL_ACCOUNT_ID : String(FICTIONAL_ACCOUNT_ID);

const REPLACEMENT_BY_KEY: ReadonlyMap<string, (original: unknown) => unknown> = new Map([
  ["user_id", idOf],
  ["collector_id", idOf],
  ["external_pos_id", () => "STORE01POS01"],
  ["terminal_id", () => "FICTIONAL__SMARTPOS1"],
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

function escapedForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubMercadoPagoRecording(
  value: unknown,
  secrets: { accessToken: string; accountId: string },
): MercadoPagoScrubResult {
  const counts = new Map<string, number>();
  const count = (field: string, times = 1) => {
    counts.set(field, (counts.get(field) ?? 0) + times);
  };
  const accountIdInText = new RegExp(`(?<!\\d)${escapedForPattern(secrets.accountId)}(?!\\d)`, "g");

  const scrubbedString = (text: string): string => {
    let result = text;
    if (secrets.accessToken !== "" && result.includes(secrets.accessToken)) {
      const parts = result.split(secrets.accessToken);
      count("access token", parts.length - 1);
      result = parts.join(FICTIONAL_ACCESS_TOKEN);
    }
    return result.replace(accountIdInText, () => {
      count("account id");
      return String(FICTIONAL_ACCOUNT_ID);
    });
  };

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return scrubbedString(node);
    }
    if (typeof node === "number") {
      if (String(node) === secrets.accountId) {
        count("account id");
        return FICTIONAL_ACCOUNT_ID;
      }
      return node;
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

  const scrubbed = walk(value);
  return {
    value: scrubbed,
    replacements: [...counts].map(([field, times]) => ({ field, count: times })),
  };
}
