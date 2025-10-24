import * as vscode from "vscode";
import * as path from "path";
import { FileSystemObject } from "../types/FileSystemObject";
import { TypedDirectory } from "../types/TypedDirectory";
import { buildTypedDirectory } from "../types/TypedDirectory";
import { BookmarkSection } from "../types/BookmarkSection";
import { AIService } from "../services/AIService";
import { TeamBookmarkService } from "../services/TeamBookmarkService";
import { GitService } from "../services/GitService";
import { GitHubService } from "../services/GitHubService";
import { CommentService } from "../services/CommentService";
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
            // Check if we have a workspace
            const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
                ? this.workspaceRoot[0].uri.fsPath
                : undefined;

            // If we have a workspace, check if the file is within it
            if (workspaceRoot)
            {
                const relativePath = path.relative(workspaceRoot, uri.fsPath);
                if (relativePath.startsWith('..'))
                {
                    const result = await vscode.window.showWarningMessage(
                        `The selected file is outside the current workspace and may not work properly with Git features.\n\nWorkspace: ${workspaceRoot}\nFile: ${uri.fsPath}\n\nDo you want to bookmark it anyway?`,
                        'Yes, Bookmark It', 'Cancel'
                    );

                    if (result !== 'Yes, Bookmark It')
                    {
                        return;
                    }
                }
            }

            const currentUser = await this.getCurrentUser();
            const typedDirectory = await buildTypedDirectory(uri, undefined, undefined, currentUser);

            // Convert to relative path for storage if we have a workspace root

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
                const result = this.findBookmarkOrParentByUri(uri);
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
            const result = this.findBookmarkOrParentByUri(uri);
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

            const result = this.findBookmarkOrParentByUri(uri);
            if (result)
            {
                tags.forEach(tag => result.bookmark.addTag(tag));
                this.saveSections();
                vscode.window.showInformationMessage(`Added ${tags.length} tags to bookmark`);
                return;
            }
        }
    }

    public async showGitDiff(uri: vscode.Uri): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git diff requires a workspace.');
            return;
        }

        // Handle both absolute and relative paths
        const filePath = path.isAbsolute(uri.fsPath) 
            ? uri.fsPath 
            : path.join(workspaceRoot, uri.fsPath);

        // Check if the file is within the workspace
        const relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot show Git diff: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // First check if this is a git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Get the current branch
            const currentBranch = await gitService.getCurrentBranch();

            // Give user options for what type of diff to show
            const diffOptions = [
                {
                    label: 'Working Directory vs HEAD',
                    description: 'Show uncommitted changes',
                    option: 'working'
                },
                {
                    label: 'Local vs Remote',
                    description: `Compare with origin/${currentBranch}`,
                    option: 'remote'
                },
                {
                    label: 'Between Branches',
                    description: 'Choose two branches to compare',
                    option: 'branches'
                },
                {
                    label: 'File History',
                    description: 'Show recent commits affecting this file',
                    option: 'history'
                }
            ];

            const selectedOption = await vscode.window.showQuickPick(diffOptions, {
                placeHolder: 'Choose diff type'
            });

            if (!selectedOption) return;

            // Create a proper URI with the resolved path
            const resolvedUri = vscode.Uri.file(filePath);
            await this.handleGitDiffOption(resolvedUri, gitService, selectedOption.option, currentBranch);

        } catch (error)
        {
            console.error('Git diff failed:', error);
            vscode.window.showErrorMessage(`Failed to get git diff: ${error}`);
        }
    }

    public async cherryPickChanges(uri: vscode.Uri): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Cherry-pick requires a workspace.');
            return;
        }

        // Handle both absolute and relative paths
        const filePath = path.isAbsolute(uri.fsPath) 
            ? uri.fsPath 
            : path.join(workspaceRoot, uri.fsPath);

        // Check if the file is within the workspace
        const relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot cherry-pick: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // First check if this is a git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Get all branches
            const branches = await gitService.getAllBranches();
            const branchNames = branches.map(b => b.name).filter(name => !name.startsWith('remotes/'));
            const currentBranch = await gitService.getCurrentBranch();

            // Filter out current branch
            const otherBranches = branchNames.filter(name => name !== currentBranch);

            if (otherBranches.length === 0)
            {
                vscode.window.showInformationMessage('No other branches available for cherry-picking.');
                return;
            }

            // Let user select source branch
            const sourceBranch = await vscode.window.showQuickPick(otherBranches, {
                placeHolder: 'Select branch to cherry-pick from'
            });

            if (!sourceBranch) return;

            // Give user options for cherry-pick type
            const cherryPickOptions = [
                {
                    label: 'Cherry-pick File Changes',
                    description: 'Apply changes to this specific file from selected commits',
                    option: 'file'
                },
                {
                    label: 'Cherry-pick Entire Commits',
                    description: 'Apply entire commits (all files changed in those commits)',
                    option: 'commits'
                }
            ];

            const selectedOption = await vscode.window.showQuickPick(cherryPickOptions, {
                placeHolder: 'Choose cherry-pick type'
            });

            if (!selectedOption) return;

            // Create a proper URI with the resolved path
            const resolvedUri = vscode.Uri.file(filePath);
            await this.handleCherryPickOption(resolvedUri, gitService, sourceBranch, selectedOption.option);

        } catch (error)
        {
            console.error('Cherry-pick failed:', error);
            vscode.window.showErrorMessage(`Failed to cherry-pick: ${error}`);
        }
    }

    public async gitAddFile(uri: vscode.Uri): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git add requires a workspace.');
            return;
        }

        // Handle both absolute and relative paths
        const filePath = path.isAbsolute(uri.fsPath) 
            ? uri.fsPath 
            : path.join(workspaceRoot, uri.fsPath);

        const relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot stage file: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // Check if git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Get file status first
            const status = await gitService.getFileStatus(filePath);

            if (status.isStaged)
            {
                const action = await vscode.window.showInformationMessage(
                    `'${path.basename(filePath)}' is already staged. What would you like to do?`,
                    'Unstage', 'Cancel'
                );

                if (action === 'Unstage')
                {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "Unstaging file...",
                        cancellable: false
                    }, async () =>
                    {
                        const result = await gitService.unstageFile(filePath);

                        if (result.success)
                        {
                            vscode.window.showInformationMessage(result.message);
                        }
                        else
                        {
                            vscode.window.showErrorMessage(result.message);
                        }
                    });
                }
                return;
            }

            // Try to stage the file even if status detection is uncertain
            // Git will handle the case where there are no changes
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Staging file...",
                cancellable: false
            }, async () =>
            {
                const result = await gitService.stageFile(filePath);

                if (result.success)
                {
                    vscode.window.showInformationMessage(result.message);
                }
                else
                {
                    vscode.window.showErrorMessage(result.message);
                }
            });

        } catch (error)
        {
            console.error('Git add failed:', error);
            vscode.window.showErrorMessage(`Failed to stage file: ${error}`);
        }
    }

    public async gitCommitFile(uri: vscode.Uri): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git commit requires a workspace.');
            return;
        }

        // Handle both absolute and relative paths
        const filePath = path.isAbsolute(uri.fsPath) 
            ? uri.fsPath 
            : path.join(workspaceRoot, uri.fsPath);

        const relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot commit file: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // Check if git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Get file status
            const status = await gitService.getFileStatus(filePath);

            if (!status.isModified && !status.isUntracked && !status.isStaged)
            {
                vscode.window.showInformationMessage(`No changes to commit for '${path.basename(filePath)}'`);
                return;
            }

            // Ask for commit message
            const commitMessage = await vscode.window.showInputBox({
                prompt: `Enter commit message for '${path.basename(filePath)}'`,
                placeHolder: 'feat: add new feature',
                validateInput: (value) =>
                {
                    if (!value || value.trim().length === 0)
                    {
                        return 'Commit message cannot be empty';
                    }
                    return null;
                }
            });

            if (!commitMessage) return;

            // Commit the file
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Committing file...",
                cancellable: false
            }, async () =>
            {
                const result = await gitService.commitFile(filePath, commitMessage);

                if (result.success)
                {
                    vscode.window.showInformationMessage(result.message);
                }
                else
                {
                    vscode.window.showErrorMessage(result.message);
                }
            });

        } catch (error)
        {
            console.error('Git commit failed:', error);
            vscode.window.showErrorMessage(`Failed to commit file: ${error}`);
        }
    }

    public async gitStashFile(uri: vscode.Uri): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git stash requires a workspace.');
            return;
        }

        // Handle both absolute and relative paths
        const filePath = path.isAbsolute(uri.fsPath) 
            ? uri.fsPath 
            : path.join(workspaceRoot, uri.fsPath);

        const relativePath = path.relative(workspaceRoot, filePath);
        if (relativePath.startsWith('..'))
        {
            vscode.window.showErrorMessage(
                `Cannot stash file: The selected file is outside the current workspace.\n\nWorkspace: ${workspaceRoot}\nFile: ${filePath}`
            );
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // Check if git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Get file status
            const status = await gitService.getFileStatus(filePath);

            if (!status.isModified && !status.isUntracked)
            {
                vscode.window.showInformationMessage(`No changes to stash for '${path.basename(filePath)}'`);
                return;
            }

            // Ask for stash message (optional)
            const stashMessage = await vscode.window.showInputBox({
                prompt: `Enter stash message for '${path.basename(filePath)}' (optional)`,
                placeHolder: 'WIP: temporary changes'
            });

            // Confirm stash action
            const confirmation = await vscode.window.showWarningMessage(
                `Stash changes for '${path.basename(filePath)}'? This will save the changes and revert the file to the last commit.`,
                'Yes, Stash', 'Cancel'
            );

            if (confirmation !== 'Yes, Stash') return;

            // Stash the file
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Stashing file...",
                cancellable: false
            }, async () =>
            {
                const result = await gitService.stashFile(filePath, stashMessage || undefined);

                if (result.success)
                {
                    vscode.window.showInformationMessage(result.message);
                }
                else
                {
                    vscode.window.showErrorMessage(result.message);
                }
            });

        } catch (error)
        {
            console.error('Git stash failed:', error);
            vscode.window.showErrorMessage(`Failed to stash file: ${error}`);
        }
    }

    public async gitPushBookmarkedFiles(): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git push requires a workspace.');
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // Check if git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Collect all bookmarked files
            const bookmarkedFiles: string[] = [];
            const skippedFiles: string[] = [];

            console.log('Git Push - Workspace root:', workspaceRoot);
            console.log('Git Push - Total bookmarked files:', this.bookmarkSections.reduce((sum, s) => sum + s.directories.length, 0));

            for (const section of this.bookmarkSections)
            {
                for (const dir of section.directories)
                {
                    // If the path is already absolute, use it; otherwise resolve it relative to workspace
                    const absolutePath = path.isAbsolute(dir.path) 
                        ? dir.path 
                        : path.join(workspaceRoot, dir.path);

                    // Normalize paths for comparison
                    const normalizedWorkspace = path.resolve(workspaceRoot);
                    const normalizedPath = path.resolve(absolutePath);
                    const relativePath = path.relative(normalizedWorkspace, normalizedPath);

                    console.log('Checking file:', {
                        fileName: path.basename(dir.path),
                        originalPath: dir.path,
                        absolutePath: absolutePath,
                        relativePath: relativePath,
                        startsWithDotDot: relativePath.startsWith('..'),
                        isAbsolute: path.isAbsolute(relativePath)
                    });

                    // Only include files that are within the workspace
                    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
                    {
                        bookmarkedFiles.push(absolutePath);
                    }
                    else
                    {
                        skippedFiles.push(path.basename(dir.path));
                    }
                }
            }

            console.log('Files to push:', bookmarkedFiles.length);
            console.log('Files skipped:', skippedFiles.length);

            if (bookmarkedFiles.length === 0)
            {
                if (skippedFiles.length > 0)
                {
                    vscode.window.showWarningMessage(
                        `No bookmarked files within the workspace to push.\n\n${skippedFiles.length} file(s) were skipped because they are outside the workspace:\n${skippedFiles.slice(0, 5).join(', ')}${skippedFiles.length > 5 ? '...' : ''}`
                    );
                }
                else
                {
                    vscode.window.showInformationMessage('No bookmarked files to push.');
                }
                return;
            }

            // Ask for commit message
            const commitMessage = await vscode.window.showInputBox({
                prompt: `Enter commit message for ${bookmarkedFiles.length} bookmarked file(s)`,
                placeHolder: 'feat: update bookmarked files',
                validateInput: (value) =>
                {
                    if (!value || value.trim().length === 0)
                    {
                        return 'Commit message cannot be empty';
                    }
                    return null;
                }
            });

            if (!commitMessage) return;

            // Stage, commit, and push all bookmarked files
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Pushing bookmarked files...",
                cancellable: false
            }, async () =>
            {
                const result = await gitService.stageCommitAndPushFiles(bookmarkedFiles, commitMessage);

                if (result.success)
                {
                    vscode.window.showInformationMessage(result.message);
                }
                else
                {
                    vscode.window.showErrorMessage(result.message);
                }
            });

        } catch (error)
        {
            console.error('Git push bookmarked files failed:', error);
            vscode.window.showErrorMessage(`Failed to push bookmarked files: ${error}`);
        }
    }

    public async gitFetch(): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git fetch requires a workspace.');
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // Check if git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Fetch from remote
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Fetching from remote...",
                cancellable: false
            }, async () =>
            {
                const success = await gitService.fetch();

                if (success)
                {
                    vscode.window.showInformationMessage('Successfully fetched from remote');
                }
                else
                {
                    vscode.window.showErrorMessage('Failed to fetch from remote');
                }
            });

        } catch (error)
        {
            console.error('Git fetch failed:', error);
            vscode.window.showErrorMessage(`Failed to fetch: ${error}`);
        }
    }

    public async gitPull(): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git pull requires a workspace.');
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // Check if git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Check for uncommitted changes
            const status = await gitService.getGitInfo();
            if (status.hasLocalChanges)
            {
                const action = await vscode.window.showWarningMessage(
                    'You have uncommitted changes. What would you like to do?',
                    'Stash and Pull', 'Cancel'
                );

                if (action !== 'Stash and Pull')
                {
                    return;
                }

                // Stash changes
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Stashing changes...",
                    cancellable: false
                }, async () =>
                {
                    await gitService.stashChanges('Auto-stash before pull');
                });
            }

            // Pull from remote
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Pulling from remote...",
                cancellable: false
            }, async () =>
            {
                const success = await gitService.pull();

                if (success)
                {
                    vscode.window.showInformationMessage('Successfully pulled from remote');
                }
                else
                {
                    vscode.window.showErrorMessage('Failed to pull from remote. You may need to resolve conflicts.');
                }
            });

        } catch (error)
        {
            console.error('Git pull failed:', error);
            vscode.window.showErrorMessage(`Failed to pull: ${error}`);
        }
    }

    public async gitRebase(): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot)
        {
            vscode.window.showErrorMessage('No workspace detected. Git rebase requires a workspace.');
            return;
        }

        try
        {
            const gitService = new GitService(workspaceRoot);

            // Check if git repository
            try
            {
                await gitService.getCurrentBranch();
            } catch (error)
            {
                vscode.window.showErrorMessage('This workspace is not a Git repository.');
                return;
            }

            // Get list of branches
            const branches = await gitService.getAllBranches();
            const branchNames = branches
                .filter(b => !b.remote)
                .map(b => b.name);

            if (branchNames.length === 0)
            {
                vscode.window.showErrorMessage('No branches found.');
                return;
            }

            // Ask user to select a branch to rebase onto
            const targetBranch = await vscode.window.showQuickPick(branchNames, {
                placeHolder: 'Select branch to rebase onto',
                canPickMany: false
            });

            if (!targetBranch)
            {
                return;
            }

            // Check for uncommitted changes
            const status = await gitService.getGitInfo();
            if (status.hasLocalChanges)
            {
                vscode.window.showWarningMessage(
                    'You have uncommitted changes. Please commit or stash them before rebasing.'
                );
                return;
            }

            // Confirm rebase
            const confirmation = await vscode.window.showWarningMessage(
                `Rebase current branch onto '${targetBranch}'? This will rewrite commit history.`,
                'Yes, Rebase', 'Cancel'
            );

            if (confirmation !== 'Yes, Rebase')
            {
                return;
            }

            // Perform rebase
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Rebasing onto ${targetBranch}...`,
                cancellable: false
            }, async () =>
            {
                const result = await gitService.rebase(targetBranch);

                if (result.success)
                {
                    vscode.window.showInformationMessage(result.message);
                }
                else
                {
                    vscode.window.showErrorMessage(result.message);
                }
            });

        } catch (error)
        {
            console.error('Git rebase failed:', error);
            vscode.window.showErrorMessage(`Failed to rebase: ${error}`);
        }
    }

    public async gitOperations(): Promise<void>
    {
        const operations = [
            {
                label: '$(cloud-upload) Push All Bookmarked Files',
                description: 'Stage, commit, and push all bookmarked files',
                action: 'push'
            },
            {
                label: '$(cloud-download) Fetch',
                description: 'Fetch changes from remote',
                action: 'fetch'
            },
            {
                label: '$(repo-pull) Pull',
                description: 'Pull and merge changes from remote',
                action: 'pull'
            },
            {
                label: '$(git-merge) Rebase',
                description: 'Rebase current branch onto another',
                action: 'rebase'
            }
        ];

        const selected = await vscode.window.showQuickPick(operations, {
            placeHolder: 'Select a git operation'
        });

        if (!selected) return;

        switch (selected.action)
        {
            case 'push':
                await this.gitPushBookmarkedFiles();
                break;
            case 'fetch':
                await this.gitFetch();
                break;
            case 'pull':
                await this.gitPull();
                break;
            case 'rebase':
                await this.gitRebase();
                break;
        }
    }

    private async showDiffInEditor(diffContent: string, filePath: string, remoteBranch: string): Promise<void>
    {
        const doc = await vscode.workspace.openTextDocument({
            content: diffContent,
            language: 'diff'
        });

        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false
        });
    }

    private async generateAIDiffSummary(diffContent: string, filePath: string, remoteBranch: string): Promise<void>
    {
        try
        {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating AI diff summary...",
                cancellable: false
            }, async () =>
            {
                const prompt = `Analyze this git diff and provide a clear, concise summary of the changes:

File: ${filePath}
Comparing: local vs ${remoteBranch}

Diff:
${diffContent}

Please provide:
1. A brief summary of what changed
2. Key modifications, additions, or deletions
3. Potential impact or significance of these changes
4. Any notable patterns or concerns

Keep the summary focused and easy to understand.`;

                const summary = await AIService.generateCustomSummary(prompt);

                // Create and show a webview panel with the diff summary
                const panel = vscode.window.createWebviewPanel(
                    'gitDiffSummary',
                    `Git Diff Summary - ${path.basename(filePath)}`,
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: false,
                        retainContextWhenHidden: true
                    }
                );

                // Simple HTML rendering of the summary
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
                            .header {
                                border-bottom: 2px solid var(--vscode-foreground);
                                padding-bottom: 10px;
                                margin-bottom: 20px;
                            }
                            .file-info {
                                background-color: var(--vscode-textCodeBlock-background);
                                padding: 10px;
                                border-radius: 5px;
                                margin-bottom: 20px;
                                font-family: var(--vscode-editor-font-family);
                            }
                            h1, h2, h3, h4, h5, h6 { 
                                color: var(--vscode-foreground);
                                margin-top: 1.5em;
                                margin-bottom: 0.5em;
                            }
                            h1 { font-size: 1.8em; }
                            h2 { font-size: 1.5em; }
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
                        <div class="header">
                            <h1>Git Diff Summary</h1>
                        </div>
                        <div class="file-info">
                            <strong>File:</strong> ${filePath}<br>
                            <strong>Comparison:</strong> local vs ${remoteBranch}
                        </div>
                        <div class="content">
                            ${htmlContent}
                        </div>
                    </body>
                    </html>
                `;
            });
        } catch (error)
        {
            console.error('Error generating AI diff summary:', error);
            vscode.window.showErrorMessage('Failed to generate AI diff summary');
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
            const currentUser = await this.getCurrentUser();
            const config = {
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                updatedBy: currentUser,
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

            // Enhanced label with visual indicators
            let displayLabel = path.basename(dir.path);
            let visualIndicators = '';

            // Helper function to convert text to italic Unicode characters
            const toItalic = (text: string): string =>
            {
                const italicMap: { [key: string]: string } = {
                    'a': '𝘢', 'b': '𝘣', 'c': '𝘤', 'd': '𝘥', 'e': '𝘦', 'f': '𝘧', 'g': '𝘨', 'h': '𝘩', 'i': '𝘪', 'j': '𝘫',
                    'k': '𝘬', 'l': '𝘭', 'm': '𝘮', 'n': '𝘯', 'o': '𝘰', 'p': '𝘱', 'q': '𝘲', 'r': '𝘳', 's': '𝘴', 't': '𝘵',
                    'u': '𝘶', 'v': '𝘷', 'w': '𝘸', 'x': '𝘹', 'y': '𝘺', 'z': '𝘻',
                    'A': '𝘈', 'B': '𝘉', 'C': '𝘊', 'D': '𝘋', 'E': '𝘌', 'F': '𝘍', 'G': '𝘎', 'H': '𝘏', 'I': '𝘐', 'J': '𝘑',
                    'K': '𝘒', 'L': '𝘓', 'M': '𝘔', 'N': '𝘕', 'O': '𝘖', 'P': '𝘗', 'Q': '𝘘', 'R': '𝘙', 'S': '𝘚', 'T': '𝘛',
                    'U': '𝘜', 'V': '𝘝', 'W': '𝘞', 'X': '𝘟', 'Y': '𝘠', 'Z': '𝘡'
                };
                return text.split('').map(char => italicMap[char] || char).join('');
            };

            // Tags display (shown as italic badges before filename)
            let tagDisplay = '';
            if (dir.tags && dir.tags.length > 0)
            {
                // Display tags in italic Unicode characters with brackets
                tagDisplay = dir.tags.map(tag => `[${toItalic(tag)}]`).join(' ') + ' ';
            }

            // Priority indicators
            if (dir.priority === 'critical') visualIndicators += '🔥 ';
            else if (dir.priority === 'high') visualIndicators += '⚡ ';
            else if (dir.priority === 'low') visualIndicators += '⬇️ ';

            // Status indicators
            if (dir.status === 'in-review') visualIndicators += '👀 ';
            else if (dir.status === 'completed') visualIndicators += '✅ ';
            else if (dir.status === 'archived') visualIndicators += '📦 ';

            // Feature indicators
            if (dir.comments.length > 0) visualIndicators += `💬${dir.comments.length} `;
            if (dir.aiSummary) visualIndicators += '🤖 ';
            if (dir.watchers.length > 0) visualIndicators += `👁️${dir.watchers.length} `;
            if (dir.relatedPRs.length > 0) visualIndicators += `🔗${dir.relatedPRs.length} `;

            // Git status indicators
            if (dir.gitInfo?.hasLocalChanges) visualIndicators += '🔄 ';
            if (dir.gitInfo?.conflictStatus === 'conflicts') visualIndicators += '⚠️ ';

            // Update the item label through the constructor property
            // Tags appear first, then visual indicators, then filename
            const enhancedLabel = tagDisplay + visualIndicators + displayLabel;
            (item as any).label = enhancedLabel;

            // Enhanced tooltip with comprehensive metadata
            let tooltip = `📁 ${file.fsPath}`;

            if (dir.comment)
            {
                tooltip += `\n💬 Comment: ${dir.comment}`;
            }

            if (dir.tags && dir.tags.length > 0)
            {
                tooltip += `\n🏷️ Tags: ${dir.tags.join(', ')}`;
            }

            tooltip += `\n📊 Priority: ${dir.priority} | Status: ${dir.status}`;

            if (dir.addedBy)
            {
                tooltip += `\n👤 Added by: ${dir.addedBy}`;
            }

            if (dir.dateAdded)
            {
                tooltip += `\n📅 Added: ${dir.dateAdded.toLocaleDateString()}`;
            }

            if (dir.lastAccessed)
            {
                tooltip += `\n🕒 Last accessed: ${dir.lastAccessed.toLocaleDateString()}`;
            }

            if (dir.accessCount > 0)
            {
                tooltip += `\n📈 Access count: ${dir.accessCount}`;
            }

            if (dir.aiSummary)
            {
                tooltip += `\n🤖 AI Summary: ${dir.aiSummary.substring(0, 100)}...`;
            }

            if (dir.watchers.length > 0)
            {
                tooltip += `\n👁️ Watchers: ${dir.watchers.join(', ')}`;
            }

            if (dir.relatedPRs.length > 0)
            {
                const prTitles = dir.relatedPRs.map(pr => `#${pr.id}: ${pr.title}`).join(', ');
                tooltip += `\n🔗 Related PRs: ${prTitles}`;
            }

            if (dir.gitInfo)
            {
                tooltip += `\n🌿 Git: ${dir.gitInfo.currentBranch || 'unknown'}`;
                if (dir.gitInfo.hasLocalChanges) tooltip += ' (modified)';
                if (dir.gitInfo.conflictStatus === 'conflicts') tooltip += ' ⚠️ Conflicts';
            }

            item.tooltip = tooltip;
            item.setContextValue(this.bookmarkedDirectoryContextValue);

            // Set description for additional info in tree view
            let description = '';
            if (dir.comments.length > 0) description += `💬${dir.comments.length} `;
            if (dir.watchers.length > 0) description += `👁️${dir.watchers.length} `;
            if (dir.priority !== 'medium') description += `📊${dir.priority} `;

            if (description) item.description = description.trim();

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

    // New method to find bookmark for subdirectories/files within bookmarked folders
    private findParentBookmarkByUri(uri: vscode.Uri): { section: BookmarkSection, bookmark: TypedDirectory } | null
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        for (const section of this.bookmarkSections)
        {
            const bookmark = section.directories.find(d =>
            {
                let bookmarkPath: string;

                // Handle both relative and absolute path matching
                if (workspaceRoot && !path.isAbsolute(d.path))
                {
                    // Use path.join instead of path.resolve to avoid Windows path issues
                    bookmarkPath = path.join(workspaceRoot, d.path);
                }
                else
                {
                    bookmarkPath = d.path;
                }

                // Check if the target URI is within this bookmarked directory
                const relativePath = path.relative(bookmarkPath, uri.fsPath);

                // If relativePath doesn't start with '..' then uri is within bookmarkPath
                return !relativePath.startsWith('..') && relativePath !== '';
            });

            if (bookmark)
            {
                return { section, bookmark };
            }
        }

        return null;
    }

    // Enhanced method that tries both direct match and parent match
    private findBookmarkOrParentByUri(uri: vscode.Uri): { section: BookmarkSection, bookmark: TypedDirectory } | null
    {
        // First try to find direct match
        const directMatch = this.findBookmarkByUri(uri);
        if (directMatch)
        {
            return directMatch;
        }

        // If no direct match, try to find parent bookmark
        return this.findParentBookmarkByUri(uri);
    }

    // Get current user identifier (git username or fallback)
    private async getCurrentUser(): Promise<string>
    {
        try
        {
            if (this.workspaceRoot && this.workspaceRoot.length > 0)
            {
                const gitService = new GitService(this.workspaceRoot[0].uri.fsPath);
                return await gitService.getCurrentGitUser();
            }
        } catch (error)
        {
            console.error('Error getting git user:', error);
        }

        // Fallback to shortened machine ID if git not available
        return vscode.env.machineId.substring(0, 8);
    }

    // New Collaborative Methods
    public async getTypedDirectoryForUri(uri: vscode.Uri): Promise<TypedDirectory | null>
    {
        const result = this.findBookmarkOrParentByUri(uri);
        return result ? result.bookmark : null;
    }

    public async saveItems(): Promise<void>
    {
        this.saveSections();
    }

    public async addQuickComment(uri: vscode.Uri, comment: string): Promise<void>
    {
        const result = this.findBookmarkOrParentByUri(uri);
        if (result)
        {
            const currentUser = await this.getCurrentUser();
            result.bookmark.addComment(currentUser, comment, 'general');
            this.saveSections();
        }
    }

    public async createPullRequest(uri: vscode.Uri): Promise<void>
    {
        try
        {
            const workspaceFolder = this.workspaceRoot?.[0];
            if (!workspaceFolder)
            {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const git = simpleGit(workspaceFolder.uri.fsPath);
            const status = await git.status();
            const currentBranch = status.current;

            if (!currentBranch)
            {
                vscode.window.showErrorMessage('Could not determine current branch');
                return;
            }

            // Get PR details from user
            const title = await vscode.window.showInputBox({
                prompt: 'Enter PR title',
                placeHolder: 'Fix: Update bookmark functionality'
            });

            if (!title) return;

            const body = await vscode.window.showInputBox({
                prompt: 'Enter PR description',
                placeHolder: 'Describe your changes...'
            });

            const targetBranch = await vscode.window.showInputBox({
                prompt: 'Enter target branch',
                value: 'main',
                placeHolder: 'main'
            });

            if (!targetBranch) return;

            // Here you would typically use GitHub API to create the PR
            // For now, just open the GitHub PR creation page
            const repoUrl = await this.getRepositoryUrl();
            if (repoUrl)
            {
                const prUrl = `${repoUrl}/compare/${targetBranch}...${currentBranch}?quick_pull=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body || '')}`;
                vscode.env.openExternal(vscode.Uri.parse(prUrl));
            }
        }
        catch (error)
        {
            vscode.window.showErrorMessage(`Error creating PR: ${error}`);
        }
    }

    public async linkPullRequest(uri: vscode.Uri, prUrl: string): Promise<void>
    {
        const result = this.findBookmarkOrParentByUri(uri);
        if (result)
        {
            // Parse PR info from URL
            const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
            if (match)
            {
                const [, owner, repo, prNumber] = match;
                const prInfo = {
                    id: parseInt(prNumber),
                    title: `PR #${prNumber}`,
                    url: prUrl,
                    status: 'open' as const,
                    author: 'unknown',
                    created: new Date(),
                    updated: new Date(),
                    targetBranch: 'main',
                    sourceBranch: 'feature'
                };

                result.bookmark.addRelatedPR(prInfo);
                this.saveSections();
                vscode.window.showInformationMessage(`Linked PR #${prNumber} to bookmark`);
            }
            else
            {
                vscode.window.showErrorMessage('Invalid GitHub PR URL');
            }
        }
    }

    public async showOnGitHub(uri: vscode.Uri): Promise<void>
    {
        try
        {
            const repoUrl = await this.getRepositoryUrl();
            if (repoUrl)
            {
                // Get the relative path and open on GitHub
                const workspaceFolder = this.workspaceRoot?.[0];
                if (workspaceFolder)
                {
                    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
                    // Convert Windows backslashes to forward slashes for URL
                    const urlPath = relativePath.replace(/\\/g, '/');

                    // Get the current branch or default to master
                    let branch = 'master'; // Default fallback
                    try
                    {
                        const git = simpleGit(workspaceFolder.uri.fsPath);

                        // First, try to get the default branch from remote HEAD
                        try
                        {
                            const remoteInfo = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
                            if (remoteInfo)
                            {
                                const match = remoteInfo.match(/refs\/remotes\/origin\/(.+)/);
                                if (match)
                                {
                                    branch = match[1].trim();
                                }
                            }
                        }
                        catch (remoteError)
                        {
                            // If that fails, check what branches exist
                            const branches = await git.branch(['-r']);
                            const defaultBranch = branches.all.find((b: string) =>
                                b.includes('origin/master') || b.includes('origin/main')
                            );
                            if (defaultBranch)
                            {
                                branch = defaultBranch.includes('master') ? 'master' : 'main';
                            }
                        }
                    }
                    catch (gitError)
                    {
                        console.warn('Could not determine branch, using master:', gitError);
                        branch = 'master';
                    } const githubUrl = `${repoUrl}/blob/${branch}/${urlPath}`;
                    vscode.env.openExternal(vscode.Uri.parse(githubUrl));
                }
                else
                {
                    vscode.env.openExternal(vscode.Uri.parse(repoUrl));
                }
            }
            else
            {
                vscode.window.showErrorMessage('Could not determine GitHub repository URL');
            }
        }
        catch (error)
        {
            vscode.window.showErrorMessage(`Error opening GitHub: ${error}`);
        }
    }

    private async getRepositoryUrl(): Promise<string | null>
    {
        try
        {
            const workspaceFolder = this.workspaceRoot?.[0];
            if (!workspaceFolder) return null;

            const git = simpleGit(workspaceFolder.uri.fsPath);
            const remotes = await git.getRemotes(true);
            const origin = remotes.find((r: any) => r.name === 'origin');

            if (origin && origin.refs.fetch)
            {
                // Convert SSH to HTTPS URL if needed
                let url = origin.refs.fetch;
                if (url.startsWith('git@github.com:'))
                {
                    url = url.replace('git@github.com:', 'https://github.com/');
                }
                if (url.endsWith('.git'))
                {
                    url = url.slice(0, -4);
                }
                return url;
            }

            return null;
        }
        catch (error)
        {
            return null;
        }
    }

    private async handleGitDiffOption(uri: vscode.Uri, gitService: GitService, option: string, currentBranch: string): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot) return;

        // Pass the absolute path and let GitService handle the path logic
        const absolutePath = uri.fsPath;

        // Debug: Log path information
        console.log('Git diff requested for:', {
            fileName: path.basename(absolutePath),
            workspaceRoot: path.basename(workspaceRoot),
            isWithinWorkspace: !path.relative(workspaceRoot, absolutePath).startsWith('..')
        });

        try
        {
            switch (option)
            {
                case 'working':
                    await this.showWorkingDirectoryDiff(gitService, absolutePath);
                    break;
                case 'remote':
                    await this.showRemoteDiff(gitService, absolutePath, currentBranch);
                    break;
                case 'branches':
                    await this.showBranchDiff(gitService, absolutePath);
                    break;
                case 'history':
                    await this.showFileHistory(gitService, absolutePath);
                    break;
            }
        } catch (error)
        {
            console.error('Error handling git diff option:', error);
            vscode.window.showErrorMessage(`Failed to show git diff: ${error}`);
        }
    }

    private async showWorkingDirectoryDiff(gitService: GitService, absolutePath: string): Promise<void>
    {
        const diff = await gitService.getWorkingDirectoryChanges(absolutePath);

        // Check if there was an error getting the diff
        if (diff && diff.startsWith('Error:'))
        {
            vscode.window.showErrorMessage(diff);
            return;
        }

        if (!diff || diff.trim() === '')
        {
            vscode.window.showInformationMessage('No uncommitted changes found for this file.');
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), 'Working Directory vs HEAD', absolutePath, 'working');
    }

    private async showRemoteDiff(gitService: GitService, absolutePath: string, currentBranch: string): Promise<void>
    {
        const remoteBranch = `origin/${currentBranch}`;
        const diff = await gitService.compareWithRemote(currentBranch, remoteBranch, absolutePath);

        if (!diff || diff.trim() === '')
        {
            vscode.window.showInformationMessage('No differences found between local and remote for this file.');
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), `Local vs ${remoteBranch}`, absolutePath, 'remote', remoteBranch);
    }

    private async showBranchDiff(gitService: GitService, absolutePath: string): Promise<void>
    {
        const branches = await gitService.getAllBranches();
        const branchNames = branches.map(b => b.name).filter(name => !name.startsWith('remotes/'));

        if (branchNames.length < 2)
        {
            vscode.window.showInformationMessage('Need at least 2 branches to compare.');
            return;
        }

        const branch1 = await vscode.window.showQuickPick(branchNames, {
            placeHolder: 'Select first branch'
        });

        if (!branch1) return;

        const branch2 = await vscode.window.showQuickPick(
            branchNames.filter(name => name !== branch1),
            { placeHolder: 'Select second branch' }
        );

        if (!branch2) return;

        // Use the GitService method for consistent path handling
        const diff = await gitService.compareBranches(branch1, branch2, absolutePath);

        if (!diff || diff.trim() === '')
        {
            vscode.window.showInformationMessage(`No differences found between ${branch1} and ${branch2} for this file.`);
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), `${branch1} vs ${branch2}`, absolutePath);
    }

    private async showFileHistory(gitService: GitService, absolutePath: string): Promise<void>
    {
        const history = await gitService.getFileHistory(absolutePath, 10);

        if (history.commits.length === 0)
        {
            vscode.window.showInformationMessage('No commit history found for this file.');
            return;
        }

        const commitItems = history.commits.map(commit => ({
            label: commit.message.split('\n')[0], // First line of commit message
            description: `${commit.author} • ${commit.date.toLocaleDateString()}`,
            detail: commit.hash.substring(0, 8),
            commit
        }));

        const selectedCommit = await vscode.window.showQuickPick(commitItems, {
            placeHolder: 'Select a commit to compare with current version'
        });

        if (!selectedCommit) return;

        // Use GitService for consistent path handling
        const diff = await gitService.getFileChanges(absolutePath, selectedCommit.commit.hash, 'HEAD');

        if (!diff || diff.trim() === '')
        {
            vscode.window.showInformationMessage('No differences found with the selected commit.');
            return;
        }

        await this.presentDiffOptions(diff, path.basename(absolutePath), `Current vs ${selectedCommit.commit.hash.substring(0, 8)}`, absolutePath);
    }

    private async presentDiffOptions(diff: string, fileName: string, compareInfo: string, absolutePath?: string, diffType?: string, remoteBranch?: string): Promise<void>
    {
        // First, show the side-by-side diff by default if available
        if (absolutePath)
        {
            await this.showSideBySideDiff(absolutePath, compareInfo, diffType, remoteBranch);
        }
        else
        {
            // Fallback to text diff if no path available
            await this.showDiffInEditor(diff, fileName, compareInfo);
        }

        // Then offer additional options
        const action = await vscode.window.showInformationMessage(
            `Git diff: ${compareInfo}`,
            'View Raw Diff', 'AI Summarize Diff', 'Close'
        );

        switch (action)
        {
            case 'View Raw Diff':
                await this.showDiffInEditor(diff, fileName, compareInfo);
                break;
            case 'AI Summarize Diff':
                await this.generateAIDiffSummary(diff, fileName, compareInfo);
                break;
        }
    }

    private async showSideBySideDiff(absolutePath: string, compareInfo: string, diffType?: string, remoteBranch?: string): Promise<void>
    {
        const workspaceRoot = this.workspaceRoot && this.workspaceRoot.length > 0
            ? this.workspaceRoot[0].uri.fsPath
            : undefined;

        if (!workspaceRoot) 
        {
            vscode.window.showErrorMessage('No workspace found for diff comparison.');
            return;
        }

        try
        {
            const relativePath = path.relative(workspaceRoot, absolutePath);
            const normalizedPath = relativePath.replace(/\\/g, '/');
            
            // Determine which version to compare against
            let compareRef = 'HEAD';
            let compareLabel = 'HEAD';
            
            if (diffType === 'remote' && remoteBranch)
            {
                compareRef = remoteBranch;
                compareLabel = remoteBranch;
            }
            
            // Get comparison content using simple-git
            const git = simpleGit(workspaceRoot);
            const compareContent = await git.show([`${compareRef}:${normalizedPath}`]);
            
            // Use a scheme-based URI that won't persist
            const compareUri = vscode.Uri.parse(`git-diff:${path.basename(absolutePath)} (${compareLabel}).${path.extname(absolutePath)}`).with({
                scheme: 'git-diff',
                query: Buffer.from(compareContent).toString('base64')
            });
            
            // Register a content provider for our custom scheme
            const disposable = vscode.workspace.registerTextDocumentContentProvider('git-diff', {
                provideTextDocumentContent(uri: vscode.Uri): string {
                    return Buffer.from(uri.query, 'base64').toString('utf-8');
                }
            });
            
            // Open current file
            const currentUri = vscode.Uri.file(absolutePath);
            
            // Open diff editor
            await vscode.commands.executeCommand(
                'vscode.diff',
                compareUri,
                currentUri,
                `${path.basename(absolutePath)} (${compareLabel} ↔ Working Tree)`
            );
            
            // Dispose the provider after a delay to allow the diff to open
            setTimeout(() => disposable.dispose(), 1000);
        } catch (error)
        {
            console.error('Side-by-side diff failed:', error);
            
            // Try alternative: just open the file with git extension
            try
            {
                const fileUri = vscode.Uri.file(absolutePath);
                await vscode.commands.executeCommand('git.openChange', fileUri);
            } catch (altError)
            {
                vscode.window.showErrorMessage(`Could not open diff view: ${error}`);
            }
        }
    }

    private async handleCherryPickOption(uri: vscode.Uri, gitService: GitService, sourceBranch: string, option: string): Promise<void>
    {
        const absolutePath = uri.fsPath;

        try
        {
            switch (option)
            {
                case 'file':
                    await this.showFileCommitsForCherryPick(gitService, sourceBranch, absolutePath);
                    break;
                case 'commits':
                    await this.showBranchCommitsForCherryPick(gitService, sourceBranch);
                    break;
            }
        } catch (error)
        {
            console.error('Error handling cherry-pick option:', error);
            vscode.window.showErrorMessage(`Failed to handle cherry-pick: ${error}`);
        }
    }

    private async showFileCommitsForCherryPick(gitService: GitService, sourceBranch: string, absolutePath: string): Promise<void>
    {
        // Get commits that affected this specific file from the source branch
        const commits = await gitService.getCommitsFromBranch(sourceBranch, absolutePath, 20);

        if (commits.length === 0)
        {
            vscode.window.showInformationMessage(`No commits found for this file in branch '${sourceBranch}'.`);
            return;
        }

        // Create commit selection items
        const commitItems = commits.map(commit => ({
            label: `${commit.hash.substring(0, 8)} - ${commit.message.split('\n')[0]}`,
            description: `${commit.author} • ${commit.date.toLocaleDateString()}`,
            detail: commit.message.length > 50 ? commit.message.substring(0, 50) + '...' : commit.message,
            commit
        }));

        // Allow multi-select for commits
        const selectedCommits = await vscode.window.showQuickPick(commitItems, {
            placeHolder: `Select commits to cherry-pick for ${path.basename(absolutePath)}`,
            canPickMany: true
        });

        if (!selectedCommits || selectedCommits.length === 0) return;

        // Show confirmation dialog
        const commitMessages = selectedCommits.map(item =>
            `• ${item.commit.hash.substring(0, 8)}: ${item.commit.message.split('\n')[0]}`
        ).join('\n');

        const confirmation = await vscode.window.showWarningMessage(
            `Cherry-pick ${selectedCommits.length} commit(s) for file '${path.basename(absolutePath)}'?\n\n${commitMessages}`,
            'Yes, Cherry-pick', 'Cancel'
        );

        if (confirmation !== 'Yes, Cherry-pick') return;

        // Apply cherry-picks
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Cherry-picking file changes...",
            cancellable: false
        }, async (progress) =>
        {
            const results: string[] = [];

            for (let i = 0; i < selectedCommits.length; i++)
            {
                const commit = selectedCommits[i].commit;
                progress.report({
                    increment: (100 / selectedCommits.length),
                    message: `Processing commit ${i + 1}/${selectedCommits.length}: ${commit.hash.substring(0, 8)}`
                });

                const result = await gitService.cherryPickCommit(commit.hash, absolutePath);
                results.push(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
            }

            // Show results
            const successCount = results.filter(r => r.startsWith('✓')).length;
            const failureCount = results.filter(r => r.startsWith('✗')).length;

            const resultMessage = `Cherry-pick completed!\n\n✅ Success: ${successCount}\n❌ Failed: ${failureCount}\n\nDetails:\n${results.join('\n')}`;

            if (failureCount === 0)
            {
                vscode.window.showInformationMessage('All cherry-picks completed successfully!')
                    .then(() => this.showDetailedResults(resultMessage));
            }
            else
            {
                vscode.window.showWarningMessage(`Cherry-pick completed with ${failureCount} failures`)
                    .then(() => this.showDetailedResults(resultMessage));
            }
        });
    }

    private async showBranchCommitsForCherryPick(gitService: GitService, sourceBranch: string): Promise<void>
    {
        // Get recent commits from the source branch
        const commits = await gitService.getCommitsFromBranch(sourceBranch, undefined, 20);

        if (commits.length === 0)
        {
            vscode.window.showInformationMessage(`No commits found in branch '${sourceBranch}'.`);
            return;
        }

        // Create commit selection items
        const commitItems = commits.map(commit => ({
            label: `${commit.hash.substring(0, 8)} - ${commit.message.split('\n')[0]}`,
            description: `${commit.author} • ${commit.date.toLocaleDateString()}`,
            detail: `Files: ${commit.files.length > 0 ? commit.files.join(', ') : 'N/A'}`,
            commit
        }));

        // Allow selection of commit range or individual commits
        const cherryPickType = await vscode.window.showQuickPick([
            {
                label: 'Select Individual Commits',
                description: 'Choose specific commits to cherry-pick',
                option: 'individual'
            },
            {
                label: 'Select Commit Range',
                description: 'Cherry-pick a range of commits',
                option: 'range'
            }
        ], {
            placeHolder: 'Choose cherry-pick method'
        });

        if (!cherryPickType) return;

        if (cherryPickType.option === 'individual')
        {
            await this.handleIndividualCommitCherryPick(gitService, commitItems);
        }
        else
        {
            await this.handleRangeCommitCherryPick(gitService, commitItems);
        }
    }

    private async handleIndividualCommitCherryPick(gitService: GitService, commitItems: any[]): Promise<void>
    {
        const selectedCommits = await vscode.window.showQuickPick(commitItems, {
            placeHolder: 'Select commits to cherry-pick',
            canPickMany: true
        });

        if (!selectedCommits || selectedCommits.length === 0) return;

        // Show confirmation
        const commitMessages = selectedCommits.map(item =>
            `• ${item.commit.hash.substring(0, 8)}: ${item.commit.message.split('\n')[0]}`
        ).join('\n');

        const confirmation = await vscode.window.showWarningMessage(
            `Cherry-pick ${selectedCommits.length} commit(s)?\n\n${commitMessages}`,
            'Yes, Cherry-pick', 'Cancel'
        );

        if (confirmation !== 'Yes, Cherry-pick') return;

        // Apply cherry-picks
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Cherry-picking commits...",
            cancellable: false
        }, async (progress) =>
        {
            const results: string[] = [];

            for (let i = 0; i < selectedCommits.length; i++)
            {
                const commit = selectedCommits[i].commit;
                progress.report({
                    increment: (100 / selectedCommits.length),
                    message: `Processing commit ${i + 1}/${selectedCommits.length}: ${commit.hash.substring(0, 8)}`
                });

                const result = await gitService.cherryPickCommit(commit.hash);
                results.push(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);

                // If there's a failure, stop and let user handle it
                if (!result.success && result.message.includes('conflict'))
                {
                    const action = await vscode.window.showErrorMessage(
                        `Cherry-pick conflict detected on commit ${commit.hash.substring(0, 8)}. What would you like to do?`,
                        'Abort Cherry-pick', 'Continue Manually', 'Skip This Commit'
                    );

                    if (action === 'Abort Cherry-pick')
                    {
                        await gitService.abortCherryPick();
                        results.push('✗ Cherry-pick aborted by user');
                        break;
                    }
                    else if (action === 'Continue Manually')
                    {
                        vscode.window.showInformationMessage('Please resolve conflicts manually, then run "git cherry-pick --continue"');
                        break;
                    }
                    // Skip and continue with next commit
                }
            }

            this.showDetailedResults(`Cherry-pick Results:\n\n${results.join('\n')}`);
        });
    }

    private async handleRangeCommitCherryPick(gitService: GitService, commitItems: any[]): Promise<void>
    {
        const fromCommit = await vscode.window.showQuickPick(commitItems, {
            placeHolder: 'Select starting commit (older)'
        });

        if (!fromCommit) return;

        const toCommits = commitItems.filter(item => item.commit.hash !== fromCommit.commit.hash);
        const toCommit = await vscode.window.showQuickPick(toCommits, {
            placeHolder: 'Select ending commit (newer)'
        });

        if (!toCommit) return;

        const confirmation = await vscode.window.showWarningMessage(
            `Cherry-pick commit range ${fromCommit.commit.hash.substring(0, 8)}..${toCommit.commit.hash.substring(0, 8)}?`,
            'Yes, Cherry-pick Range', 'Cancel'
        );

        if (confirmation !== 'Yes, Cherry-pick Range') return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Cherry-picking commit range...",
            cancellable: false
        }, async () =>
        {
            const result = await gitService.cherryPickRange(fromCommit.commit.hash, toCommit.commit.hash);

            if (result.success)
            {
                vscode.window.showInformationMessage(result.message);
            }
            else
            {
                vscode.window.showErrorMessage(result.message);
            }
        });
    }

    private async showDetailedResults(message: string): Promise<void>
    {
        // Create and show results in a new document
        const doc = await vscode.workspace.openTextDocument({
            content: message,
            language: 'plaintext'
        });

        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false
        });
    }
}
