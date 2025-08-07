import * as vscode from 'vscode';
import { TypedDirectory, Comment, ActivityEntry } from '../types/TypedDirectory';
import { CommentService, CommentThread } from '../services/CommentService';
import { GitService } from '../services/GitService';
import { GitHubService } from '../services/GitHubService';

export class CollaborativePanel
{
    public static currentPanel: CollaborativePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _currentItem: TypedDirectory | undefined;
    private _commentService: CommentService;
    private _gitService: GitService | undefined;
    private _githubService: GitHubService;

    public static createOrShow(extensionUri: vscode.Uri, item: TypedDirectory)
    {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (CollaborativePanel.currentPanel)
        {
            CollaborativePanel.currentPanel._panel.reveal(column);
            CollaborativePanel.currentPanel.updateItem(item);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'collaborativePanel',
            `Collaboration: ${item.path}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        CollaborativePanel.currentPanel = new CollaborativePanel(panel, extensionUri, item);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        item: TypedDirectory
    )
    {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._currentItem = item;
        this._commentService = new CommentService();
        this._githubService = new GitHubService();

        // Initialize git service if in a git repository
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder)
        {
            this._gitService = new GitService(workspaceFolder.uri.fsPath);
        }

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    // Get current user identifier (git username or fallback)
    private async getCurrentUser(): Promise<string>
    {
        try
        {
            if (this._gitService)
            {
                return await this._gitService.getCurrentGitUser();
            }

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

    private async _handleMessage(message: any)
    {
        switch (message.command)
        {
            case 'addComment':
                await this._handleAddComment(message.data);
                break;
            case 'resolveComment':
                this._handleResolveComment(message.commentId);
                break;
            case 'addReaction':
                this._handleAddReaction(message.commentId, message.emoji, message.userId);
                break;
            case 'updateStatus':
                await this._handleUpdateStatus(message.status);
                break;
            case 'updatePriority':
                await this._handleUpdatePriority(message.priority);
                break;
            case 'addWatcher':
                this._handleAddWatcher(message.userId);
                break;
            case 'removeWatcher':
                this._handleRemoveWatcher(message.userId);
                break;
            case 'showGitDiff':
                this._handleShowGitDiff();
                break;
            case 'createPR':
                this._handleCreatePR(message.data);
                break;
            case 'refreshGitInfo':
                this._handleRefreshGitInfo();
                break;
            case 'exportComments':
                this._handleExportComments(message.format);
                break;
        }
    }

    private async _handleAddComment(data: { content: string; type: Comment['type']; parentId?: string })
    {
        if (!this._currentItem) return;

        const validation = this._commentService.validateComment(data.content);
        if (!validation.isValid)
        {
            vscode.window.showErrorMessage(`Comment validation failed: ${validation.errors.join(', ')}`);
            return;
        }

        const currentUser = await this.getCurrentUser(); // Use git username
        const comment = this._currentItem.addComment(currentUser, data.content, data.type, data.parentId);

        // Process mentions and send notifications
        const processed = this._commentService.processCommentContent(data.content);
        processed.mentions.forEach(mention =>
        {
            this._commentService.addNotification({
                type: 'mention',
                fromUser: currentUser,
                toUser: mention,
                commentId: comment.id,
                itemPath: this._currentItem!.path,
                message: `mentioned you in a comment`
            });
        });

        this._update();
        vscode.window.showInformationMessage('Comment added successfully!');
    }

    private _handleResolveComment(commentId: string)
    {
        if (!this._currentItem) return;

        this._currentItem.resolveComment(commentId);
        this._update();
        vscode.window.showInformationMessage('Comment resolved!');
    }

    private _handleAddReaction(commentId: string, emoji: string, userId: string)
    {
        if (!this._currentItem) return;

        this._currentItem.addReaction(commentId, emoji, userId);
        this._update();
    }

    private async _handleUpdateStatus(status: TypedDirectory['status'])
    {
        if (!this._currentItem) return;

        const currentUser = await this.getCurrentUser();
        this._currentItem.updateStatus(status, currentUser);
        this._update();
        vscode.window.showInformationMessage(`Status updated to ${status}`);
    }

    private async _handleUpdatePriority(priority: TypedDirectory['priority'])
    {
        if (!this._currentItem) return;

        const currentUser = await this.getCurrentUser();
        this._currentItem.updatePriority(priority, currentUser);
        this._update();
        vscode.window.showInformationMessage(`Priority updated to ${priority}`);
    }

    private _handleAddWatcher(userId: string)
    {
        if (!this._currentItem) return;

        this._currentItem.addWatcher(userId);
        this._update();
    }

    private _handleRemoveWatcher(userId: string)
    {
        if (!this._currentItem) return;

        this._currentItem.removeWatcher(userId);
        this._update();
    }

    private async _handleShowGitDiff()
    {
        if (!this._gitService || !this._currentItem) return;

        try
        {
            const diff = await this._gitService.compareWithRemote();
            if (diff)
            {
                const document = await vscode.workspace.openTextDocument({
                    content: diff,
                    language: 'diff'
                });
                vscode.window.showTextDocument(document);
            } else
            {
                vscode.window.showInformationMessage('No differences found with remote branch.');
            }
        } catch (error)
        {
            vscode.window.showErrorMessage(`Error showing git diff: ${error}`);
        }
    }

    private async _handleCreatePR(data: { title: string; body: string; targetBranch: string })
    {
        if (!this._githubService || !this._currentItem || !this._gitService) return;

        try
        {
            // Get repository info from git remote
            const remoteUrl = await this._gitService.getRemoteUrl();
            const repoInfo = await this._githubService.getRepositoryFromRemote(remoteUrl);

            if (!repoInfo)
            {
                vscode.window.showErrorMessage('Could not determine GitHub repository from remote URL.');
                return;
            }

            const currentBranch = await this._gitService.getCurrentBranch();
            const pr = await this._githubService.createPullRequest(
                repoInfo.owner,
                repoInfo.name,
                data.title,
                data.body,
                currentBranch,
                data.targetBranch
            );

            if (pr)
            {
                this._currentItem.addRelatedPR(pr);
                this._update();
                vscode.window.showInformationMessage(`Pull request created: ${pr.url}`);
            } else
            {
                vscode.window.showErrorMessage('Failed to create pull request.');
            }
        } catch (error)
        {
            vscode.window.showErrorMessage(`Error creating PR: ${error}`);
        }
    }

    private async _handleRefreshGitInfo()
    {
        if (!this._gitService || !this._currentItem) return;

        try
        {
            const gitInfo = await this._gitService.getGitInfo(this._currentItem.path);
            this._currentItem.updateGitInfo(gitInfo);
            this._update();
        } catch (error)
        {
            vscode.window.showErrorMessage(`Error refreshing git info: ${error}`);
        }
    }

    private _handleExportComments(format: 'json' | 'csv' | 'markdown')
    {
        if (!this._currentItem) return;

        const exportData = this._commentService.exportComments(this._currentItem, format);
        const fileName = `comments-${this._currentItem.path.replace(/[^a-zA-Z0-9]/g, '_')}.${format}`;

        vscode.workspace.openTextDocument({
            content: exportData,
            language: format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'markdown'
        }).then(doc =>
        {
            vscode.window.showTextDocument(doc);
        });
    }

    public updateItem(item: TypedDirectory)
    {
        this._currentItem = item;
        this._panel.title = `Collaboration: ${item.path}`;
        this._update();
    }

    private _update()
    {
        const webview = this._panel.webview;
        this._panel.title = `Collaboration: ${this._currentItem?.path || 'Unknown'}`;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview)
    {
        if (!this._currentItem)
        {
            return '<html><body><h1>No item selected</h1></body></html>';
        }

        const item = this._currentItem;
        const threads = this._commentService.getCommentThreads(item);
        const stats = this._commentService.getCommentStats(item);
        const recentActivity = item.getRecentActivity(7);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Collaborative Panel</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 20px;
            margin-bottom: 20px;
        }
        .status-bar {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            align-items: center;
        }
        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .status-active { background: var(--vscode-testing-iconPassed); }
        .status-in-review { background: var(--vscode-testing-iconQueued); }
        .status-completed { background: var(--vscode-testing-iconPassed); }
        .status-archived { background: var(--vscode-testing-iconSkipped); }
        .priority-low { background: var(--vscode-charts-blue); }
        .priority-medium { background: var(--vscode-charts-yellow); }
        .priority-high { background: var(--vscode-charts-orange); }
        .priority-critical { background: var(--vscode-charts-red); }
        .section {
            margin-bottom: 30px;
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
        }
        .section h3 {
            margin-top: 0;
            color: var(--vscode-textLink-foreground);
        }
        .comment-thread {
            margin-bottom: 20px;
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding-left: 15px;
        }
        .comment {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 10px;
        }
        .comment-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .comment-content {
            margin-bottom: 8px;
        }
        .comment-actions {
            display: flex;
            gap: 10px;
            font-size: 12px;
        }
        .btn {
            padding: 4px 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .input-group {
            margin-bottom: 15px;
        }
        .input-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        .input-group input, .input-group textarea, .input-group select {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        .input-group textarea {
            resize: vertical;
            min-height: 100px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .activity-item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .activity-icon {
            width: 20px;
            height: 20px;
            margin-right: 10px;
            border-radius: 50%;
            background: var(--vscode-textLink-foreground);
        }
        .git-info {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 15px;
        }
        .watchers {
            display: flex;
            gap: 5px;
            align-items: center;
        }
        .watcher {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 12px;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${item.path}</h1>
        <div class="status-bar">
            <span class="status-badge status-${item.status}">${item.status.toUpperCase()}</span>
            <span class="status-badge priority-${item.priority}">${item.priority.toUpperCase()}</span>
            ${item.needsAttention() ? '<span class="status-badge" style="background: var(--vscode-charts-red);">⚠ NEEDS ATTENTION</span>' : ''}
        </div>
        <div class="watchers">
            <strong>Watchers:</strong>
            ${item.watchers.map(w => `<span class="watcher">${w}</span>`).join('')}
            <button class="btn" onclick="addWatcher()">+ Add Watcher</button>
        </div>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-number">${stats.total}</div>
            <div class="stat-label">Total Comments</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.unresolved}</div>
            <div class="stat-label">Unresolved</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.threads}</div>
            <div class="stat-label">Threads</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${item.relatedPRs.length}</div>
            <div class="stat-label">Related PRs</div>
        </div>
    </div>

    ${item.gitInfo ? `
    <div class="section">
        <h3>🔧 Git Information</h3>
        <div class="git-info">
            <p><strong>Branch:</strong> ${item.gitInfo.currentBranch || 'unknown'}</p>
            <p><strong>Last Commit:</strong> ${item.gitInfo.lastCommit?.substring(0, 8) || 'unknown'}</p>
            <p><strong>Local Changes:</strong> ${item.gitInfo.hasLocalChanges ? 'Yes' : 'No'}</p>
            <p><strong>Remote:</strong> ${item.gitInfo.remoteBranch || 'none'}</p>
            <p><strong>Conflict Status:</strong> ${item.gitInfo.conflictStatus}</p>
            <button class="btn" onclick="showGitDiff()">Show Diff</button>
            <button class="btn" onclick="refreshGitInfo()">Refresh</button>
        </div>
    </div>
    ` : ''}

    ${item.relatedPRs.length > 0 ? `
    <div class="section">
        <h3>🔀 Related Pull Requests</h3>
        ${item.relatedPRs.map(pr => `
            <div class="comment">
                <div class="comment-header">
                    <span><strong>PR #${pr.id}:</strong> ${pr.title}</span>
                    <span class="status-badge status-${pr.status}">${pr.status}</span>
                </div>
                <p><strong>Author:</strong> ${pr.author}</p>
                <p><strong>Branch:</strong> ${pr.sourceBranch} → ${pr.targetBranch}</p>
                <div class="comment-actions">
                    <a href="${pr.url}" target="_blank" class="btn">View on GitHub</a>
                </div>
            </div>
        `).join('')}
        <button class="btn" onclick="createPR()">Create New PR</button>
    </div>
    ` : ''}

    <div class="section">
        <h3>💬 Comments & Discussions</h3>
        <div class="input-group">
            <label for="new-comment">Add New Comment</label>
            <textarea id="new-comment" placeholder="Write your comment..."></textarea>
        </div>
        <div class="input-group">
            <label for="comment-type">Type</label>
            <select id="comment-type">
                <option value="general">General</option>
                <option value="code-review">Code Review</option>
                <option value="suggestion">Suggestion</option>
                <option value="question">Question</option>
            </select>
        </div>
        <button class="btn" onclick="addComment()">Add Comment</button>
        
        <div style="margin-top: 20px;">
            ${threads.map(thread => `
                <div class="comment-thread">
                    <div class="comment">
                        <div class="comment-header">
                            <span><strong>${thread.rootComment.author}</strong> - ${thread.rootComment.type}</span>
                            <span>${new Date(thread.rootComment.timestamp).toLocaleString()}</span>
                        </div>
                        <div class="comment-content">${thread.rootComment.content}</div>
                        <div class="comment-actions">
                            ${!thread.rootComment.resolved ? `<button class="btn" onclick="resolveComment('${thread.rootComment.id}')">Resolve</button>` : '<span style="color: green;">✅ Resolved</span>'}
                            <button class="btn" onclick="addReaction('${thread.rootComment.id}', '👍')">👍</button>
                            <button class="btn" onclick="addReaction('${thread.rootComment.id}', '❤️')">❤️</button>
                        </div>
                    </div>
                    ${thread.replies.map(reply => `
                        <div class="comment" style="margin-left: 20px;">
                            <div class="comment-header">
                                <span><strong>${reply.author}</strong></span>
                                <span>${new Date(reply.timestamp).toLocaleString()}</span>
                            </div>
                            <div class="comment-content">${reply.content}</div>
                        </div>
                    `).join('')}
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h3>📊 Recent Activity</h3>
        ${recentActivity.slice(0, 10).map(activity => `
            <div class="activity-item">
                <div class="activity-icon"></div>
                <div>
                    <strong>${activity.author}</strong> ${activity.description}
                    <br><small>${new Date(activity.timestamp).toLocaleString()}</small>
                </div>
            </div>
        `).join('')}
    </div>

    <div class="section">
        <h3>⚙️ Actions</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
            <button class="btn" onclick="updateStatus()">Change Status</button>
            <button class="btn" onclick="updatePriority()">Change Priority</button>
            <button class="btn" onclick="exportComments('json')">Export as JSON</button>
            <button class="btn" onclick="exportComments('csv')">Export as CSV</button>
            <button class="btn" onclick="exportComments('markdown')">Export as Markdown</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function addComment() {
            const content = document.getElementById('new-comment').value;
            const type = document.getElementById('comment-type').value;
            
            if (!content.trim()) {
                alert('Please enter a comment');
                return;
            }

            vscode.postMessage({
                command: 'addComment',
                data: { content, type }
            });

            document.getElementById('new-comment').value = '';
        }

        function resolveComment(commentId) {
            vscode.postMessage({
                command: 'resolveComment',
                commentId
            });
        }

        function addReaction(commentId, emoji) {
            vscode.postMessage({
                command: 'addReaction',
                commentId,
                emoji,
                userId: 'current-user' // This would be the actual user ID
            });
        }

        function updateStatus() {
            const status = prompt('Enter new status (active, archived, in-review, completed):');
            if (status && ['active', 'archived', 'in-review', 'completed'].includes(status)) {
                vscode.postMessage({
                    command: 'updateStatus',
                    status
                });
            }
        }

        function updatePriority() {
            const priority = prompt('Enter new priority (low, medium, high, critical):');
            if (priority && ['low', 'medium', 'high', 'critical'].includes(priority)) {
                vscode.postMessage({
                    command: 'updatePriority',
                    priority
                });
            }
        }

        function addWatcher() {
            const userId = prompt('Enter user ID to add as watcher:');
            if (userId) {
                vscode.postMessage({
                    command: 'addWatcher',
                    userId
                });
            }
        }

        function showGitDiff() {
            vscode.postMessage({
                command: 'showGitDiff'
            });
        }

        function refreshGitInfo() {
            vscode.postMessage({
                command: 'refreshGitInfo'
            });
        }

        function createPR() {
            const title = prompt('PR Title:');
            const body = prompt('PR Description:');
            const targetBranch = prompt('Target Branch:', 'main');
            
            if (title && body && targetBranch) {
                vscode.postMessage({
                    command: 'createPR',
                    data: { title, body, targetBranch }
                });
            }
        }

        function exportComments(format) {
            vscode.postMessage({
                command: 'exportComments',
                format
            });
        }
    </script>
</body>
</html>`;
    }

    public dispose()
    {
        CollaborativePanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length)
        {
            const x = this._disposables.pop();
            if (x)
            {
                x.dispose();
            }
        }
    }
}
