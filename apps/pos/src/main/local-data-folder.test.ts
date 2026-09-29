import { describe, expect, it } from "vitest";
import { localDataFolderFor } from "./local-data-folder";

describe("localDataFolderFor", () => {
  it("keeps a Windows register's local data in its channel's folder under the machine-local app data", () => {
    expect(
      localDataFolderFor({
        platform: "win32",
        localAppData: "C:\\Users\\caja\\AppData\\Local",
        dataFolder: "purosur-pos-staging",
        userData: "C:\\Users\\caja\\AppData\\Roaming\\purosur-pos-staging",
      }),
    ).toBe("C:\\Users\\caja\\AppData\\Local\\purosur-pos-staging");
  });

  it("falls back to the app's own data folder where there is no machine-local app data", () => {
    expect(
      localDataFolderFor({
        platform: "linux",
        localAppData: undefined,
        dataFolder: "purosur-pos-e2e",
        userData: "/home/caja/.config/purosur-pos-e2e",
      }),
    ).toBe("/home/caja/.config/purosur-pos-e2e");
    expect(
      localDataFolderFor({
        platform: "win32",
        localAppData: "",
        dataFolder: "purosur-pos",
        userData: "C:\\Users\\caja\\AppData\\Roaming\\purosur-pos",
      }),
    ).toBe("C:\\Users\\caja\\AppData\\Roaming\\purosur-pos");
  });
});
