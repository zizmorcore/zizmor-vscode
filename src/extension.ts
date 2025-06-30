import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    Executable
} from 'vscode-languageclient/node';

let client: LanguageClient;

/**
 * Expands tilde (~) in file paths to the user's home directory
 */
function expandTilde(filePath: string): string {
    if (filePath.startsWith('~/')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
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
        console.log('zizmor language server started successfully');
    }).catch((error: any) => {
        console.error('Failed to start zizmor language server:', error);
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
