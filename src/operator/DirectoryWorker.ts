import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory } from "../types/TypedDirectory";
import { buildTypedDirectory } from "../types/TypedDirectory";
import { BookmarkSection } from "../types/BookmarkSection";
import { AIService } from "../services/AIService";
import { TeamBookmarkService } from "../services/TeamBookmarkService";
const simpleGit = require('simple-git');

export class DirectoryWorker
{
    readonly vsCodeExtensionConfigurationKey: string = "explorer-bookmark";
    readonly saveWorkspaceConfigurationSettingKey: string = "saveWorkspace";
    readonly storedBookmarksContextKey: string = "storedBookmarks";
    readonly storedSectionsContextKey: string = "storedSections";
    readonly bookmarkedDirectoryContextValue: string = "directlyBookmarkedDirectory";
    readonly sectionContextValue: string = "bookmarkSection";

    private bookmarkSections: BookmarkSection[] = [];
    private saveWorkspaceSetting: boolean | undefined = false;

    constructor(
        private extensionContext: vscode.ExtensionContext,
        private workspaceRoot: readonly vscode.WorkspaceFolder[] | undefined
    )
    {
        this.hydrateState();
    }

    public async getChildren(element?: FileSystemObject): Promise<FileSystemObject[]>
    {
        if (element && element.contextValue === this.sectionContextValue)
        {
            // Return directories in this section
            const section = this.bookmarkSections.find(s => s.id === element.sectionId);
            if (section)
            {
                return this.createDirectoryEntries(section.directories, section.id);
            }
            return [];
        } else if (element && element.sectionId)
        {
            // Expand a directory within a section
            return this.directorySearch(element.resourceUri);
        } else
        {
            // Return root level (sections)
            return this.createSectionEntries();
        }
    }

    public async addSection(name: string): Promise<void>
    {
        const id = this.generateId();
        const section = new BookmarkSection(id, name);
        this.bookmarkSections.push(section);
        this.saveSections();
    }

    public async removeSection(sectionId: string): Promise<void>
    {
        const index = this.bookmarkSections.findIndex(s => s.id === sectionId);
        if (index > -1)
        {
            this.bookmarkSections.splice(index, 1);
            this.saveSections();
        }
    }

    public async selectItem(uri: vscode.Uri | undefined, sectionId?: string): Promise<void>
    {
        if (uri)
        {
            const typedDirectory = await buildTypedDirectory(uri);

            // Convert to relative path for storage if we have a workspace root
            const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
                ? this.workspaceRoot[0].uri.fsPath
                : undefined;

            if (workspaceRoot && path.isAbsolute(typedDirectory.path))
            {
                // Store as relative path
                const relativePath = path.relative(workspaceRoot, typedDirectory.path);
                typedDirectory.path = relativePath;
            }

            // If no section specified, use default or ask user
            let targetSectionId = sectionId;
            if (!targetSectionId)
            {
                if (this.bookmarkSections.length === 0)
                {
                    // Create default section if none exist
                    const defaultSection = BookmarkSection.createDefault();
                    this.bookmarkSections.push(defaultSection);
                    targetSectionId = defaultSection.id;
                } else if (this.bookmarkSections.length === 1)
                {
                    // Use the only section
                    targetSectionId = this.bookmarkSections[0].id;
                } else
                {
                    // Ask user to select section
                    targetSectionId = await this.askUserForSection();
                    if (!targetSectionId)
                    {
                        return; // User cancelled
                    }
                }
            }

            const section = this.bookmarkSections.find(s => s.id === targetSectionId);
            if (section)
            {
                section.addDirectory(typedDirectory);

                // Commit the added file/folder to git (use original absolute path)
                if (workspaceRoot)
                {
                    const git = simpleGit(workspaceRoot);
                    const filePath = uri.fsPath;
                    try
                    {
                        await git.add(filePath);
                        await git.commit(`Bookmarked: ${filePath} in section ${section.name}`);
                    } catch (error)
                    {
                        console.error('Git commit failed:', error);
                    }
                } else
                {
                    console.warn('No workspace folder found for git operations.');
                }
            }
        }
        this.saveSections();
    }

