import { createServer } from "node:net";

/**
 * Picks a currently-free TCP port so each integration test can start a real, independently
 * listening `startServer()` instance without colliding with another test's server.
 */
export async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("findFreePort: the OS returned no port"));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
        } else {
          resolve(port);
        }
      });
    });
  });
}
