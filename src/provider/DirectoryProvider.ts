import * as vscode from "vscode";
import { FileSystemObject } from "../types/FileSystemObject";
import { DirectoryWorker } from "../operator/DirectoryWorker";

export class DirectoryProvider
  implements
    vscode.TreeDataProvider<FileSystemObject>,
    vscode.TreeDragAndDropController<FileSystemObject>
{
  dropMimeTypes = ["application/vnd.code.tree.explorerbookmark"];
  dragMimeTypes = ["application/vnd.code.tree.explorerbookmark"];
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

  async handleDrag(
    source: readonly FileSystemObject[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void>
  {
    // Only allow dragging directly bookmarked items
    const directlyBookmarked = source.filter(
      (item) => item.contextValue === "directlyBookmarkedDirectory"
    );

    if (directlyBookmarked.length > 0)
    {
      dataTransfer.set(
        "application/vnd.code.tree.explorerbookmark",
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
    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.explorerbookmark"
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

    // Reorder: insert before the target
    this.directoryOperator.reorderBookmark(sourcePath, targetPath, true);
    this.refresh();
  }
}
