import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { setQueryAnswer } from "./set-query-answer";

describe("setQueryAnswer", () => {
  it("keeps its answer when a read that was already in flight answers afterwards", async () => {
    const queryClient = new QueryClient();
    const queryKey = ["answer"];
    let answerLate: (value: string) => void = () => {};
    const reading = queryClient
      .fetchQuery({
        queryKey,
        queryFn: () =>
          new Promise<string>((resolve) => {
            answerLate = resolve;
          }),
      })
      .catch(() => undefined);

    await setQueryAnswer(queryClient, queryKey, "from the outcome");
    answerLate("from the older read");
    await reading;

    expect(queryClient.getQueryData(queryKey)).toBe("from the outcome");
  });

  it("sets its answer when nothing is in flight", async () => {
    const queryClient = new QueryClient();

    await setQueryAnswer(queryClient, ["answer"], "from the outcome");

    expect(queryClient.getQueryData(["answer"])).toBe("from the outcome");
  });
});
