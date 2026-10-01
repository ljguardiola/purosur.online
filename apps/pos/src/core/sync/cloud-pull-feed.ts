import { changesPageSchema } from "@purosur/contracts";
import type { CloudChangeFeed, CloudChangeFeedAnswer } from "@purosur/domain/sync/use-cases";
import type { CloudResponse } from "../platform/cloud-client";
import { type CloudFailure, failureOf } from "./cloud-failure";
import type { RegisterPulledChange } from "./pulled-change";

export type GetFromCloud = (
  path: string,
  headers: Record<string, string>,
) => Promise<CloudResponse>;

type Answer = CloudChangeFeedAnswer<RegisterPulledChange, CloudFailure>;

export class CloudPullFeed implements CloudChangeFeed<RegisterPulledChange, CloudFailure> {
  private readonly get: GetFromCloud;
  private readonly deviceToken: string;

  constructor(get: GetFromCloud, deviceToken: string) {
    this.get = get;
    this.deviceToken = deviceToken;
  }

  async pageAfter(since: number): Promise<Answer> {
    const response = await this.get(`/api/changes?since=${since}`, {
      authorization: `Bearer ${this.deviceToken}`,
    });
    if (response.kind !== "ok") {
      return { kind: "failed", failure: failureOf(response) };
    }
    const page = changesPageSchema.safeParse(response.body);
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
