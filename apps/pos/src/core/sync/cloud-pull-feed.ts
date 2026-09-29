import { type CloudErrorCode, syncPullPageSchema } from "@purosur/contracts";
import type { CloudChangeFeed, CloudChangeFeedAnswer } from "@purosur/domain/sync/use-cases";
import type { CloudResponse } from "../platform/cloud-client";
import type { RegisterPulledChange } from "./pulled-change";

export type PullFailure =
  | { kind: "unreachable" }
  | { kind: "refused"; code: CloudErrorCode }
  | { kind: "unreadable" };

export type GetFromCloud = (
  path: string,
  headers: Record<string, string>,
) => Promise<CloudResponse>;

type Answer = CloudChangeFeedAnswer<RegisterPulledChange, PullFailure>;

export class CloudPullFeed implements CloudChangeFeed<RegisterPulledChange, PullFailure> {
  private readonly get: GetFromCloud;
  private readonly deviceToken: string;

  constructor(get: GetFromCloud, deviceToken: string) {
    this.get = get;
    this.deviceToken = deviceToken;
  }

  async pageAfter(since: number): Promise<Answer> {
    const response = await this.get(`/sync/pull?since=${since}`, {
      authorization: `Bearer ${this.deviceToken}`,
    });
    if (response.kind === "unreachable") {
      return { kind: "failed", failure: { kind: "unreachable" } };
    }
    if (response.kind === "error") {
      return { kind: "failed", failure: { kind: "refused", code: response.error.code } };
    }
    const page = syncPullPageSchema.safeParse(response.body);
    if (!page.success) {
      return { kind: "failed", failure: { kind: "unreadable" } };
    }
    return {
      kind: "page",
      page: {
        changes: page.data.changes.map((change) => ({ changeSeq: change.change_seq, change })),
        cursor: page.data.cursor,
        hasMore: page.data.has_more,
      },
    };
  }
}
