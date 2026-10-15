export type CloudCall =
  | { kind: "declare"; authorization: string | null; body: unknown }
  | { kind: "put"; url: string; headers: Record<string, string>; body: Buffer }
  | { kind: "uploaded"; generationId: string };

type Answer = Response | "unreachable";

export class FakeSnapshotCloud {
  calls: CloudCall[] = [];
  onDeclare: (body: { generation_id: string }) => Answer = (body) =>
    Response.json({
      upload_url: `https://storage.example.test/objects/${body.generation_id}`,
      required_headers: { "x-amz-meta-key-version": "2" },
      expires_at: "2026-10-15T12:15:00.000Z",
      current_key_version: 2,
    });
  onPut: (url: string) => Answer = () => new Response(null, { status: 200 });
  onUploaded: (generationId: string) => Answer = () => new Response(null, { status: 204 });
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
    } else if (uploaded?.[1] !== undefined && init.method === "POST") {
      call = { kind: "uploaded", generationId: uploaded[1] };
      await this.observe(call);
      answer = this.onUploaded(uploaded[1]);
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
