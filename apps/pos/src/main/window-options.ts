export interface WindowOptions {
  width: number;
  height: number;
  show: boolean;
  autoHideMenuBar: boolean;
  webPreferences: {
    contextIsolation: true;
    sandbox: true;
    nodeIntegration: false;
    webSecurity: true;
    preload: string;
  };
}

export function createWindowOptions(preloadPath: string): WindowOptions {
  return {
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: preloadPath,
    },
  };
}
