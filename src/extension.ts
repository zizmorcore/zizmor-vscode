import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;

// Runs server lifecycle operations one at a time: overlapping stop/start
// cycles can leak a server process. A failed operation doesn't prevent
// later ones from running.
let lifecycleQueue: Promise<void> = Promise.resolve();

function enqueueLifecycleOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = lifecycleQueue.then(operation);
    lifecycleQueue = result.then(() => undefined, () => undefined);
    return result;
}

const execFileAsync = promisify(execFile);
const MIN_ZIZMOR_VERSION = '1.11.0';

/**
 * Expands tilde (~) in file paths to the user's home directory
 */
function expandTilde(filePath: string): string {
    if (filePath.startsWith('~/')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}

/**
 * Compares two semantic version strings
 * Returns: -1 if version1 < version2, 0 if equal, 1 if version1 > version2
 */
function compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;

        if (v1Part < v2Part) {
            return -1;
        }
        if (v1Part > v2Part) {
            return 1;
        }
    }

    return 0;
}

/**
 * Checks if the zizmor executable meets the minimum version requirement
 */
async function checkZizmorVersion(executablePath: string): Promise<{ isValid: boolean; version?: string; error?: string }> {
    try {
        // We don't really expect `zizmor --version` to hang, but just in case.
        const { stdout } = await execFileAsync(executablePath, ['--version'], { timeout: 10_000 });
        const versionMatch = stdout.trim().match(/(\d+\.\d+\.\d+)/);

        if (!versionMatch) {
            return {
                isValid: false,
                error: `Could not parse version from zizmor output: ${stdout.trim()}`
            };
        }

        const version = versionMatch[1];
        const isValid = compareVersions(version, MIN_ZIZMOR_VERSION) >= 0;

        return { isValid, version };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            isValid: false,
            error: `Failed to execute zizmor --version: ${message}`
        };
    }
}

/**
 * Resolves the configured zizmor executable path, expanding variables and
 * resolving relative paths against the workspace folder. Returns undefined
 * (after showing an error message) if the path cannot be resolved.
 */
function resolveExecutablePath(config: vscode.WorkspaceConfiguration): string | undefined {
    const rawExecutablePath = config.get<string>('executablePath', 'zizmor');
    let executablePath = expandTilde(rawExecutablePath);

    const usesWorkspaceVar = executablePath.includes('${workspaceFolder}');
    const isRelativeWithSlashes = !path.isAbsolute(executablePath)
        && (executablePath.includes('/') || executablePath.includes('\\'));

    if (usesWorkspaceVar || isRelativeWithSlashes) {
        // Prefer the workspace folder that owns the active document,
        // falling back to the first workspace folder for multi-root setups
        // where no workflow is focused at activation time.
        const activeDocUri = vscode.window.activeTextEditor?.document.uri;
        const workspaceFolder =
            (activeDocUri && vscode.workspace.getWorkspaceFolder(activeDocUri)?.uri.fsPath)
            || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            vscode.window.showErrorMessage(
                `Cannot resolve zizmor.executablePath "${rawExecutablePath}": no workspace folder is available. Open a folder or set an absolute path.`
            );
            return undefined;
        }

        executablePath = executablePath.replace(/\$\{workspaceFolder\}/g, workspaceFolder);
        if (!path.isAbsolute(executablePath) && (executablePath.includes('/') || executablePath.includes('\\'))) {
            executablePath = path.join(workspaceFolder, executablePath);
        }
    }

    return executablePath;
}

type StartResult = 'started' | 'disabled' | 'failed';

/**
 * Starts the language server per the current configuration, reporting
 * failures to the user. Call only through enqueueLifecycleOperation.
 */
async function startLanguageServer(): Promise<StartResult> {
    const config = vscode.workspace.getConfiguration('zizmor');
    const enabled = config.get<boolean>('enable', true);

    if (!enabled) {
        return 'disabled';
    }

    const executablePath = resolveExecutablePath(config);
    if (!executablePath) {
        return 'failed';
    }

    // Check zizmor version before starting the language server
    const versionCheck = await checkZizmorVersion(executablePath);

    if (!versionCheck.isValid) {
        const errorMessage = versionCheck.version
            ? `zizmor version ${versionCheck.version} is too old. This extension requires zizmor ${MIN_ZIZMOR_VERSION} or newer. Please update zizmor and try again.`
            : `Failed to check zizmor version: ${versionCheck.error}. Please ensure zizmor is installed and accessible at "${executablePath}".`;

        vscode.window.showErrorMessage(errorMessage);
        return 'failed';
    }

    // Define the server options
    const serverOptions: ServerOptions = {
        command: executablePath,
        args: ['--lsp'],
        transport: TransportKind.stdio
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'yaml', pattern: '**/.github/workflows/*.{yml,yaml}' },
            { scheme: 'file', language: 'yaml', pattern: '**/action.{yml,yaml}' },
            { scheme: 'file', language: 'github-actions-workflow', pattern: '**/.github/workflows/*.{yml,yaml}' },
            { scheme: 'file', language: 'github-actions-workflow', pattern: '**/action.{yml,yaml}' },
            { scheme: 'file', language: 'yaml', pattern: '**/.github/dependabot.{yml,yaml}' },
        ]
    };

    const newClient = new LanguageClient(
        'zizmor',
        'zizmor Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    try {
        await newClient.start();
        client = newClient;
        outputChannel?.appendLine('zizmor language server started successfully');
        return 'started';
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMessage = `Failed to start zizmor language server: ${message}`;
        outputChannel?.appendLine(errorMessage);
        vscode.window.showErrorMessage(errorMessage);

        try {
            await newClient.dispose();
        } catch {
            // Nothing to do: the client never started.
        }
        return 'failed';
    }
}

/**
 * Stops and disposes the language server, if it's running.
 * Call only through enqueueLifecycleOperation.
 */
async function stopLanguageServer(): Promise<void> {
    if (!client) {
        return;
    }

    const oldClient = client;
    client = undefined;

    try {
        await oldClient.dispose();
    } catch {
        // The client may already be stopped; nothing to do.
    }
}

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('zizmor');
    context.subscriptions.push(outputChannel);

    // Register commands unconditionally, so the server can be restarted
    // even if it failed to start during activation (#81).
    context.subscriptions.push(
        vscode.commands.registerCommand('zizmor.restart', async () => {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Restarting zizmor language server...',
                    cancellable: false
                },
                async () => {
                    try {
                        // Re-reads the configuration, picking up changes
                        // to e.g. zizmor.executablePath.
                        const result = await enqueueLifecycleOperation(async () => {
                            await stopLanguageServer();
                            return startLanguageServer();
                        });

                        if (result === 'started') {
                            vscode.window.showInformationMessage('zizmor language server restarted successfully');
                        } else if (result === 'disabled') {
                            vscode.window.showInformationMessage('zizmor is disabled; set zizmor.enable to true to start the language server');
                        }
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : String(error);
                        vscode.window.showErrorMessage(`Failed to restart zizmor: ${message}`);
                    }
                }
            );
        }),
        vscode.commands.registerCommand('zizmor.showOutputChannel', () => {
            outputChannel?.show();
        }),
        vscode.workspace.onDidChangeConfiguration(async (event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('zizmor')) {
                // Restart the language server when configuration changes
                await vscode.commands.executeCommand('zizmor.restart');
            }
        })
    );

    await enqueueLifecycleOperation(startLanguageServer);
}

export async function deactivate(): Promise<void> {
    // Enqueued so an in-flight start completes before we stop it.
    await enqueueLifecycleOperation(stopLanguageServer);
}
