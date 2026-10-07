export interface ScrubReplacement {
  field: string;
  count: number;
}

export interface ScrubbedRecording {
  text: string;
  replacements: ScrubReplacement[];
}

// The domain's test-support folder is not part of the build this runs from, so the digits are kept
// here and a test holds them equal to the domain's fictional certificate CUIT.
export const FICTIONAL_CERTIFICATE_CUIT_DIGITS = "20123456786";
const FICTIONAL_CERTIFICATE_CUIT_DASHED = `${FICTIONAL_CERTIFICATE_CUIT_DIGITS.slice(0, 2)}-${FICTIONAL_CERTIFICATE_CUIT_DIGITS.slice(2, 10)}-${FICTIONAL_CERTIFICATE_CUIT_DIGITS.slice(10)}`;
const FICTIONAL_DESTINATION = `SERIALNUMBER=CUIT ${FICTIONAL_CERTIFICATE_CUIT_DIGITS}, CN=comercio-de-prueba`;

// ARCA answers a ticket as XML escaped inside the loginCmsReturn element, so each pattern reads
// a tag written either way.
const OPEN = "(?:<|&lt;)";
const CLOSE = "(?:>|&gt;)";

const CUIT_PATTERN = /(?<!\d)(?:20|23|24|25|26|27|30|33|34)(-?)\d{8}-?\d(?!\d)/g;

function replaceCounting(
  text: string,
  pattern: RegExp,
  replacement: string | ((...groups: string[]) => string),
): { text: string; count: number } {
  let count = 0;
  const replaced = text.replace(pattern, (...match: string[]) => {
    count += 1;
    return typeof replacement === "string" ? replacement : replacement(...match);
  });
  return { text: replaced, count };
}

function elementPattern(element: string): RegExp {
  return new RegExp(`(${OPEN}${element}${CLOSE})[\\s\\S]*?(${OPEN}/${element}${CLOSE})`, "g");
}

export function scrubArcaRecording(raw: string): ScrubbedRecording {
  const replacements: ScrubReplacement[] = [];
  let text = raw;
  const apply = (
    field: string,
    pattern: RegExp,
    replacement: string | ((...groups: string[]) => string),
  ) => {
    const result = replaceCounting(text, pattern, replacement);
    text = result.text;
    if (result.count > 0) {
      replacements.push({ field, count: result.count });
    }
  };

  apply(
    "token",
    elementPattern("token"),
    (_all, open = "", close = "") => `${open}FICTIONAL-TOKEN-0001${close}`,
  );
  apply(
    "sign",
    elementPattern("sign"),
    (_all, open = "", close = "") => `${open}FICTIONAL-SIGN-0001${close}`,
  );
  apply("CUIT", CUIT_PATTERN, (_all, dash = "") =>
    dash ? FICTIONAL_CERTIFICATE_CUIT_DASHED : FICTIONAL_CERTIFICATE_CUIT_DIGITS,
  );
  apply(
    "uniqueId",
    elementPattern("uniqueId"),
    (_all, open = "", close = "") => `${open}1234567890${close}`,
  );
  apply(
    "destination",
    elementPattern("destination"),
    (_all, open = "", close = "") => `${open}${FICTIONAL_DESTINATION}${close}`,
  );
  return { text, replacements };
}
