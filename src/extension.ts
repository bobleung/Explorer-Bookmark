import * as vscode from "vscode";
import { DirectoryProvider } from "./provider/DirectoryProvider";
import { DirectoryWorker } from "./operator/DirectoryWorker";
import { DirectoryProviderCommands } from "./commands/CrudCommands";
import { vsCodeCommands } from "./commands/CrudCommands";
import { CollaborativePanel } from "./webview/CollaborativePanel";
import { GitHubService } from "./services/GitHubService";

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
        DirectoryProviderCommands.RefreshEntry,
        () => directoryProvider.refresh()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.OpenItem,
        (file) =>
        {
          vscode.commands.executeCommand(
            vsCodeCommands.Open,
            vscode.Uri.parse(file.resourceUri.path)
          );
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.SelectItem,
        (args) => directoryProvider.selectItem(vscode.Uri.parse(args.path))
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.SelectItemToSection,
        async (args) =>
        {
          // Ask user to select section
          const sectionId = await directoryOperator.askUserForSection();
          if (sectionId)
          {
            directoryProvider.selectItem(vscode.Uri.parse(args.path), sectionId);
          }
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.RemoveItem,
        (args) =>
        {
          directoryProvider.removeItem(args.resourceUri, args.sectionId);
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.AddSection,
        async () =>
        {
          const name = await vscode.window.showInputBox({
            placeHolder: 'Enter section name',
            prompt: 'Name for the new bookmark section'
          });
          if (name && name.trim())
          {
            directoryProvider.addSection(name.trim());
          }
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.RemoveSection,
        (args) =>
        {
          directoryProvider.removeSection(args.sectionId);
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.CantRemoveItem,
        () =>
        {
          vscode.window.showInformationMessage(
            "You can only remove items that were directly added to the view"
          );
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.RemoveAllItems,
        () => directoryProvider.removeAllItems()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.ViewAISummary,
        (args) => directoryProvider.viewAISummary(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.AddBookmarkComment,
        (args) => directoryProvider.addComment(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.AddBookmarkTags,
        (args) => directoryProvider.addTags(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.ShowGitDiff,
        (args) => directoryProvider.showGitDiff(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.ExportTeamBookmarks,
        () => directoryProvider.exportTeamBookmarks()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.ImportTeamBookmarks,
        () => directoryProvider.importTeamBookmarks()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.SyncTeamBookmarks,
        () => directoryProvider.syncTeamBookmarks()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.InjectTeamBookmarks,
        () => directoryProvider.injectTeamBookmarks()
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.OpenCollaboration,
        (args) =>
        {
          if (args && args.resourceUri)
          {
            directoryProvider.openCollaborationPanel(args.resourceUri);
          }
        }
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.AddComment,
        (args) => directoryProvider.addQuickComment(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.ManageWatchers,
        (args) => directoryProvider.manageWatchers(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.UpdateStatus,
        (args) => directoryProvider.updateStatus(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.UpdatePriority,
        (args) => directoryProvider.updatePriority(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.ShowActivity,
        (args) => directoryProvider.showActivityHistory(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.CreatePR,
        (args) => directoryProvider.createPullRequest(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.LinkPR,
        (args) => directoryProvider.linkPullRequest(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.ShowGitHub,
        (args) => directoryProvider.showOnGitHub(args.resourceUri)
      ),
      vscode.commands.registerCommand(
        DirectoryProviderCommands.SetupGitHub,
        async () =>
        {
          const githubService = new GitHubService();
          await githubService.setupToken();
        }
      ),
    ]
  );
}

export function deactivate() { }
