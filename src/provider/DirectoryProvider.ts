import * as vscode from "vscode";
import { FileSystemObject } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";
import { GitHubService } from "../services/GitHubService";
import { GitService } from "../services/GitService";

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

  // Get current user identifier (git username or fallback)
  private async getCurrentUser(): Promise<string>
  {
    try
    {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0)
      {
        const gitService = new GitService(workspaceFolders[0].uri.fsPath);
        return await gitService.getCurrentGitUser();
      }
    } catch (error)
    {
      console.error('Error getting git user:', error);
    }

    // Fallback to shortened machine ID if git not available
    return vscode.env.machineId.substring(0, 8);
  }

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

  async cherryPickChanges(uri: vscode.Uri)
  {
    await this.directoryOperator.cherryPickChanges(uri);
  }

  async gitAddFile(uri: vscode.Uri)
  {
    await this.directoryOperator.gitAddFile(uri);
  }

  async gitCommitFile(uri: vscode.Uri)
  {
    await this.directoryOperator.gitCommitFile(uri);
  }

  async gitStashFile(uri: vscode.Uri)
  {
    await this.directoryOperator.gitStashFile(uri);
  }

  async gitPushBookmarkedFiles()
  {
    await this.directoryOperator.gitPushBookmarkedFiles();
  }

  async gitFetch()
  {
    await this.directoryOperator.gitFetch();
  }

  async gitPull()
  {
    await this.directoryOperator.gitPull();
  }

  async gitRebase()
  {
    await this.directoryOperator.gitRebase();
  }

  async gitOperations()
  {
    await this.directoryOperator.gitOperations();
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
      const currentUser = await this.getCurrentUser();
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
      const currentUser = await this.getCurrentUser();
      item.updatePriority(priority.label as any, currentUser);
      await this.directoryOperator.saveItems();
      this.refresh();
      vscode.window.showInformationMessage(`Priority updated to ${priority.label}`);
    }
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
