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
        const { stdout } = await execFileAsync(executablePath, ['--version']);
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

export async function activate(context: vscode.ExtensionContext) {
    // Get configuration
    const config = vscode.workspace.getConfiguration('zizmor');
    const enabled = config.get<boolean>('enable', true);

    if (!enabled) {
        return;
    }

    // Get the path to the zizmor executable, expanding variables and
    // resolving relative paths against the workspace folder
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
            return;
        }

        executablePath = executablePath.replace(/\$\{workspaceFolder\}/g, workspaceFolder);
        if (!path.isAbsolute(executablePath) && (executablePath.includes('/') || executablePath.includes('\\'))) {
            executablePath = path.join(workspaceFolder, executablePath);
        }
    }

    // Check zizmor version before starting the language server
    const versionCheck = await checkZizmorVersion(executablePath);

    if (!versionCheck.isValid) {
        const errorMessage = versionCheck.version
            ? `zizmor version ${versionCheck.version} is too old. This extension requires zizmor ${MIN_ZIZMOR_VERSION} or newer. Please update zizmor and try again.`
            : `Failed to check zizmor version: ${versionCheck.error}. Please ensure zizmor is installed and accessible at "${executablePath}".`;

        vscode.window.showErrorMessage(errorMessage);
        return;
    }

    await startLanguageServer(context, executablePath);
}

async function startLanguageServer(context: vscode.ExtensionContext, executablePath: string) {
    // Create separate output channels - one for extension logs, one for LSP
    const outputChannel = vscode.window.createOutputChannel('zizmor');
    context.subscriptions.push(outputChannel);

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

    client = new LanguageClient(
        'zizmor',
        'zizmor Language Server',
        serverOptions,
        clientOptions
    );

    // Add client to subscriptions for proper disposal
    context.subscriptions.push(client);

    // Start the client. This will also launch the server
    try {
        await client.start();
        outputChannel.appendLine('zizmor language server started successfully');
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMessage = `Failed to start zizmor language server: ${message}`;
        outputChannel.appendLine(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
    }

    // Register configuration change handler
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('zizmor')) {
                // Restart the language server when configuration changes
                await vscode.commands.executeCommand('zizmor.restart');
            }
        })
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('zizmor.restart', async () => {
            if (!client) {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Restarting zizmor language server...',
                    cancellable: false
                },
                async () => {
                    try {
                        await client!.restart();
                        vscode.window.showInformationMessage('zizmor language server restarted successfully');
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : String(error);
                        vscode.window.showErrorMessage(`Failed to restart zizmor: ${message}`);
                    }
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zizmor.showOutputChannel', () => {
            outputChannel.show();
        })
    );
}

export async function deactivate(): Promise<void> {
    if (client) {
        await client.stop();
        client = undefined;
    }
}
