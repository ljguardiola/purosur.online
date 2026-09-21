export interface ContentSecurityPolicyOptions {
  // A meta element can't carry frame-ancestors: browsers ignore it there and warn.
  delivery?: "header" | "meta";
  // Only for the local development server, which injects inline script and style and keeps a
  // hot-reload socket open; the shipped interface never gets this relaxation.
  devServerUrl?: string;
}

function devServerSocketOrigin(devServerUrl: string): string {
  const url = new URL(devServerUrl);
  const socketScheme = url.protocol === "https:" ? "wss:" : "ws:";
  return `${socketScheme}//${url.host}`;
}

export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions = {}): string {
  const { delivery = "header", devServerUrl } = options;
  const inline = devServerUrl ? " 'unsafe-inline'" : "";
  const socket = devServerUrl ? ` ${devServerSocketOrigin(devServerUrl)}` : "";

  const directives: Array<readonly [name: string, value: string]> = [
    ["default-src", "'self'"],
    ["script-src", `'self'${inline}`],
    ["style-src", `'self'${inline}`],
    ["font-src", "'self'"],
    ["img-src", "'self'"],
    ["connect-src", `'self'${socket}`],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
  ];
  if (delivery === "header") {
    directives.push(["frame-ancestors", "'none'"]);
  }

  return directives.map(([name, value]) => `${name} ${value}`).join("; ");
}
