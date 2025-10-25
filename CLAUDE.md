# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Explorer Bookmark is a VS Code extension that provides a quick-access bookmarking system for folders and files. It helps developers navigate large repositories by allowing them to bookmark frequently used files/folders in a dedicated explorer view.

## Development Commands

### Building and Compilation
- `npm run compile` - Compile TypeScript to JavaScript (output to `./out`)
- `npm run watch` - Compile in watch mode for development
- `npm run vscode:prepublish` - Prepare extension for publishing (runs compile)
- `npx vsce package` - Package extension as .vsix file for installation

**IMPORTANT**: Every time you make a build for release, you MUST update [changelog.md](changelog.md) with the changes made in that version.

### Testing and Quality
- `npm run test` - Run extension tests (compiles, lints, then runs tests)
- `npm run pretest` - Compile and lint before running tests
- `npm run lint` - Run ESLint on TypeScript source files in `src/`

### Debugging
- Use "Run Extension" launch configuration in VS Code to open a new Extension Development Host window
- Use "Extension Tests" launch configuration to run tests in debug mode
- Both configurations automatically run the default build task before launching

## Architecture

### Core Architecture Pattern: Operator/Worker + Provider

The extension follows a separation of concerns pattern with three main layers:

1. **DirectoryProvider** ([src/provider/DirectoryProvider.ts](src/provider/DirectoryProvider.ts))
   - Implements `vscode.TreeDataProvider<FileSystemObject>`
   - Handles VS Code tree view rendering and refresh events
   - Delegates all business logic to DirectoryWorker
   - Acts as the view layer

2. **DirectoryWorker** ([src/operator/DirectoryWorker.ts](src/operator/DirectoryWorker.ts))
   - The "operator" or business logic layer
   - Manages bookmarked directories state
   - Handles persistence using VS Code's `workspaceState` (workspace-specific) or `globalState` (global bookmarks)
   - Implements CRUD operations: add, remove, remove all
   - Performs file system operations via `vscode.workspace.fs` API
   - State hydration occurs in constructor, reading from appropriate state store based on workspace presence

3. **Extension Entry** ([src/extension.ts](src/extension.ts))
   - Wires up DirectoryWorker and DirectoryProvider
   - Registers tree data provider with view ID `explorer-bookmark`
   - Registers all commands defined in `DirectoryProviderCommands` enum
   - Commands are registered in `activate()` function

### Data Models

- **FileSystemObject** ([src/types/FileSystemObject.ts](src/types/FileSystemObject.ts))
  - Extends `vscode.TreeItem`
  - Represents both files and directories in the tree view
  - Auto-configures click command for files (not directories)
  - Uses `contextValue` to distinguish directly bookmarked items (for context menu)

- **TypedDirectory** ([src/types/TypedDirectory.ts](src/types/TypedDirectory.ts))
  - Lightweight model storing path and file type
  - Used for persistence/serialisation of bookmarked items
  - Factory function `buildTypedDirectory()` creates instances from URIs

### Command System

All commands are defined in [src/commands/CrudCommands.ts](src/commands/CrudCommands.ts):
- `directoryprovider/selectitem` - Add file/folder to bookmarks
- `directoryprovider/removeitem` - Remove directly bookmarked item
- `directoryprovider/cantremoveitem` - Shown for nested items (not directly bookmarked)
- `directoryprovider/removeallitems` - Clear all bookmarks
- `directoryprovider/refreshentry` - Refresh tree view
- `directoryprovider/openitem` - Open file in editor (automatically triggered on file click)
- `directoryprovider/togglereorder` - Toggle reorder mode for drag-and-drop reordering

### State Persistence

Bookmarks are stored differently based on context:
- **Workspace open**: Uses `extensionContext.workspaceState` (workspace-specific bookmarks)
- **No workspace**: Uses `extensionContext.globalState` (global bookmarks across all instances)

Storage key: `storedBookmarks`

### Configuration

Single configuration setting defined in [package.json](package.json):
- `explorer-bookmark.saveWorkspace` (boolean, default: true) - Determines if bookmarks persist after closing VS Code

### Tree View Integration

The extension contributes to the built-in Explorer view sidebar:

- View ID: `explorer-bookmark`
- Display name: "Explorer Bookmark"
- Context menu in Explorer: "Add to Explorer Bookmark" command
- View toolbar: Toggle Reorder Mode, Refresh, and Remove All Items buttons
- Item context menu: Remove button (inline) for directly bookmarked items only

### Drag and Drop / Reorder Mode

The extension implements `vscode.TreeDragAndDropController` for reordering bookmarks:

**Reorder Mode Toggle:**
- Toolbar button toggles reorder mode on/off
- Private `isReorderMode` state in DirectoryProvider tracks mode
- Affects rendering and drag-and-drop availability

**Reorder Mode Behaviour:**
- All folders collapse and cannot be expanded (`getChildren()` returns empty array for nested items)
- Items display with visual indicators: `⇅ 📁 foldername` for folders, `⇅ filename` for files
- Collapse arrows and theme icons hidden (via `collapsibleState.None` and `iconPath = ThemeIcon('blank')`)
- Drag-and-drop enabled only in reorder mode (checked in `handleDrag` and `handleDrop`)

**Drag and Drop Implementation:**
- MIME type: `application/vnd.code.tree.explorer-bookmark` (matches view ID)
- Drop behaviour: Insert AFTER the target item (`dropBefore: false`)
- `handleDrag()` always allows drag to start (for hover highlighting to work)
- `handleDrop()` rejects drops when not in reorder mode
- Hover highlighting: VS Code's built-in `list.dropBackground` provides visual feedback

**Key Learnings:**
- DO NOT return early from `handleDrag()` if you want hover highlighting - let the drag start, then reject in `handleDrop()`
- To preserve folder/file icons in normal mode: don't set `iconPath`, let VS Code use `resourceUri` + `collapsibleState`
- To hide icons in reorder mode: set `collapsibleState.None` + `iconPath = ThemeIcon('blank')`
- Icon gap spacing is controlled by VS Code's tree view and cannot be removed via extension API

## Important Implementation Notes

- File system operations use `vscode.workspace.fs` API (async), not Node.js `fs` module
- URIs are always file URIs created with `vscode.Uri.file()` or `vscode.Uri.parse()`
- Tree items are sorted alphabetically by name in `directorySearch()`
- Directories are collapsible in normal mode, all items are non-collapsible in reorder mode
- The extension only activates on command execution (see `activationEvents` in package.json)
- Context value `directlyBookmarkedDirectory` distinguishes user-added items from their nested children for menu visibility
- Set `resourceUri` on TreeItem for proper icon theme integration
