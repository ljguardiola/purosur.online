import { useEffect, useState } from "react";

// role="alert" implies aria-live="assertive" (interrupts current speech); role="status" implies
// aria-live="polite" (waits for it to end).
export type NoticeAssertiveness = "assertive" | "polite";

// Several screen readers only detect a live region as changed once it already exists in the
// accessibility tree (documented for @reach/alert's Alert component); one that arrives already
// holding its full text on the same paint it's inserted with is never announced. Mounting it empty
// and filling it from an effect a tick later turns the announcement into a real mutation.
export function NoticeLiveRegion({
  assertiveness,
  text,
}: {
  assertiveness: NoticeAssertiveness;
  text: string;
}) {
  const [announced, setAnnounced] = useState<string>();

  useEffect(() => {
    setAnnounced(text);
  }, [text]);

  return (
    <span className="sr-only" role={assertiveness === "assertive" ? "alert" : "status"}>
      {announced}
    </span>
  );
}
