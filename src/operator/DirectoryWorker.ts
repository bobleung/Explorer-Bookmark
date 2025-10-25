import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory } from "../types/TypedDirectory";
import { buildTypedDirectory } from "../types/TypedDirectory";

export class DirectoryWorker
{
    readonly vsCodeExtensionConfigurationKey: string = "explorer-bookmark";
    readonly saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
    readonly storedBookmarksContextKey: string = "storedBookmarks";
    readonly bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";

    private bookmarkedDirectories: TypedDirectory[] = [];
    private saveWorkspaceSetting: boolean | undefined = false;

    constructor(
        private extensionContext: vscode.ExtensionContext,
        private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
    )
    {
        this.hydrateState();
    }

    public async getChildren(element?: FileSystemObject, isEditMode: boolean = false): Promise<FileSystemObject[]>
    {
        if (element)
        {
            // In edit mode, don't show nested children
            if (isEditMode)
            {
                return Promise.resolve([]);
            }
            return this.directorySearch(element.resourceUri);
        } else
        {
            return this.bookmarkedDirectories.length > 0
                ? this.createEntries(this.bookmarkedDirectories, isEditMode)
                : Promise.resolve([]);
        }
    }

    public async selectItem(uri: vscode.Uri | undefined)
    {
        if (uri)
        {
            this.bookmarkedDirectories.push(await buildTypedDirectory(uri));
        }
        this.saveBookmarks();
    }

    public async removeItem(uri: vscode.Uri | undefined)
    {
        if (uri)
        {
            const typedDirectory = await buildTypedDirectory(uri);
            const index =
                this.bookmarkedDirectories.map(e => e.path)
                    .indexOf(typedDirectory.path);
            if (index > -1)
            {
                this.bookmarkedDirectories.splice(index, 1);
            }
        }
        this.saveBookmarks();
    }

    public removeAllItems()
    {
        this.bookmarkedDirectories = [];
        this.saveBookmarks();
    }

    public reorderBookmark(sourcePath: string, targetPath: string, dropBefore: boolean)
    {
        const sourceIndex = this.bookmarkedDirectories.findIndex(d => d.path === sourcePath);
        const targetIndex = this.bookmarkedDirectories.findIndex(d => d.path === targetPath);

        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex)
        {
            return;
        }

        // Remove the source item
        const [movedItem] = this.bookmarkedDirectories.splice(sourceIndex, 1);

        // Calculate the new index after removal
        let newTargetIndex = targetIndex;
        if (sourceIndex < targetIndex)
        {
            newTargetIndex--;
        }

        // Insert before or after target
        const insertIndex = dropBefore ? newTargetIndex : newTargetIndex + 1;
        this.bookmarkedDirectories.splice(insertIndex, 0, movedItem);

        this.saveBookmarks();
    }

    private async directorySearch(uri: vscode.Uri)
    {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        return entries
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
                    vscode.Uri.file(`${uri.path}/${name}`)
                );
            });
    }

    private async createEntries(bookmarkedDirectories: TypedDirectory[], isEditMode: boolean = false)
    {
        let fileSystem: FileSystemObject[] = [];

        for (const dir of bookmarkedDirectories)
        {
            const { path: filePath, type: type } = dir;
            const file = vscode.Uri.file(filePath);

            // In edit mode, set all items to None to remove collapse arrows and theme icons
            // In normal mode, use proper collapsibleState for folder/file icons
            const collapsibleState = isEditMode
                ? vscode.TreeItemCollapsibleState.None
                : (type === vscode.FileType.File
                    ? vscode.TreeItemCollapsibleState.None
                    : vscode.TreeItemCollapsibleState.Collapsed);

            // In edit mode, add drag indicator and folder icon before filename
            let label = path.basename(dir.path);
            if (isEditMode)
            {
                const icon = type === vscode.FileType.Directory ? '📁' : '';
                label = `⇅ ${icon}${icon ? ' ' : ''}${label}`;
            }

            const item = new FileSystemObject(
                label,
                collapsibleState,
                file
            ).setContextValue(this.bookmarkedDirectoryContextValue);

            // In edit mode, hide all theme icons by using transparent ThemeIcon
            if (isEditMode)
            {
                item.iconPath = new vscode.ThemeIcon('blank');
            }

            fileSystem.push(item);
        }

        return fileSystem;
    }

    private hydrateState(): void
    {
        this.saveWorkspaceSetting = vscode.workspace
            .getConfiguration(this.saveWorkspaceConfigurationSettingKey)
            .get(this.saveWorkspaceConfigurationSettingKey);
        this.bookmarkedDirectories =
            (this.workspaceRoot
                ? this.extensionContext.workspaceState.get(this.storedBookmarksContextKey)
                : this.extensionContext.globalState.get(this.storedBookmarksContextKey)) || [];
    }

    private saveBookmarks()
    {
        this.workspaceRoot
            ? this.extensionContext.workspaceState.update(
                this.storedBookmarksContextKey,
                this.bookmarkedDirectories
            )
            : this.extensionContext.globalState.update(
                this.storedBookmarksContextKey,
                this.bookmarkedDirectories
            );
    }
}
