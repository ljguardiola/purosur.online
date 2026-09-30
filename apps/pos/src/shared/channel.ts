export const CHANNELS = ["production", "staging"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_DATA_FOLDERS: Readonly<Record<Channel, string>> = {
  production: "purosur-pos",
  staging: "purosur-pos-staging",
};

export interface ChannelFile {
  readonly channel: Channel;
  readonly sentryDsn?: string;
  readonly cloudUrl?: string;
}

export interface ChannelSettings extends ChannelFile {
  readonly dataFolder: string;
}

export type ChannelFileResult =
  | { readonly ok: true; readonly settings: ChannelSettings }
  | { readonly ok: false; readonly reason: string };

const CHANNEL_FILE_FIELDS = new Set(["channel", "sentryDsn", "cloudUrl"]);
const LOCAL_CHANNEL_FILE_FIELDS = new Set([...CHANNEL_FILE_FIELDS, "dataFolder"]);
const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Windows drops trailing dots from a folder name and opens these device names, with or without an
// extension, instead of a folder.
const TRAILING_DOT = /\.$/;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

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

function dataFolderProblem(channel: Channel, dataFolder: string): string | undefined {
  if (!FOLDER_NAME.test(dataFolder)) {
    return "dataFolder must be a single folder name";
  }
  if (TRAILING_DOT.test(dataFolder) || WINDOWS_DEVICE_NAME.test(dataFolder)) {
    return "dataFolder must be a name Windows opens as that same folder";
  }
  if (channel === "production" && dataFolder !== CHANNEL_DATA_FOLDERS.production) {
    return `dataFolder of the production channel must be ${CHANNEL_DATA_FOLDERS.production}`;
  }
  if (channel !== "production" && isProductionFolder(dataFolder)) {
    return `dataFolder of the ${channel} channel must not be the production one`;
  }
  return undefined;
}

function isHttpsUrl(value: string): boolean {
  return isHttpUrl(value) && new URL(value).protocol === "https:";
}

// Only an unpackaged run may reach its cloud over plain http, such as one on this same machine.
function parseFields(
  text: string,
  knownFields: ReadonlySet<string>,
  allowPlainHttpCloud: boolean,
): ChannelFileResult {
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
  const unknownField = Object.keys(fields).find((field) => !knownFields.has(field));
  if (unknownField !== undefined) {
    return fail(`unknown field "${unknownField}"`);
  }

  const { channel, sentryDsn, cloudUrl } = fields;
  if (!isChannel(channel)) {
    return fail(`channel must be one of ${CHANNELS.join(", ")}`);
  }
  const dataFolder = fields["dataFolder"] ?? CHANNEL_DATA_FOLDERS[channel];
  if (typeof dataFolder !== "string") {
    return fail("dataFolder must be a single folder name");
  }
  const folderProblem = dataFolderProblem(channel, dataFolder);
  if (folderProblem !== undefined) {
    return fail(folderProblem);
  }
  if (sentryDsn !== undefined && (typeof sentryDsn !== "string" || !isHttpUrl(sentryDsn))) {
    return fail("sentryDsn must be an http(s) URL when present");
  }

  const isCloudUrl = allowPlainHttpCloud ? isHttpUrl : isHttpsUrl;
  if (cloudUrl !== undefined && (typeof cloudUrl !== "string" || !isCloudUrl(cloudUrl))) {
    return fail(
      `cloudUrl must be an ${allowPlainHttpCloud ? "http(s)" : "https"} URL when present`,
    );
  }

  return {
    ok: true,
    settings: {
      channel,
      dataFolder,
      ...(sentryDsn === undefined ? {} : { sentryDsn }),
      ...(cloudUrl === undefined ? {} : { cloudUrl }),
    },
  };
}

/** An installed register's file: its data folder is always its channel's own. */
export function parseChannelFile(text: string): ChannelFileResult {
  return parseFields(text, CHANNEL_FILE_FIELDS, false);
}

/** An unpackaged run's file (development and end-to-end tests), which may name its data folder. */
export function parseLocalChannelFile(text: string): ChannelFileResult {
  return parseFields(text, LOCAL_CHANNEL_FILE_FIELDS, true);
}

export function serializeChannelFile(file: ChannelFile): string {
  const text = `${JSON.stringify(file, null, 2)}\n`;
  const result = parseChannelFile(text);
  if (!result.ok) {
    throw new Error(`refusing to write an invalid channel file: ${result.reason}`);
  }
  return text;
}

const SENTRY_ENVIRONMENT_ARGUMENT = "--sentry-environment=";
const CLOUD_URL_ARGUMENT = "--cloud-url=";
const LOCAL_DATA_FOLDER_ARGUMENT = "--local-data-folder=";

export interface CoreArguments extends Pick<ChannelFile, "channel" | "cloudUrl"> {
  readonly localDataFolder?: string;
}

export function coreArgumentsFor(settings: CoreArguments): string[] {
  return [
    `${SENTRY_ENVIRONMENT_ARGUMENT}${settings.channel}`,
    ...(settings.cloudUrl === undefined ? [] : [`${CLOUD_URL_ARGUMENT}${settings.cloudUrl}`]),
    ...(settings.localDataFolder === undefined
      ? []
      : [`${LOCAL_DATA_FOLDER_ARGUMENT}${settings.localDataFolder}`]),
  ];
}

export function localDataFolderFromCoreArguments(argv: readonly string[]): string | undefined {
  const argument = argv.find((value) => value.startsWith(LOCAL_DATA_FOLDER_ARGUMENT));
  const value = argument?.slice(LOCAL_DATA_FOLDER_ARGUMENT.length);
  return value === "" ? undefined : value;
}

export function cloudUrlFromCoreArguments(argv: readonly string[]): string | undefined {
  const argument = argv.find((value) => value.startsWith(CLOUD_URL_ARGUMENT));
  const value = argument?.slice(CLOUD_URL_ARGUMENT.length);
  return value !== undefined && isHttpUrl(value) ? value : undefined;
}

export function sentryEnvironmentFromCoreArguments(argv: readonly string[]): Channel | undefined {
  const argument = argv.find((value) => value.startsWith(SENTRY_ENVIRONMENT_ARGUMENT));
  const value = argument?.slice(SENTRY_ENVIRONMENT_ARGUMENT.length);
  return isChannel(value) ? value : undefined;
}
