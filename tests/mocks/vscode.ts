export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export class ThemeColor {
  constructor(public id: string) {}
}

export class Uri {
  static file(path: string) {
    return new Uri('file', path);
  }
  static parse(uri: string) {
    return new Uri('scheme', uri);
  }
  constructor(public scheme: string, public fsPath: string) {}
  toString() {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export class RelativePattern {
  constructor(public base: Uri | string, public pattern: string) {}
}

export const window = {
  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    backgroundColor: undefined,
    command: '',
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  createOutputChannel: (name: string) => ({
    name,
    append: () => {},
    appendLine: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    replace: () => {},
  }),
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showQuickPick: async () => undefined,
  createWebviewPanel: () => ({
    webview: {
      html: '',
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      postMessage: async () => true,
      asWebviewUri: (uri: Uri) => uri,
    },
    onDidDispose: () => ({ dispose: () => {} }),
    onDidChangeViewState: () => ({ dispose: () => {} }),
    reveal: () => {},
    dispose: () => {},
  }),
};

export const workspace = {
  workspaceFolders: [],
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => {} }),
    onDidCreate: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  getConfiguration: () => ({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
  }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: async () => undefined,
};

export const env = {
  clipboard: {
    writeText: async () => {},
    readText: async () => '',
  },
};

export const ViewColumn = {
  One: 1,
  Two: 2,
  Active: -1,
  Beside: -2,
};

