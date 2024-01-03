import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory } from "../types/TypedDirectory";
import { buildTypedDirectory } from "../types/TypedDirectory";

export class DirectoryProvider
  implements vscode.TreeDataProvider<FileSystemObject>
{
  private bookmarkedDirectories: TypedDirectory[] = [];
  private saveWorkspaceSetting: boolean | undefined = false;
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileSystemObject | undefined | null | void
  > = new vscode.EventEmitter<FileSystemObject | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<
    FileSystemObject | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(
    private extensionContext: vscode.ExtensionContext,
    private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
  )
  {
    this.hydrateState();
    if (this.saveWorkspaceSetting && this.bookmarkedDirectories.length > 0)
    {
      this.refresh();
    }
  }

  getTreeItem(
    element: FileSystemObject
  ): vscode.TreeItem | Thenable<vscode.TreeItem>
  {
    return element;
  }

  async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]>
  {
    if (element)
    {
      return this.directorySearch(element.resourceUri);
    } else
    {
      return this.bookmarkedDirectories.length > 0
        ? this.createEntries(this.bookmarkedDirectories)
        : Promise.resolve([]);
    }
  }

  async selectItem(uri: vscode.Uri | undefined)
  {
    if (uri)
    {
      this.bookmarkedDirectories.push(await buildTypedDirectory(uri));
    }
    this.refresh();
    this.saveWorkspace();
  }

  async removeItem(uri: vscode.Uri | undefined)
  {
    if (uri)
    {
      const typedDirectory = await buildTypedDirectory(uri)
      const index = this.bookmarkedDirectories.indexOf(typedDirectory);
      if (index > -1)
      {
        this.bookmarkedDirectories.splice(index, 1);
      }
    }
    this.refresh();
    this.saveWorkspace();
  }

  private async directorySearch(uri: vscode.Uri)
  {
    const folders = await vscode.workspace.fs.readDirectory(uri);
    return folders
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((item) =>
      {
        const [name, type] = item;
        const isDirectory =
          type === vscode.FileType.Directory
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

        return new FileSystemObject(
          name,
          isDirectory,
          vscode.Uri.file(uri.path + "/" + name)
        );
      });
  }

  private async createEntries(selectedFSObjects: TypedDirectory[])
  {
    let folderSystem: FileSystemObject[] = [];

    for (const fsItem of selectedFSObjects)
    {
      const { path: filePath, type: type } = fsItem;
      const file = vscode.Uri.file(filePath);

      folderSystem.push(
        new FileSystemObject(
          `${path.basename(fsItem.path)}`,
          type === vscode.FileType.File
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Collapsed,
          file
        ).setContextValue("directlySavedItem")
      );
    }

    return folderSystem;
  }

  private hydrateState(): void
  {
    this.saveWorkspaceSetting = vscode.workspace
      .getConfiguration("explorer-bookmark")
      .get("saveWorkspace");
    this.bookmarkedDirectories =
      (this.workspaceRoot
        ? this.extensionContext.workspaceState.get("savedWorkspaceItems")
        : this.extensionContext.globalState.get("savedWorkspaceItems")) || [];
  }

  removeAllItems()
  {
    this.bookmarkedDirectories = [];
    this.refresh();
    this.saveWorkspace();
  }

  refresh(): void
  {
    this._onDidChangeTreeData.fire();
  }

  saveWorkspace()
  {
    this.workspaceRoot
      ? this.extensionContext.workspaceState.update(
        "savedWorkspaceItems",
        this.bookmarkedDirectories
      )
      : this.extensionContext.globalState.update(
        "savedWorkspaceItems",
        this.bookmarkedDirectories
      );
  }
}
