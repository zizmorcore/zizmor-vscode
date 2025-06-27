# Change Log

All notable changes to the "zizmor-vscode" extension will be documented in this file.

## [0.1.0] - 2025-06-27

### Added
- Initial release of zizmor VS Code extension
- Language client implementation for zizmor LSP server
- Support for YAML files (GitHub Actions workflows)
- Configuration settings:
  - `zizmor.enable` - Enable/disable the language server
  - `zizmor.executablePath` - Custom path to zizmor executable
  - `zizmor.trace.server` - LSP communication tracing
- Commands:
  - `zizmor.restart` - Restart the language server
  - `zizmor.showOutputChannel` - Show server output
- Automatic server lifecycle management
- Error handling and user notifications
