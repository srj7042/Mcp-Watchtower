import * as vscode from 'vscode';
import * as path from 'path';
import { Application } from './core/application.js';
import { Logger } from './utils/logger.js';
import { registerCommands } from './commands/registerCommands.js';
import { ServerDiscoveryService } from './services/serverDiscoveryService.js';
import { HealthMonitor } from './monitoring/healthMonitor.js';
import { NotificationService } from './services/notificationService.js';
import { DashboardProvider } from './providers/dashboardProvider.js';
import { ServerTreeProvider } from './providers/serverTreeProvider.js';
import { SqliteStorage } from './storage/sqliteStorage.js';
import { WatchtowerWebSocketServer } from './server/websocketServer.js';
import { AgentManagerService } from './services/agentManagerService.js';
import { PricingEngine } from './tokenization/pricingEngine.js';

let appInstance: Application | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('MCP Watchtower');
  const logger = new Logger(outputChannel);
  context.subscriptions.push({ dispose: () => logger.dispose() });

  logger.info('Activating MCP Watchtower & Agent Observability Platform...');

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

  // 1. Initialize SQLite Observability Storage
  const storageDir = context.globalStorageUri ? context.globalStorageUri.fsPath : context.extensionPath;
  const dbPath = path.join(storageDir, 'watchtower_observability.sqlite');
  const storage = new SqliteStorage(dbPath, logger);
  try {
    await storage.initialize();
    context.subscriptions.push(storage);
  } catch (err) {
    logger.error('Failed to initialize SQLite storage:', err);
  }

  // 2. Initialize WebSocket Event Server (Loopback only)
  const wsServer = new WatchtowerWebSocketServer(app.eventBus, { port: 19840 }, logger);
  try {
    await wsServer.start();
    context.subscriptions.push(wsServer);
  } catch (err) {
    logger.warn('Failed to start loopback WebSocket server:', err);
  }

  // 3. Initialize Agent Manager Service
  const pricingEngine = new PricingEngine();
  const agentManager = new AgentManagerService(app.eventBus, storage, wsServer, pricingEngine, logger);
  try {
    await agentManager.initialize();
    context.subscriptions.push(agentManager);
  } catch (err) {
    logger.error('Failed to initialize AgentManagerService:', err);
  }

  // 4. Initialize Discovery Service
  const discoveryService = new ServerDiscoveryService(
    app.eventBus,
    { customPaths },
    logger
  );
  context.subscriptions.push(discoveryService);

  // 5. Initialize Health Monitor
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

  // 6. Initialize Notification Service
  const notificationService = new NotificationService(
    app.eventBus,
    healthMonitor.registry,
    logger
  );
  context.subscriptions.push(notificationService);

  // 7. Initialize Dashboard Provider with Agent Observability modules
  const dashboardProvider = new DashboardProvider(
    context,
    app,
    app.eventBus,
    discoveryService,
    healthMonitor,
    agentManager,
    storage,
    logger
  );
  context.subscriptions.push(dashboardProvider);

  // 8. Initialize Server Tree Provider (Sidebar Explorer)
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

  logger.info('MCP Watchtower & Agent Observability Platform activated successfully.');
}

export async function deactivate(): Promise<void> {
  if (appInstance) {
    appInstance.dispose();
    appInstance = undefined;
  }
}
