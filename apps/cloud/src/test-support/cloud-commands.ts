import { readFileSync } from "node:fs";

export function cloudCommands(): string[] {
  const { scripts } = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };
  return Object.values(scripts).flatMap((script) => {
    const command = /^node dist\/(.+)\.js$/.exec(script)?.[1];
    return command ? [command] : [];
  });
}
