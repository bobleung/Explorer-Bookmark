import * as vscode from "vscode";
import * as path from "path";
import { BookmarkSection } from "../types/BookmarkSection";
import { TypedDirectory } from "../types/TypedDirectory";

export interface TeamBookmarkConfig
{
    version: string;
    lastUpdated: Date;
    updatedBy: string;
    sections: BookmarkSection[];
}

// za team bookmarks
export class TeamBookmarkService
{
    private static readonly BOOKMARK_FILE_NAME = '.vscode/team-bookmarks.json';
    private static readonly CONFIG_VERSION = '1.0.0';

    public static async exportBookmarks(sections: BookmarkSection[], workspaceRoot?: string): Promise<void>
    {
        if (!workspaceRoot)
        {
            await this.exportToFile(sections);
            return;
        }

        // prebaci absolute u relative paths
        const sectionsWithRelativePaths = this.convertToRelativePaths(sections, workspaceRoot);

        const config: TeamBookmarkConfig = {
            version: this.CONFIG_VERSION,
            lastUpdated: new Date(),
            updatedBy: vscode.env.machineId,
            sections: sectionsWithRelativePaths
        };

        const bookmarkFilePath = path.join(workspaceRoot, this.BOOKMARK_FILE_NAME);
        const configJson = JSON.stringify(config, null, 2);

        try
        {
            const vscodeDirPath = path.join(workspaceRoot, '.vscode');
            const vscodeDirUri = vscode.Uri.file(vscodeDirPath);

            try
            {
                await vscode.workspace.fs.stat(vscodeDirUri);
            } catch
            {
                await vscode.workspace.fs.createDirectory(vscodeDirUri);
            }

            const fileUri = vscode.Uri.file(bookmarkFilePath);
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(configJson, 'utf8'));

            vscode.window.showInformationMessage(
                `Team bookmarks exported to ${this.BOOKMARK_FILE_NAME}`,
                'Open File'
            ).then(action =>
            {
                if (action === 'Open File')
                {
                    vscode.commands.executeCommand('vscode.open', fileUri);
                }
            });
        } catch (error)
        {
            console.error('Error exporting team bookmarks:', error);
            vscode.window.showErrorMessage('Failed to export team bookmarks');
        }
    }

    public static async importBookmarks(workspaceRoot?: string): Promise<BookmarkSection[] | null>
    {
        try
        {
            let fileUri: vscode.Uri;

            if (workspaceRoot)
            {
                // try to import from workspace file
                const bookmarkFilePath = path.join(workspaceRoot, this.BOOKMARK_FILE_NAME);
                fileUri = vscode.Uri.file(bookmarkFilePath);

                try
                {
                    await vscode.workspace.fs.stat(fileUri);
                } catch
                {
                    // file doesn't exist, show file picker
                    return await this.importFromFile();
                }
            }
            else
            {
                // show file picker
                return await this.importFromFile();
            }

            // Read and parse the file
            const content = await vscode.workspace.fs.readFile(fileUri);
            const configJson = Buffer.from(content).toString('utf8');
            const config: TeamBookmarkConfig = JSON.parse(configJson);

            // Validate version compatibility
            if (!this.isVersionCompatible(config.version))
            {
                vscode.window.showWarningMessage(
                    `Bookmark file version ${config.version} may not be fully compatible with current version ${this.CONFIG_VERSION}`
                );
            }

            // Convert to BookmarkSection objects and convert relative paths to absolute
            const sectionsWithAbsolutePaths = this.convertToAbsolutePaths(config.sections, workspaceRoot);

            vscode.window.showInformationMessage(
                `Imported ${sectionsWithAbsolutePaths.length} bookmark sections from team configuration`
            );

            return sectionsWithAbsolutePaths;
        } catch (error)
        {
            console.error('Error importing team bookmarks:', error);
            vscode.window.showErrorMessage('Failed to import team bookmarks');
            return null;
        }
    }

    public static async syncWithTeam(currentSections: BookmarkSection[], workspaceRoot?: string): Promise<BookmarkSection[] | null>
    {
        if (!workspaceRoot)
        {
            vscode.window.showWarningMessage('Team sync requires a workspace');
            return null;
        }

        const bookmarkFilePath = path.join(workspaceRoot, this.BOOKMARK_FILE_NAME);
        const fileUri = vscode.Uri.file(bookmarkFilePath);

        try
        {
            await vscode.workspace.fs.stat(fileUri);
        } catch
        {
            vscode.window.showInformationMessage(
                'No team bookmark file found. Would you like to create one?',
                'Create', 'Cancel'
            ).then(action =>
            {
                if (action === 'Create')
                {
                    this.exportBookmarks(currentSections, workspaceRoot);
                }
            });
            return null;
        }

        // Read remote bookmarks
        const content = await vscode.workspace.fs.readFile(fileUri);
        const configJson = Buffer.from(content).toString('utf8');
        const remoteConfig: TeamBookmarkConfig = JSON.parse(configJson);

        // Show merge dialog
        const action = await vscode.window.showInformationMessage(
            `Team bookmarks were last updated by ${remoteConfig.updatedBy} on ${new Date(remoteConfig.lastUpdated).toLocaleString()}`,
            'Merge with Local', 'Replace Local', 'Update Team', 'Cancel'
        );

        switch (action)
        {
            case 'Merge with Local':
                const remoteSectionsAbsolute = this.convertToAbsolutePaths(remoteConfig.sections, workspaceRoot);
                return this.mergeBookmarks(currentSections, remoteSectionsAbsolute);
            case 'Replace Local':
                return this.convertToAbsolutePaths(remoteConfig.sections, workspaceRoot);
            case 'Update Team':
                await this.exportBookmarks(currentSections, workspaceRoot);
                return currentSections;
            default:
                return null;
        }
    }

    private static async exportToFile(sections: BookmarkSection[]): Promise<void>
    {
        const config: TeamBookmarkConfig = {
            version: this.CONFIG_VERSION,
            lastUpdated: new Date(),
            updatedBy: vscode.env.machineId,
            sections: sections
        };

        const configJson = JSON.stringify(config, null, 2);

        const fileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('team-bookmarks.json'),
            filters: {
                'JSON Files': ['json']
            }
        });

        if (fileUri)
        {
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(configJson, 'utf8'));
            vscode.window.showInformationMessage('Team bookmarks exported successfully');
        }
    }

    private static async importFromFile(): Promise<BookmarkSection[] | null>
    {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON Files': ['json']
            }
        });

        if (!fileUris || fileUris.length === 0)
        {
            return null;
        }

        const content = await vscode.workspace.fs.readFile(fileUris[0]);
        const configJson = Buffer.from(content).toString('utf8');
        const config: TeamBookmarkConfig = JSON.parse(configJson);

        // Try to get workspace root for path conversion, but handle cases where it's not available
        const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined;

        if (workspaceRoot)
        {
            // Convert relative paths to absolute if we have a workspace
            return this.convertToAbsolutePaths(config.sections, workspaceRoot);
        } else
        {
            // If no workspace, assume paths are already in the correct format
            vscode.window.showWarningMessage('No workspace detected. Bookmark paths will be used as-is.');
            return config.sections.map(s => new BookmarkSection(s.id, s.name, s.directories));
        }
    }

    private static mergeBookmarks(local: BookmarkSection[], remote: BookmarkSection[]): BookmarkSection[]
    {
        const merged = [...local];

        for (const remoteSection of remote)
        {
            const existingSection = merged.find(s => s.id === remoteSection.id);

            if (existingSection)
            {
                // Merge directories, avoiding duplicates
                for (const remoteDir of remoteSection.directories)
                {
                    const exists = existingSection.directories.some(d => d.path === remoteDir.path);
                    if (!exists)
                    {
                        existingSection.directories.push(remoteDir);
                    }
                }
            } else
            {
                // Add new section
                merged.push(new BookmarkSection(remoteSection.id, remoteSection.name, remoteSection.directories));
            }
        }

        return merged;
    }

    private static isVersionCompatible(version: string): boolean
    {
        // Simple version compatibility check
        const [major] = version.split('.');
        const [currentMajor] = this.CONFIG_VERSION.split('.');
        return major === currentMajor;
    }

    public static async watchForTeamChanges(workspaceRoot: string, callback: () => void): Promise<vscode.Disposable>
    {
        const bookmarkFilePath = path.join(workspaceRoot, this.BOOKMARK_FILE_NAME);
        const fileUri = vscode.Uri.file(bookmarkFilePath);

        const watcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

        watcher.onDidChange(() =>
        {
            vscode.window.showInformationMessage(
                'Team bookmarks have been updated by another team member',
                'Sync Now', 'Later'
            ).then(action =>
            {
                if (action === 'Sync Now')
                {
                    callback();
                }
            });
        });

        return watcher;
    }

    public static convertToRelativePaths(sections: BookmarkSection[], workspaceRoot: string): BookmarkSection[]
    {
        return sections.map(section =>
        {
            const relativeDirs = section.directories.map(dir =>
            {
                // Convert absolute path to relative path
                const relativePath = path.relative(workspaceRoot, dir.path);

                // Create a new TypedDirectory with relative path
                return new TypedDirectory(
                    relativePath,
                    dir.type,
                    dir.comment,
                    dir.tags,
                    dir.addedBy,
                    dir.dateAdded,
                    dir.aiSummary,
                    dir.lastSummaryUpdate
                );
            });

            const newSection = new BookmarkSection(section.id, section.name);
            newSection.directories = relativeDirs;
            return newSection;
        });
    }

    public static convertToAbsolutePaths(sections: BookmarkSection[], workspaceRoot: string): BookmarkSection[]
    {
        return sections.map(section =>
        {
            const absoluteDirs = section.directories.map(dir =>
            {
                // Check if path is already absolute or relative
                const absolutePath = path.isAbsolute(dir.path)
                    ? dir.path
                    : path.resolve(workspaceRoot, dir.path);

                return new TypedDirectory(
                    absolutePath,
                    dir.type,
                    dir.comment,
                    dir.tags,
                    dir.addedBy,
                    dir.dateAdded,
                    dir.aiSummary,
                    dir.lastSummaryUpdate
                );
            });

            const newSection = new BookmarkSection(section.id, section.name);
            newSection.directories = absoluteDirs;
            return newSection;
        });
    }
}
