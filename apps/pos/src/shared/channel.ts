export const CHANNELS = ["production", "staging"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_DATA_FOLDERS: Readonly<Record<Channel, string>> = {
  production: "purosur-pos",
  staging: "purosur-pos-staging",
};

export interface ChannelSettings {
  readonly channel: Channel;
  readonly dataFolder: string;
  readonly sentryDsn?: string;
}

export type ChannelFileResult =
  | { readonly ok: true; readonly settings: ChannelSettings }
  | { readonly ok: false; readonly reason: string };

const KNOWN_FIELDS = new Set(["channel", "dataFolder", "sentryDsn"]);
const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isChannel(value: unknown): value is Channel {
  return CHANNELS.some((channel) => channel === value);
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function fail(reason: string): ChannelFileResult {
  return { ok: false, reason };
}

// Windows folder names are case-insensitive, so a differently cased production folder name is
// still the production folder.
function isProductionFolder(dataFolder: string): boolean {
  return dataFolder.toLowerCase() === CHANNEL_DATA_FOLDERS.production.toLowerCase();
}

export function parseChannelFile(text: string): ChannelFileResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("the channel file is not valid JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail("the channel file is not a JSON object");
  }

  const fields = data as Record<string, unknown>;
  const unknownField = Object.keys(fields).find((field) => !KNOWN_FIELDS.has(field));
  if (unknownField !== undefined) {
    return fail(`unknown field "${unknownField}"`);
  }

  const { channel, dataFolder, sentryDsn } = fields;
  if (!isChannel(channel)) {
    return fail(`channel must be one of ${CHANNELS.join(", ")}`);
  }
  if (typeof dataFolder !== "string" || !FOLDER_NAME.test(dataFolder)) {
    return fail("dataFolder must be a single folder name");
  }
  if (channel === "production" && dataFolder !== CHANNEL_DATA_FOLDERS.production) {
    return fail(`dataFolder of the production channel must be ${CHANNEL_DATA_FOLDERS.production}`);
  }
  if (channel !== "production" && isProductionFolder(dataFolder)) {
    return fail(`dataFolder of the ${channel} channel must not be the production one`);
  }
  if (sentryDsn !== undefined && (typeof sentryDsn !== "string" || !isHttpUrl(sentryDsn))) {
    return fail("sentryDsn must be an http(s) URL when present");
  }

  return {
    ok: true,
    settings:
      sentryDsn === undefined ? { channel, dataFolder } : { channel, dataFolder, sentryDsn },
  };
}

export function serializeChannelFile(settings: ChannelSettings): string {
  const text = `${JSON.stringify(settings, null, 2)}\n`;
  const result = parseChannelFile(text);
  if (!result.ok) {
    throw new Error(`refusing to write an invalid channel file: ${result.reason}`);
  }
  return text;
}

const SENTRY_ENVIRONMENT_ARGUMENT = "--sentry-environment=";

export function coreArgumentsFor(channel: Channel): string[] {
  return [`${SENTRY_ENVIRONMENT_ARGUMENT}${channel}`];
}

export function sentryEnvironmentFromCoreArguments(argv: readonly string[]): Channel | undefined {
  const argument = argv.find((value) => value.startsWith(SENTRY_ENVIRONMENT_ARGUMENT));
  const value = argument?.slice(SENTRY_ENVIRONMENT_ARGUMENT.length);
  return isChannel(value) ? value : undefined;
}
