import * as vscode from "vscode";
import { FileSystemObject } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";
import { CollaborativePanel } from "../webview/CollaborativePanel";
import { GitHubService } from "../services/GitHubService";

export class DirectoryProvider
  implements vscode.TreeDataProvider<FileSystemObject>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileSystemObject | undefined | null | void
  > = new vscode.EventEmitter<FileSystemObject | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<
    FileSystemObject | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(
    private directoryOperator: DirectoryWorker,
  )
  { }

  getTreeItem(
    element: FileSystemObject
  ): vscode.TreeItem | Thenable<vscode.TreeItem>
  {
    return element;
  }

  async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]>
  {
    return await this.directoryOperator.getChildren(element);
  }

  async selectItem(uri: vscode.Uri | undefined, sectionId?: string)
  {
    await this.directoryOperator.selectItem(uri, sectionId);
    this.refresh();
  }

  async removeItem(uri: vscode.Uri | undefined, sectionId?: string)
  {
    await this.directoryOperator.removeItem(uri, sectionId);
    this.refresh();
  }

  async addSection(name: string)
  {
    await this.directoryOperator.addSection(name);
    this.refresh();
  }

  async removeSection(sectionId: string)
  {
    await this.directoryOperator.removeSection(sectionId);
    this.refresh();
  }

  async viewAISummary(uri: vscode.Uri)
  {
    await this.directoryOperator.viewAISummary(uri);
  }

  async addComment(uri: vscode.Uri)
  {
    await this.directoryOperator.addComment(uri);
    this.refresh();
  }

  async addTags(uri: vscode.Uri)
  {
    await this.directoryOperator.addTags(uri);
    this.refresh();
  }

  async showGitDiff(uri: vscode.Uri)
  {
    await this.directoryOperator.showGitDiff(uri);
  }

  async exportTeamBookmarks()
  {
    await this.directoryOperator.exportTeamBookmarks();
  }

  async importTeamBookmarks()
  {
    await this.directoryOperator.importTeamBookmarks();
    this.refresh();
  }

  async syncTeamBookmarks()
  {
    await this.directoryOperator.syncTeamBookmarks();
    this.refresh();
  }

  async injectTeamBookmarks()
  {
    await this.directoryOperator.injectTeamBookmarks();
    this.refresh();
  }

  // New Collaborative Methods
  async openCollaborationPanel(uri: vscode.Uri)
  {
    const item = await this.directoryOperator.getTypedDirectoryForUri(uri);
    if (item)
    {
      const context = vscode.extensions.getExtension('UrosVujosevic.explorer-manager')?.extensionUri;
      if (context)
      {
        CollaborativePanel.createOrShow(context, item);
      }
    }
  }

  async addQuickComment(uri: vscode.Uri)
  {
    const comment = await vscode.window.showInputBox({
      placeHolder: 'Enter your comment...',
      prompt: 'Add a quick comment to this bookmark'
    });

    if (comment)
    {
      await this.directoryOperator.addQuickComment(uri, comment);
      this.refresh();
    }
  }

  async manageWatchers(uri: vscode.Uri)
  {
    const item = await this.directoryOperator.getTypedDirectoryForUri(uri);
    if (!item) return;

    const action = await vscode.window.showQuickPick([
      { label: 'Add Watcher', description: 'Add a user to watch this bookmark' },
      { label: 'Remove Watcher', description: 'Remove a user from watching this bookmark' },
      { label: 'View Watchers', description: 'View all current watchers' }
    ], {
      placeHolder: 'Choose watcher action'
    });

    if (!action) return;

    switch (action.label)
    {
      case 'Add Watcher':
        const userId = await vscode.window.showInputBox({
          placeHolder: 'Enter user ID',
          prompt: 'User ID to add as watcher'
        });
        if (userId)
        {
          item.addWatcher(userId);
          await this.directoryOperator.saveItems();
          this.refresh();
        }
        break;

      case 'Remove Watcher':
        if (item.watchers.length === 0)
        {
          vscode.window.showInformationMessage('No watchers to remove');
          return;
        }
        const watcherToRemove = await vscode.window.showQuickPick(
          item.watchers.map((w: string) => ({ label: w, description: 'Remove this watcher' })),
          { placeHolder: 'Select watcher to remove' }
        );
        if (watcherToRemove)
        {
          item.removeWatcher(watcherToRemove.label);
          await this.directoryOperator.saveItems();
          this.refresh();
        }
        break;

      case 'View Watchers':
        if (item.watchers.length === 0)
        {
          vscode.window.showInformationMessage('No watchers for this bookmark');
        } else
        {
          vscode.window.showInformationMessage(`Watchers: ${item.watchers.join(', ')}`);
        }
        break;
    }
  }

  async updateStatus(uri: vscode.Uri)
  {
    const item = await this.directoryOperator.getTypedDirectoryForUri(uri);
    if (!item) return;

    const status = await vscode.window.showQuickPick([
      { label: 'active', description: 'Item is actively being worked on' },
      { label: 'in-review', description: 'Item is under review' },
      { label: 'completed', description: 'Item work is completed' },
      { label: 'archived', description: 'Item is archived' }
    ], {
      placeHolder: 'Select new status'
    });

    if (status)
    {
      const currentUser = vscode.env.machineId;
      item.updateStatus(status.label as any, currentUser);
      await this.directoryOperator.saveItems();
      this.refresh();
      vscode.window.showInformationMessage(`Status updated to ${status.label}`);
    }
  }

  async updatePriority(uri: vscode.Uri)
  {
    const item = await this.directoryOperator.getTypedDirectoryForUri(uri);
    if (!item) return;

    const priority = await vscode.window.showQuickPick([
      { label: 'low', description: 'Low priority item' },
      { label: 'medium', description: 'Medium priority item' },
      { label: 'high', description: 'High priority item' },
      { label: 'critical', description: 'Critical priority item' }
    ], {
      placeHolder: 'Select new priority'
    });

    if (priority)
    {
      const currentUser = vscode.env.machineId;
      item.updatePriority(priority.label as any, currentUser);
      await this.directoryOperator.saveItems();
      this.refresh();
      vscode.window.showInformationMessage(`Priority updated to ${priority.label}`);
    }
  }

  async showActivityHistory(uri: vscode.Uri)
  {
    const item = await this.directoryOperator.getTypedDirectoryForUri(uri);
    if (!item) return;

    const recentActivity = item.getRecentActivity(30); // Last 30 days

    if (recentActivity.length === 0)
    {
      vscode.window.showInformationMessage('No recent activity for this bookmark');
      return;
    }

    const activityItems = recentActivity.map((activity: any) => ({
      label: `${activity.type}: ${activity.description}`,
      description: `by ${activity.author} on ${activity.timestamp.toLocaleDateString()}`
    }));

    await vscode.window.showQuickPick(activityItems, {
      placeHolder: 'Recent Activity History'
    });
  }

  async createPullRequest(uri: vscode.Uri)
  {
    await this.directoryOperator.createPullRequest(uri);
  }

  async linkPullRequest(uri: vscode.Uri)
  {
    const prUrl = await vscode.window.showInputBox({
      placeHolder: 'https://github.com/owner/repo/pull/123',
      prompt: 'Enter the GitHub PR URL to link'
    });

    if (prUrl)
    {
      await this.directoryOperator.linkPullRequest(uri, prUrl);
      this.refresh();
    }
  }

  async showOnGitHub(uri: vscode.Uri)
  {
    await this.directoryOperator.showOnGitHub(uri);
  }

  async generateShareableConfig()
  {
    await this.directoryOperator.generateShareableConfig();
  }

  removeAllItems()
  {
    this.directoryOperator.removeAllItems();
    this.refresh();
  }

  refresh(): void
  {
    this._onDidChangeTreeData.fire();
  }
}
