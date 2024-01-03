import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";

export function activate(context: vscode.ExtensionContext)
{
  const directoryOperator = new DirectoryWorker(
    context,
    vscode.workspace.workspaceFolders
  );

  const directoryProvider = new DirectoryProvider(
    directoryOperator
  );

  vscode.window.registerTreeDataProvider("explorer-bookmark", directoryProvider);

  context.subscriptions.push(
    ...[
      vscode.commands.registerCommand("explorer-bookmark.refreshEntry", () =>
        directoryProvider.refresh()
      ),
      vscode.commands.registerCommand("explorer-bookmark.openFile", (file) =>
      {
        vscode.commands.executeCommand(
          "vscode.open",
          vscode.Uri.parse(file.resourceUri.path)
        );
      }),
      vscode.commands.registerCommand("explorer-bookmark.selectItem", (args) =>
        directoryProvider.selectItem(vscode.Uri.parse(args.path))
      ),
      vscode.commands.registerCommand(
        "explorer-bookmark.removeItem",
        (args) =>
        {
          directoryProvider.removeItem(args.resourceUri);
        }
      ),
      vscode.commands.registerCommand(
        "explorer-bookmark.cantRemoveItemMsg",
        () =>
        {
          vscode.window.showInformationMessage(
            "You can only remove items that were directly added to the view"
          );
        }
      ),
      vscode.commands.registerCommand("explorer-bookmark.removeAllItems", () =>
        directoryProvider.removeAllItems()
      ),
    ]
  );
}

export function deactivate() { }
