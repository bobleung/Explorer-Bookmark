import * as vscode from "vscode";
import { FileSystemObject } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";

export class DirectoryProvider
  implements
    vscode.TreeDataProvider<FileSystemObject>,
    vscode.TreeDragAndDropController<FileSystemObject>
{
  dropMimeTypes = ["application/vnd.code.tree.explorer-bookmark"];
  dragMimeTypes = ["application/vnd.code.tree.explorer-bookmark"];
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileSystemObject | undefined | null | void
  > = new vscode.EventEmitter<FileSystemObject | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<
    FileSystemObject | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private isReorderMode: boolean = false;

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
    return await this.directoryOperator.getChildren(element, this.isReorderMode);
  }

  async selectItem(uri: vscode.Uri | undefined)
  {
    await this.directoryOperator.selectItem(uri);
    this.refresh();
  }

  async removeItem(uri: vscode.Uri | undefined)
  {
    await this.directoryOperator.removeItem(uri);
    this.refresh();
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

  toggleReorderMode(): void
  {
    this.isReorderMode = !this.isReorderMode;

    // Update context for when clause
    vscode.commands.executeCommand('setContext', 'explorer-bookmark.isReorderMode', this.isReorderMode);

    // Show toast message
    const message = this.isReorderMode
      ? 'Reorder mode enabled'
      : 'Reorder mode disabled';
    vscode.window.showInformationMessage(message);

    this.refresh();
  }

  async handleDrag(
    source: readonly FileSystemObject[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void>
  {
    // Allow drag to start so VS Code shows hover highlighting
    // (drop will be rejected in handleDrop if not in reorder mode)

    // Only allow dragging directly bookmarked items
    const directlyBookmarked = source.filter(
      (item) => item.contextValue === "directlyBookmarkedDirectory"
    );

    if (directlyBookmarked.length > 0)
    {
      dataTransfer.set(
        "application/vnd.code.tree.explorer-bookmark",
        new vscode.DataTransferItem(directlyBookmarked[0].resourceUri.fsPath)
      );
    }
  }

  async handleDrop(
    target: FileSystemObject | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void>
  {
    // Only allow dropping when in reorder mode
    if (!this.isReorderMode)
    {
      return;
    }

    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.explorer-bookmark"
    );

    if (!transferItem)
    {
      return;
    }

    const sourcePath = transferItem.value;

    // If target is undefined, drop at the end
    if (!target)
    {
      return;
    }

    // Only allow dropping on directly bookmarked items
    if (target.contextValue !== "directlyBookmarkedDirectory")
    {
      return;
    }

    const targetPath = target.resourceUri.fsPath;

    // Reorder: insert after the target
    this.directoryOperator.reorderBookmark(sourcePath, targetPath, false);
    this.refresh();
  }
}
