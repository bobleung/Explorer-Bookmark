import * as vscode from "vscode";
import { FileSystemObject } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";

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
