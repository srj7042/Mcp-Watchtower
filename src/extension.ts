import * as vscode from 'vscode';
import { Application } from './core/application.js';
import { Logger } from './utils/logger.js';
import { registerCommands } from './commands/registerCommands.js';
import { ServerDiscoveryService } from './services/serverDiscoveryService.js';
import { HealthMonitor } from './monitoring/healthMonitor.js';
import { NotificationService } from './services/notificationService.js';
import { DashboardProvider } from './providers/dashboardProvider.js';
import { ServerTreeProvider } from './providers/serverTreeProvider.js';

let appInstance: Application | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('MCP Watchtower');
  const logger = new Logger(outputChannel);
  context.subscriptions.push({ dispose: () => logger.dispose() });

  logger.info('Activating MCP Watchtower Extension...');

  const app = new Application(context, logger);
  appInstance = app;
  context.subscriptions.push(app);

  await app.initialize();

  // Load user settings
  const config = vscode.workspace.getConfiguration('mcpWatchtower');
  const checkInterval = config.get<number>('monitoring.checkIntervalSeconds', 60);
  const requestTimeout = config.get<number>('monitoring.requestTimeoutSeconds', 8);
  const maxConcurrent = config.get<number>('monitoring.maxConcurrentChecks', 2);
  const monitoringEnabled = config.get<boolean>('monitoring.enabled', true);
  const customPaths = config.get<string[]>('customConfigPaths', []);

  // Initialize Discovery Service
  const discoveryService = new ServerDiscoveryService(
    app.eventBus,
    { customPaths },
    logger
  );
  context.subscriptions.push(discoveryService);

  // Initialize Health Monitor
  const healthMonitor = new HealthMonitor(
    app.eventBus,
    {
      checkIntervalSeconds: checkInterval,
      requestTimeoutSeconds: requestTimeout,
      maxConcurrentChecks: maxConcurrent,
      monitoringEnabled,
    },
    logger
  );
  context.subscriptions.push(healthMonitor);

  // Initialize Notification Service
  const notificationService = new NotificationService(
    app.eventBus,
    healthMonitor.registry,
    logger
  );
  context.subscriptions.push(notificationService);

  // Initialize Dashboard Provider
  const dashboardProvider = new DashboardProvider(
    context,
    app,
    app.eventBus,
    discoveryService,
    healthMonitor,
    logger
  );
  context.subscriptions.push(dashboardProvider);

  // Initialize Server Tree Provider (Sidebar Explorer)
  const treeProvider = new ServerTreeProvider(
    discoveryService,
    healthMonitor,
    app.eventBus
  );
  context.subscriptions.push(treeProvider);
  vscode.window.registerTreeDataProvider('mcpWatchtower.serverExplorer', treeProvider);

  app.setServices({
    discoveryService,
    healthMonitor,
    dashboardProvider,
  });

  const commandDisposables = registerCommands(app, logger);
  context.subscriptions.push(commandDisposables);

  // Initial discovery and health checks
  try {
    const servers = await discoveryService.discoverAll();
    if (servers.length > 0) {
      await healthMonitor.checkAll(false);
    }
  } catch (err) {
    logger.error('Failed during initial discovery / health checks', err);
  }

  logger.info('MCP Watchtower Extension activated successfully.');
}

export async function deactivate(): Promise<void> {
  if (appInstance) {
    appInstance.dispose();
    appInstance = undefined;
  }
}