    public async removeItem(uri: vscode.Uri | undefined, sectionId?: string): Promise<void>
    {
        if (uri)
        {
            const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
                ? this.workspaceRoot[0].uri.fsPath
                : undefined;

            if (sectionId)
            {
                // Remove from specific section
                const section = this.bookmarkSections.find(s => s.id === sectionId);
                if (section)
                {
                    // Find the relative path to remove
                    let pathToRemove = uri.fsPath;
                    if (workspaceRoot && path.isAbsolute(pathToRemove))
                    {
                        pathToRemove = path.relative(workspaceRoot, pathToRemove);
                    }
                    section.removeDirectory(pathToRemove);
                }
            } else
            {
                // Remove from all sections
                for (const section of this.bookmarkSections)
                {
                    // Find the relative path to remove
                    let pathToRemove = uri.fsPath;
                    if (workspaceRoot && path.isAbsolute(pathToRemove))
                    {
                        pathToRemove = path.relative(workspaceRoot, pathToRemove);
                    }
                    section.removeDirectory(pathToRemove);
                }
            }
        }
        this.saveSections();
    }

    public removeAllItems(): void
    {
        for (const section of this.bookmarkSections)
        {
            section.directories = [];
        }
        this.saveSections();
    }

    public async askUserForSection(): Promise<string | undefined>
    {
        const items = this.bookmarkSections.map(section => ({
            label: section.name,
            description: `${section.directories.length} items`,
            sectionId: section.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a section to add the bookmark to'
        });

        return selected?.sectionId;
    }

    public async generateAISummary(uri: vscode.Uri): Promise<void>
    {
        try
        {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating AI summary...",
                cancellable: false
            }, async () =>
            {
                const summary = await AIService.generateFileSummary(uri);

                // Find and update the bookmark
                for (const section of this.bookmarkSections)
                {
                    const bookmark = section.directories.find(d => d.path === uri.fsPath);
                    if (bookmark)
                    {
                        bookmark.updateAISummary(summary);
                        this.saveSections();
                        break;
                    }
                }

                // Open summary in a new tab to the side
                const doc = await vscode.workspace.openTextDocument({
                    content: summary,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: false // Ensure it opens as a permanent tab
                });
            });
        } catch (error)
        {
            console.error('Error generating AI summary:', error);
            vscode.window.showErrorMessage('Failed to generate AI summary');
        }
    }

    public async viewAISummary(uri: vscode.Uri): Promise<void>
    {
        try
        {
            // Always generate a fresh summary and open in new tab
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating AI summary...",
                cancellable: false
            }, async () =>
            {
                const summary = await AIService.generateFileSummary(uri);

                // Find and update the bookmark with the new summary
                const result = this.findBookmarkByUri(uri);
                if (result)
                {
                    result.bookmark.updateAISummary(summary);
                    this.saveSections();
                }

                // Create and show a webview panel with markdown content
                const filename = path.basename(uri.fsPath);
                const panel = vscode.window.createWebviewPanel(
                    'aiSummary',
                    `AI Summary - ${filename}`,
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: false,
                        retainContextWhenHidden: true
                    }
                );

                // Simple HTML rendering of markdown content
                const htmlContent = summary
                    .replace(/\n/g, '<br>')
                    .replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>')
                    .replace(/## (.*?)(<br>|$)/g, '<h2>$1</h2>')
                    .replace(/# (.*?)(<br>|$)/g, '<h1>$1</h1>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code>$1</code>')
                    .replace(/^- (.*)(<br>|$)/gm, '<li>$1</li>')
                    .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { 
                                font-family: var(--vscode-font-family); 
                                color: var(--vscode-foreground);
                                background-color: var(--vscode-editor-background);
                                padding: 20px;
                                line-height: 1.6;
                                max-width: 800px;
                            }
                            h1, h2, h3, h4, h5, h6 { 
                                color: var(--vscode-foreground);
                                margin-top: 1.5em;
                                margin-bottom: 0.5em;
                            }
                            h1 { font-size: 1.8em; border-bottom: 2px solid var(--vscode-foreground); }
                            h2 { font-size: 1.5em; border-bottom: 1px solid var(--vscode-foreground); }
                            h3 { font-size: 1.3em; }
                            code { 
                                background-color: var(--vscode-textCodeBlock-background);
                                color: var(--vscode-textPreformat-foreground);
                                padding: 2px 4px;
                                border-radius: 3px;
                                font-family: var(--vscode-editor-font-family);
                            }
                            ul { margin: 1em 0; padding-left: 2em; }
                            li { margin: 0.5em 0; }
                            strong { font-weight: bold; }
                            em { font-style: italic; }
                        </style>
                    </head>
                    <body>
                        ${htmlContent}
                    </body>
                    </html>
                `;
            });
        } catch (error)
        {
            console.error('Error generating AI summary:', error);
            vscode.window.showErrorMessage('Failed to generate AI summary');
        }
    }

    public async addComment(uri: vscode.Uri): Promise<void>
    {
        const comment = await vscode.window.showInputBox({
            placeHolder: 'Enter a comment for this bookmark',
            prompt: 'Add context or notes about this file/folder'
        });

        if (comment)
        {
            const result = this.findBookmarkByUri(uri);
            if (result)
            {
                result.bookmark.comment = comment;
                this.saveSections();
                vscode.window.showInformationMessage('Comment added to bookmark');
                return;
            }
        }
    }

    public async addTags(uri: vscode.Uri): Promise<void>
    {
        const tagsInput = await vscode.window.showInputBox({
            placeHolder: 'Enter tags separated by commas (e.g., api, authentication, important)',
            prompt: 'Add tags to categorize this bookmark'
        });

        if (tagsInput)
        {
            const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

            const result = this.findBookmarkByUri(uri);
            if (result)
            {
                tags.forEach(tag => result.bookmark.addTag(tag));
                this.saveSections();
                vscode.window.showInformationMessage(`Added ${tags.length} tags to bookmark`);
                return;
            }
        }
    }

    public async exportTeamBookmarks(): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        await TeamBookmarkService.exportBookmarks(this.bookmarkSections, workspaceRoot);
    }

    public async importTeamBookmarks(): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        const importedSections = await TeamBookmarkService.importBookmarks(workspaceRoot);

        if (importedSections)
        {
            // Ask user how to handle the import
            const action = await vscode.window.showInformationMessage(
                `Found ${importedSections.length} bookmark sections to import`,
                'Replace Current', 'Merge with Current', 'Cancel'
            );

            switch (action)
            {
                case 'Replace Current':
                    this.bookmarkSections = importedSections;
                    break;
                case 'Merge with Current':
                    this.bookmarkSections = this.mergeBookmarkSections(this.bookmarkSections, importedSections);
                    break;
                default:
                    return;
            }

            this.saveSections();
        }
    }

    public async syncTeamBookmarks(): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        const syncedSections = await TeamBookmarkService.syncWithTeam(this.bookmarkSections, workspaceRoot);

        if (syncedSections)
        {
            this.bookmarkSections = syncedSections;
            this.saveSections();
        }
    }

    public async injectTeamBookmarks(): Promise<void>
    {
        const configText = await vscode.window.showInputBox({
            placeHolder: 'Paste team bookmark configuration JSON here...',
            prompt: 'Inject team bookmarks by pasting the configuration JSON',
            ignoreFocusOut: true,
            value: ''
        });

        if (!configText || !configText.trim())
        {
            return;
        }

        try
        {
            const config = JSON.parse(configText);

            // Validate the configuration structure
            if (!config.sections || !Array.isArray(config.sections))
            {
                vscode.window.showErrorMessage('Invalid team bookmark configuration: missing sections array');
                return;
            }

            const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
                ? this.workspaceRoot[0].uri.fsPath
                : undefined;

            let sectionsToInject: BookmarkSection[];

            if (workspaceRoot)
            {
                // For team bookmarks, we assume they come with relative paths
                // so we don't need to convert them since we now store relative paths internally
                sectionsToInject = config.sections.map((s: any) =>
                {
                    const directories = (s.directories || []).map((d: any) =>
                    {
                        return new TypedDirectory(
                            d.path, // Keep the path as-is (should be relative from the config)
                            d.type,
                            d.comment,
                            d.tags,
                            d.addedBy,
                            d.dateAdded ? new Date(d.dateAdded) : new Date(),
                            d.aiSummary,
                            d.lastSummaryUpdate ? new Date(d.lastSummaryUpdate) : undefined
                        );
                    });

                    return new BookmarkSection(s.id, s.name, directories);
                });
            } else
            {
                // Create BookmarkSection objects directly with proper TypedDirectory reconstruction
                sectionsToInject = config.sections.map((s: any) =>
                {
                    const directories = (s.directories || []).map((d: any) =>
                    {
                        return new TypedDirectory(
                            d.path,
                            d.type,
                            d.comment,
                            d.tags,
                            d.addedBy,
                            d.dateAdded ? new Date(d.dateAdded) : new Date(),
                            d.aiSummary,
                            d.lastSummaryUpdate ? new Date(d.lastSummaryUpdate) : undefined
                        );
                    });

                    return new BookmarkSection(s.id, s.name, directories);
                });
            }

            // Ask user how to handle the injection
            const action = await vscode.window.showInformationMessage(
                `Found ${sectionsToInject.length} bookmark sections to inject`,
                'Replace Current', 'Merge with Current', 'Cancel'
            );

            switch (action)
            {
                case 'Replace Current':
                    this.bookmarkSections = sectionsToInject;
                    break;
                case 'Merge with Current':
                    this.bookmarkSections = this.mergeBookmarkSections(this.bookmarkSections, sectionsToInject);
                    break;
                default:
                    return;
            }

            this.saveSections();
            vscode.window.showInformationMessage(`Successfully injected ${sectionsToInject.length} bookmark sections!`);

        } catch (error)
        {
            console.error('Error injecting team bookmarks:', error);
            vscode.window.showErrorMessage('Failed to parse team bookmark configuration. Please check the JSON format.');
        }
    }

    public async generateShareableConfig(): Promise<void>
    {
        try
        {
            const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
                ? this.workspaceRoot[0].uri.fsPath
                : undefined;

            if (!workspaceRoot)
            {
                vscode.window.showErrorMessage('No workspace detected. Cannot generate relative paths for sharing.');
                return;
            }

            // Since we now store relative paths internally, we can use them directly
            const config = {
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                updatedBy: vscode.env.machineId,
                sections: this.bookmarkSections
            };

            const configJson = JSON.stringify(config, null, 2);

            // Create a new document with the shareable configuration
            const doc = await vscode.workspace.openTextDocument({
                content: configJson,
                language: 'json'
            });

            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: false
            });

            vscode.window.showInformationMessage(
                'Shareable team bookmark configuration generated! Copy this JSON and share with your team.',
                'Copy to Clipboard'
            ).then(action =>
            {
                if (action === 'Copy to Clipboard')
                {
                    vscode.env.clipboard.writeText(configJson);
                    vscode.window.showInformationMessage('Configuration copied to clipboard!');
                }
            });

        } catch (error)
        {
            console.error('Error generating shareable config:', error);
            vscode.window.showErrorMessage('Failed to generate shareable configuration.');
        }
    }

    private mergeBookmarkSections(local: BookmarkSection[], imported: BookmarkSection[]): BookmarkSection[]
    {
        const merged = [...local];

        for (const importedSection of imported)
        {
            const existingSection = merged.find(s => s.id === importedSection.id || s.name === importedSection.name);

            if (existingSection)
            {
                // Merge directories, avoiding duplicates
                for (const importedDir of importedSection.directories)
                {
                    const exists = existingSection.directories.some(d => d.path === importedDir.path);
                    if (!exists)
                    {
                        existingSection.directories.push(importedDir);
                    }
                }
            } else
            {
                // Add new section
                merged.push(importedSection);
            }
        }

        return merged;
    }

    private async directorySearch(uri: vscode.Uri): Promise<FileSystemObject[]>
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
                    vscode.Uri.file(path.join(uri.fsPath, name))
                );
            });
    }

    private createSectionEntries(): FileSystemObject[]
    {
        return this.bookmarkSections.map(section =>
        {
            const sectionItem = new FileSystemObject(
                `${section.name} (${section.directories.length})`,
                vscode.TreeItemCollapsibleState.Expanded,
                vscode.Uri.parse(`section://${section.id}`),
                section.id
            );
            sectionItem.setContextValue(this.sectionContextValue);
            return sectionItem;
        });
    }

    private createDirectoryEntries(directories: TypedDirectory[], sectionId: string): FileSystemObject[]
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        return directories.map(dir =>
        {
            // Convert relative path to absolute path for display and access
            let absolutePath = dir.path;
            if (workspaceRoot && !path.isAbsolute(dir.path))
            {
                // Use path.join instead of path.resolve to avoid Windows path issues
                absolutePath = path.join(workspaceRoot, dir.path);
            }

            const file = vscode.Uri.file(absolutePath);

            // Create enhanced label with metadata indicators
            let label = path.basename(absolutePath);
            const indicators: string[] = [];

            if (dir.aiSummary)
            {
                indicators.push('🤖');
            }
            if (dir.comment)
            {
                indicators.push('💬');
            }
            if (dir.tags && dir.tags.length > 0)
            {
                indicators.push('🏷️');
            }

            if (indicators.length > 0)
            {
                label = `${label} ${indicators.join(' ')}`;
            }

            const item = new FileSystemObject(
                label,
                dir.type === vscode.FileType.File
                    ? vscode.TreeItemCollapsibleState.None
                    : vscode.TreeItemCollapsibleState.Collapsed,
                file,
                sectionId
            );

            // Enhanced tooltip with metadata
            let tooltip = file.fsPath;
            if (dir.comment)
            {
                tooltip += `\n💬 ${dir.comment}`;
            }
            if (dir.tags && dir.tags.length > 0)
            {
                tooltip += `\n🏷️ Tags: ${dir.tags.join(', ')}`;
            }
            if (dir.addedBy)
            {
                tooltip += `\n👤 Added by: ${dir.addedBy}`;
            }
            if (dir.dateAdded)
            {
                tooltip += `\n📅 Added: ${dir.dateAdded.toLocaleDateString()}`;
            }
            if (dir.aiSummary)
            {
                tooltip += `\n🤖 AI Summary available`;
            }

            item.tooltip = tooltip;
            item.setContextValue(this.bookmarkedDirectoryContextValue);
            return item;
        });
    }

    private hydrateState(): void
    {
        this.saveWorkspaceSetting = vscode.workspace
            .getConfiguration(this.saveWorkspaceConfigurationSettingKey)
            .get(this.saveWorkspaceConfigurationSettingKey);

        // Load sections
        const storedSections = this.workspaceRoot
            ? this.extensionContext.workspaceState.get(this.storedSectionsContextKey)
            : this.extensionContext.globalState.get(this.storedSectionsContextKey);

        if (storedSections && Array.isArray(storedSections))
        {
            const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
                ? this.workspaceRoot[0].uri.fsPath
                : undefined;

            this.bookmarkSections = storedSections.map((s: any) =>
            {
                // Reconstruct TypedDirectory objects with proper Date objects
                const directories = (s.directories || []).map((d: any) =>
                {
                    // Convert absolute paths to relative if we have a workspace root
                    let bookmarkPath = d.path;
                    if (workspaceRoot && path.isAbsolute(bookmarkPath))
                    {
                        bookmarkPath = path.relative(workspaceRoot, bookmarkPath);
                    }

                    const typedDir = new TypedDirectory(
                        bookmarkPath,
                        d.type,
                        d.comment,
                        d.tags,
                        d.addedBy,
                        d.dateAdded ? new Date(d.dateAdded) : new Date(),
                        d.aiSummary,
                        d.lastSummaryUpdate ? new Date(d.lastSummaryUpdate) : undefined
                    );
                    return typedDir;
                });

                return new BookmarkSection(s.id, s.name, directories);
            });
        } else
        {
            // Migrate old bookmarks to default section if they exist
            const oldBookmarks = this.workspaceRoot
                ? this.extensionContext.workspaceState.get(this.storedBookmarksContextKey)
                : this.extensionContext.globalState.get(this.storedBookmarksContextKey);

            if (oldBookmarks && Array.isArray(oldBookmarks) && oldBookmarks.length > 0)
            {
                const defaultSection = BookmarkSection.createDefault();

                // Reconstruct old bookmarks with proper Date objects
                const reconstructedBookmarks = oldBookmarks.map((d: any) =>
                {
                    if (d.path && d.type !== undefined)
                    {
                        return new TypedDirectory(
                            d.path,
                            d.type,
                            d.comment,
                            d.tags,
                            d.addedBy,
                            d.dateAdded ? new Date(d.dateAdded) : new Date(),
                            d.aiSummary,
                            d.lastSummaryUpdate ? new Date(d.lastSummaryUpdate) : undefined
                        );
                    }
                    return d;
                });

                defaultSection.directories = reconstructedBookmarks;
                this.bookmarkSections = [defaultSection];
                this.saveSections();

                // Clear old bookmarks
                this.workspaceRoot
                    ? this.extensionContext.workspaceState.update(this.storedBookmarksContextKey, undefined)
                    : this.extensionContext.globalState.update(this.storedBookmarksContextKey, undefined);
            }
        }

        // Ensure at least one section exists
        if (this.bookmarkSections.length === 0)
        {
            this.bookmarkSections.push(BookmarkSection.createDefault());
        }
    }

    private saveSections(): void
    {
        this.workspaceRoot
            ? this.extensionContext.workspaceState.update(
                this.storedSectionsContextKey,
                this.bookmarkSections
            )
            : this.extensionContext.globalState.update(
                this.storedSectionsContextKey,
                this.bookmarkSections
            );
    }

    private generateId(): string
    {
        return Math.random().toString(36).substr(2, 9);
    }

    private findBookmarkByUri(uri: vscode.Uri): { section: BookmarkSection, bookmark: TypedDirectory } | null
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        for (const section of this.bookmarkSections)
        {
            const bookmark = section.directories.find(d =>
            {
                // Handle both relative and absolute path matching
                if (workspaceRoot && !path.isAbsolute(d.path))
                {
                    // Use path.join instead of path.resolve to avoid Windows path issues
                    const absolutePath = path.join(workspaceRoot, d.path);
                    // Compare using fsPath to normalize paths properly on Windows
                    return absolutePath === uri.fsPath;
                }
                return d.path === uri.fsPath;
            });

            if (bookmark)
            {
                return { section, bookmark };
            }
        }

        return null;
    }
}
