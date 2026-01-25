# zizmor-vscode

![Open VSX Version](https://img.shields.io/open-vsx/v/zizmor/zizmor-vscode)
![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/zizmor.zizmor-vscode)

A Visual Studio Code extension for [zizmor].

Available on the following marketplaces:

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zizmor.zizmor-vscode)
- [Open VSX](https://open-vsx.org/extension/zizmor/zizmor-vscode)

[zizmor]: https://github.com/zizmorcore/zizmor

## Installation

> [!IMPORTANT]
> You **must** have `zizmor` v1.11.0 or later installed; earlier versions
> do not include LSP support.
>
> If `zizmor --version` shows a version below 1.11.0, you **must** update
> `zizmor` to use this extension.

To use this extension, you must have `zizmor` installed on your system.
See [zizmor's installation documentation] for system-appropriate instructions.

[zizmor's installation documentation]: https://docs.zizmor.sh/installation/

Once you have `zizmor` installed, you can install this extension from
the Visual Studio Marketplace or from Open VSX. See the links above.

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
bun ci
bun run compile
```

### Running the extension

1. Open this project in VS Code
2. Press `F5` to open a new Extension Development Host window
3. Open an action or workflow file to test the extension

### Debugging

- Set breakpoints in the TypeScript source files
- Use the "Run Extension" launch configuration
- Check the "Zizmor Language Server Trace" output channel for server communication

### Building for release

```bash
bun run vsce:package
```

## License

This extension is licensed under the terms of the MIT license.

See [LICENSE](LICENSE) for the full terms.

