export type CloudCall =
  | { kind: "declare"; authorization: string | null; body: unknown }
  | { kind: "put"; url: string; headers: Record<string, string>; body: Buffer }
  | { kind: "uploaded"; generationId: string }
  | { kind: "verified"; authorization: string | null; generationIds: string[] };

export interface OnDiskReport {
  authorization: string | null;
  generationIds: string[];
  callsBefore: number;
}

export interface KeyVersionAsk {
  authorization: string | null;
  callsBefore: number;
}

type Answer = Response | "unreachable";

export class FakeSnapshotCloud {
  calls: CloudCall[] = [];
  onDiskReports: OnDiskReport[] = [];
  keyVersionAsks: KeyVersionAsk[] = [];
  onKeyVersion: () => Answer = () => Response.json({ current_key_version: 2 });
  onOnDisk: () => Answer = () => new Response(null, { status: 204 });
  onDeclare: (body: { generation_id: string }) => Answer = (body) =>
    Response.json({
      upload_url: `https://storage.example.test/objects/${body.generation_id}`,
      required_headers: { "x-amz-meta-key-version": "2" },
      expires_at: "2026-10-15T12:15:00.000Z",
      current_key_version: 2,
    });
  onPut: (url: string) => Answer = () => new Response(null, { status: 200 });
  onUploaded: (generationId: string) => Answer = () => new Response(null, { status: 204 });
  onVerified: (generationIds: string[]) => Answer = () =>
    Response.json({ verified_generation_ids: [] });
  observe: (call: CloudCall) => void | Promise<void> = () => {};

  readonly fetch = async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const answer = await this.answerFor(url, init, headers);
    if (answer === "unreachable") {
      throw new TypeError("fetch failed");
    }
    return answer;
  };

  private async answerFor(url: URL, init: RequestInit, headers: Headers): Promise<Answer> {
    const uploaded = /^\/api\/devices\/current\/snapshots\/([^/]+)\/uploaded$/.exec(url.pathname);
    let call: CloudCall;
    let answer: Answer;
    if (url.pathname === "/api/devices/current/snapshots" && init.method === "POST") {
      const body = JSON.parse(String(init.body)) as { generation_id: string };
      call = { kind: "declare", authorization: headers.get("authorization"), body };
      await this.observe(call);
      answer = this.onDeclare(body);
    } else if (
      url.pathname === "/api/devices/current/snapshots/verified" &&
      init.method === "GET"
    ) {
      const generationIds = url.searchParams.getAll("generation_id");
      call = { kind: "verified", authorization: headers.get("authorization"), generationIds };
      await this.observe(call);
      answer = this.onVerified(generationIds);
    } else if (uploaded?.[1] !== undefined && init.method === "POST") {
      call = { kind: "uploaded", generationId: uploaded[1] };
      await this.observe(call);
      answer = this.onUploaded(uploaded[1]);
    } else if (
      url.pathname === "/api/devices/current/snapshot-key-version" &&
      init.method === "GET"
    ) {
      this.keyVersionAsks.push({
        authorization: headers.get("authorization"),
        callsBefore: this.calls.length,
      });
      return this.onKeyVersion();
    } else if (url.pathname === "/api/devices/current/snapshots/on-disk" && init.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { generation_ids: string[] };
      this.onDiskReports.push({
        authorization: headers.get("authorization"),
        generationIds: body.generation_ids,
        callsBefore: this.calls.length,
      });
      return this.onOnDisk();
    } else if (init.method === "PUT") {
      call = {
        kind: "put",
        url: url.href,
        headers: Object.fromEntries(headers.entries()),
        body: Buffer.from(init.body as Uint8Array),
      };
      await this.observe(call);
      answer = this.onPut(url.href);
    } else {
      throw new Error(`unexpected request ${init.method} ${url.href}`);
    }
    this.calls.push(call);
    return answer;
  }
}

export function cloudRefusal(code: string, status: number): Response {
  return Response.json({ code, message: "refused", details: [] }, { status });
}
