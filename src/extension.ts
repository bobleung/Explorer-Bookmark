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

  vscode.window.registerTreeDataProvider(
    "explorer-bookmark",
    directoryProvider);

  context.subscriptions.push(
    ...[
      vscode.commands.registerCommand(
        DirectoryProviderActions.RefreshEntry,
        () => directoryProvider.refresh()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderActions.OpenItem,
        (file) =>
        {
          vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.parse(file.resourceUri.path)
          );
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderActions.SelectItem,
        (args) => directoryProvider.selectItem(vscode.Uri.parse(args.path))
      ),
      vscode.commands.registerCommand(
        DirectoryProviderActions.RemoveItem,
        (args) =>
        {
          directoryProvider.removeItem(args.resourceUri);
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderActions.CantRemoveItem,
        () =>
        {
          vscode.window.showInformationMessage(
            "You can only remove items that were directly added to the view"
          );
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderActions.RemoveAllItems,
        () => directoryProvider.removeAllItems()
      ),
    ]
  );
}

export function deactivate() { }
