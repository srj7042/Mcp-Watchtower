import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface IdeCapabilityReport {
  ideName: string;
  ideVersion: string;
  isAntigravity: boolean;
  isStandardVsCode: boolean;
  capabilities: {
    webviewPanels: boolean;
    statusBar: boolean;
    sidebarTreeViews: boolean;
    fileSystemWatchers: boolean;
    outputChannel: boolean;
    globalMcpConfigAccessible: boolean;
    ideInternalClientInspection: boolean;
    ideProcessTakeoverSupported: boolean;
  };
  paths: {
    globalConfigPath: string;
    globalConfigExists: boolean;
  };
  limitations: string[];
}

export class AntigravityCompatibility {
  public static probe(): IdeCapabilityReport {
    const appName = vscode.env.appName || 'Unknown IDE';
    const version = vscode.version || '0.0.0';
    const isAntigravity = appName.toLowerCase().includes('antigravity');
    const isStandardVsCode = !isAntigravity && appName.toLowerCase().includes('visual studio code');

    const globalConfigPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    const globalConfigExists = fs.existsSync(globalConfigPath);

    const limitations: string[] = [
      'IDE runtime internal MCP client sessions are NOT exposed to extensions by the host API.',
      'Process injection or terminating external IDE-managed MCP servers is prohibited for system safety.',
      'IDE runtime connection state cannot be probed via private IPC and will report NOT_EXPOSED / UNKNOWN.',
    ];

    if (!globalConfigExists) {
      limitations.push(`Global configuration file not found at expected path: ${globalConfigPath}`);
    }

    return {
      ideName: appName,
      ideVersion: version,
      isAntigravity,
      isStandardVsCode,
      capabilities: {
        webviewPanels: true,
        statusBar: true,
        sidebarTreeViews: true,
        fileSystemWatchers: true,
        outputChannel: true,
        globalMcpConfigAccessible: globalConfigExists,
        ideInternalClientInspection: false, // Honesty: not exposed
        ideProcessTakeoverSupported: false, // Prohibited
      },
      paths: {
        globalConfigPath,
        globalConfigExists,
      },
      limitations,
    };
  }
}

