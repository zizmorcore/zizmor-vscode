import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    Executable
} from 'vscode-languageclient/node';

let client: LanguageClient;
let log = vscode.window.createOutputChannel('zizmor Extension Log');

const execAsync = promisify(exec);
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
        const { stdout } = await execAsync(`"${executablePath}" --version`);
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
    } catch (error: any) {
        return {
            isValid: false,
            error: `Failed to execute zizmor --version: ${error.message}`
        };
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Get configuration
    const config = vscode.workspace.getConfiguration('zizmor');
    const enabled = config.get<boolean>('enable', true);

    if (!enabled) {
        return;
    }

    // Get the path to the zizmor executable
    const rawExecutablePath = config.get<string>('executablePath', 'zizmor');
    const executablePath = expandTilde(rawExecutablePath);

    // Check zizmor version before starting the language server
    checkZizmorVersion(executablePath).then(versionCheck => {
        if (!versionCheck.isValid) {
            const errorMessage = versionCheck.version
                ? `zizmor version ${versionCheck.version} is too old. This extension requires zizmor ${MIN_ZIZMOR_VERSION} or newer. Please update zizmor and try again.`
                : `Failed to check zizmor version: ${versionCheck.error}. Please ensure zizmor is installed and accessible at "${executablePath}".`;

            log.appendLine(`zizmor version check failed: ${errorMessage}`);
            vscode.window.showErrorMessage(errorMessage);
            return;
        }

        log.appendLine(`zizmor version ${versionCheck.version} meets minimum requirement (${MIN_ZIZMOR_VERSION})`);
        startLanguageServer(context, executablePath);
    }).catch(error => {
        const errorMessage = `Failed to start zizmor language server: ${error.message}`;
        log.appendLine(`zizmor activation failed: ${errorMessage}`);
        vscode.window.showErrorMessage(errorMessage);
    });
}

function startLanguageServer(context: vscode.ExtensionContext, executablePath: string) {

    // Define the server options
    const serverExecutable: Executable = {
        command: executablePath,
        args: ['--lsp'],
        transport: TransportKind.stdio
    };

    const serverOptions: ServerOptions = serverExecutable;

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'yaml', pattern: '**/.github/workflows/*.{yml,yaml}' },
            { scheme: 'file', language: 'yaml', pattern: '**/action.{yml,yaml}' },
            { scheme: 'file', language: 'github-actions-workflow', pattern: '**/.github/workflows/*.{yml,yaml}' },
            { scheme: 'file', language: 'github-actions-workflow', pattern: '**/action.{yml,yaml}' },
            { scheme: 'file', language: 'yaml', pattern: '**/.github/dependabot.{yml,yaml}' },
        ],
        traceOutputChannel: vscode.window.createOutputChannel('zizmor LSP trace')
    };

    client = new LanguageClient(
        'zizmor',
        'zizmor Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start().then(() => {
        log.appendLine('zizmor language server started successfully');
    }).catch((error: any) => {
        log.appendLine(`Failed to start zizmor language server: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to start zizmor language server: ${error.message}`);
    });

    // Register configuration change handler
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('zizmor')) {
                // Restart the language server when configuration changes
                if (client) {
                    client.stop().then(() => {
                        activate(context);
                    });
                }
            }
        })
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('zizmor.restart', () => {
            if (client) {
                client.restart();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zizmor.showOutputChannel', () => {
            client.outputChannel.show();
        })
    );
}

export function deactivate(): Promise<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
