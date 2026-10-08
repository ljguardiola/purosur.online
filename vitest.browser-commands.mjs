const recordings = new Map();

export async function startRecordingRequests(context) {
  recordings.get(context.sessionId)?.stop();
  const testFrame = await context.frame();
  const urls = [];
  const record = (request) => {
    if (request.frame() === testFrame) {
      urls.push(request.url());
    }
  };
  context.page.on("request", record);
  recordings.set(context.sessionId, { urls, stop: () => context.page.off("request", record) });
}

export function recordedRequests(context) {
  return [...(recordings.get(context.sessionId)?.urls ?? [])];
}

export function stopRecordingRequests(context) {
  recordings.get(context.sessionId)?.stop();
  recordings.delete(context.sessionId);
}
