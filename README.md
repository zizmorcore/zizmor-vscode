# zizmor-vscode

A VS Code language client extension that provides integration with
[zizmor]'s [LSP] server.

[zizmor]: https://github.com/zizmorcore/zizmor
[LSP]: https://microsoft.github.io/language-server-protocol/


## Requirements

- VS Code 1.74.0 or higher
- `zizmor` binary must be installed and available in your PATH (or specify custom path in settings)

## Extension Settings

This extension contributes the following settings:

- `zizmor.enable`: Enable/disable the zizmor language server (default: `true`)
- `zizmor.executablePath`: Path to the zizmor executable (default: `zizmor`)
- `zizmor.trace.server`: Traces the communication between VS Code and the language server
  - `"off"` (default): No tracing
  - `"messages"`: Trace messages only
  - `"verbose"`: Verbose tracing

## Commands

This extension contributes the following commands:

- `zizmor: Restart zizmor Language Server` - Restart the language server
- `zizmor: Show zizmor Output` - Show the language server output channel

## Development

### Building from source

```bash
npm install
npm run compile
```

### Running the extension

1. Open this project in VS Code
2. Press `F5` to open a new Extension Development Host window
3. Open a YAML file to test the extension

### Debugging

- Set breakpoints in the TypeScript source files
- Use the "Run Extension" launch configuration
- Check the "Zizmor Language Server Trace" output channel for server communication

## License

This extension is licensed under the terms of the MIT license.

See [LICENSE](LICENSE) for the full terms.

