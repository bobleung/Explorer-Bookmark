import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import { GitInfo } from '../types/TypedDirectory';

export interface BranchInfo
{
    name: string;
    current: boolean;
    commit: string;
    remote?: string;
    ahead?: number;
    behind?: number;
}

export interface CommitInfo
{
    hash: string;
    message: string;
    author: string;
    date: Date;
    files: string[];
}

export interface FileHistory
{
    file: string;
    commits: CommitInfo[];
}

export interface StashEntry
{
    index: number;
    message: string;
    branch: string;
    date: Date;
}

export class GitService
{
    private git: SimpleGit;
    private workspaceRoot: string;

    constructor(workspaceRoot: string)
    {
        this.workspaceRoot = workspaceRoot;
        this.git = simpleGit(workspaceRoot);
    }

    // Branch Management
    async getCurrentBranch(): Promise<string>
    {
        try
        {
            const status = await this.git.status();
            return status.current || 'unknown';
        } catch (error)
        {
            console.error('Error getting current branch:', error);
            return 'unknown';
        }
    }

    async getAllBranches(): Promise<BranchInfo[]>
    {
        try
        {
            const branches = await this.git.branch(['-a']);
            const branchInfo: BranchInfo[] = [];

            for (const branch of branches.all)
            {
                const commit = await this.git.revparse([branch]);
                branchInfo.push({
                    name: branch,
                    current: branches.current === branch,
                    commit: commit.trim(),
                    remote: branch.startsWith('remotes/') ? branch : undefined
                });
            }

            return branchInfo;
        } catch (error)
        {
            console.error('Error getting branches:', error);
            return [];
        }
    }

    async createBranch(branchName: string, startPoint?: string): Promise<boolean>
    {
        try
        {
            if (startPoint)
            {
                await this.git.checkoutBranch(branchName, startPoint);
            } else
            {
                await this.git.checkoutLocalBranch(branchName);
            }
            return true;
        } catch (error)
        {
            console.error('Error creating branch:', error);
            return false;
        }
    }

    async switchBranch(branchName: string): Promise<boolean>
    {
        try
        {
            await this.git.checkout(branchName);
            return true;
        } catch (error)
        {
            console.error('Error switching branch:', error);
            return false;
        }
    }

    async deleteBranch(branchName: string, force: boolean = false): Promise<boolean>
    {
        try
        {
            await this.git.deleteLocalBranch(branchName, force);
            return true;
        } catch (error)
        {
            console.error('Error deleting branch:', error);
            return false;
        }
    }

    // File History and Changes
    async getFileHistory(filePath: string, maxCount: number = 20): Promise<FileHistory>
    {
        try
        {
            let relativePath: string;

            if (path.isAbsolute(filePath))
            {
                // Convert absolute to relative
                const normalizedWorkspace = path.resolve(this.workspaceRoot);
                const normalizedFile = path.resolve(filePath);
                relativePath = path.relative(normalizedWorkspace, normalizedFile);

                // Validate path is within workspace
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                }
            }
            else
            {
                // Already relative, use directly
                relativePath = filePath;

                // Basic validation for relative paths
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                }
            }

            const log = await this.git.log(['--max-count=' + maxCount, '--', relativePath]);

            const commits: CommitInfo[] = log.all.map(commit => ({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
                date: new Date(commit.date),
                files: commit.diff?.files?.map(f => f.file) || []
            }));

            return {
                file: relativePath,
                commits
            };
        } catch (error)
        {
            console.error('Error getting file history:', error);
            return { file: filePath, commits: [] };
        }
    }

    async getFileChanges(filePath: string, fromCommit?: string, toCommit?: string): Promise<string>
    {
        try
        {
            let relativePath: string;

            if (path.isAbsolute(filePath))
            {
                // Convert absolute to relative
                const normalizedWorkspace = path.resolve(this.workspaceRoot);
                const normalizedFile = path.resolve(filePath);
                relativePath = path.relative(normalizedWorkspace, normalizedFile);

                // Validate path is within workspace
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                }
            }
            else
            {
                // Already relative, use directly
                relativePath = filePath;

                // Basic validation for relative paths
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                }
            }

            const range = fromCommit && toCommit ? `${fromCommit}..${toCommit}` :
                fromCommit ? `${fromCommit}..HEAD` :
                    'HEAD~1..HEAD';

            const diff = await this.git.diff([range, '--', relativePath]);
            return diff;
        } catch (error)
        {
            console.error('Error getting file changes:', error);
            return '';
        }
    }

    async getUnstagedChanges(filePath?: string): Promise<string>
    {
        try
        {
            const args = ['--no-index', '/dev/null'];
            if (filePath)
            {
                const relativePath = path.relative(this.workspaceRoot, filePath);
                args.push(relativePath);
            }

            const diff = await this.git.diff(args);
            return diff;
        } catch (error)
        {
            console.error('Error getting unstaged changes:', error);
            return '';
        }
    }

    async getStagedChanges(filePath?: string): Promise<string>
    {
        try
        {
            const args = ['--cached'];
            if (filePath)
            {
                const relativePath = path.relative(this.workspaceRoot, filePath);

                // Check if the file is within the workspace/repository
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                }

                args.push('--', relativePath);
            }

            const diff = await this.git.diff(args);
            return diff;
        } catch (error)
        {
            console.error('Error getting staged changes:', error);

            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('outside') || errorMessage.includes('repository')) 
            {
                return `Error: The selected file is outside the current Git repository.\nRepository: ${this.workspaceRoot}\nFile: ${filePath || 'unknown'}`;
            }

            return '';
        }
    }

    async getWorkingDirectoryChanges(filePath?: string): Promise<string>
    {
        try
        {
            const args = [];
            if (filePath)
            {
                let relativePath: string;

                // Check if the input is already a relative path or absolute path
                if (path.isAbsolute(filePath))
                {
                    // It's an absolute path, make it relative to workspace
                    const normalizedWorkspace = path.resolve(this.workspaceRoot);
                    const normalizedFile = path.resolve(filePath);
                    relativePath = path.relative(normalizedWorkspace, normalizedFile);

                    // Debug: Check if path calculation is correct
                    console.log('GitService processing absolute path:', {
                        file: path.basename(filePath),
                        workspace: path.basename(this.workspaceRoot),
                        relativePath: relativePath,
                        isValid: !relativePath.startsWith('..')
                    });

                    // If the relative path starts with .., the file is outside the repository
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                    }
                }
                else
                {
                    // It's already a relative path, use it directly
                    relativePath = filePath;

                    // Debug: Using relative path directly
                    console.log('GitService processing relative path:', {
                        relativePath: relativePath,
                        isValid: !relativePath.startsWith('..')
                    });

                    // Basic check: if it starts with .., it might be trying to go outside
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`Relative path '${filePath}' appears to go outside the repository at '${this.workspaceRoot}'`);
                    }
                }

                // Use the relative path for git operations
                args.push('--', relativePath);
            }

            const diff = await this.git.diff(args);
            return diff;
        } catch (error)
        {
            console.error('Error getting working directory changes:', error);

            // If the file is outside repository, return a meaningful message
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('outside') || errorMessage.includes('repository')) 
            {
                return `Error: The selected file is outside the current Git repository.\nRepository: ${this.workspaceRoot}\nFile: ${filePath || 'unknown'}`;
            }

            return '';
        }
    }

    // Remote Operations
    async compareWithRemote(localBranch?: string, remoteBranch?: string, filePath?: string): Promise<string>
    {
        try
        {
            const current = localBranch || await this.getCurrentBranch();
            const remote = remoteBranch || `origin/${current}`;

            const args = [`${remote}..${current}`];

            if (filePath)
            {
                let relativePath: string;

                if (path.isAbsolute(filePath))
                {
                    // Convert absolute to relative
                    const normalizedWorkspace = path.resolve(this.workspaceRoot);
                    const normalizedFile = path.resolve(filePath);
                    relativePath = path.relative(normalizedWorkspace, normalizedFile);

                    // Validate path is within workspace
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                    }
                }
                else
                {
                    // Already relative, use directly
                    relativePath = filePath;

                    // Basic validation for relative paths
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                    }
                }

                args.push('--', relativePath);
            }

            const diff = await this.git.diff(args);
            return diff;
        } catch (error)
        {
            console.error('Error comparing with remote:', error);
            return '';
        }
    }

    async compareBranches(branch1: string, branch2: string, filePath?: string): Promise<string>
    {
        try
        {
            const args = [`${branch1}..${branch2}`];

            if (filePath)
            {
                let relativePath: string;

                if (path.isAbsolute(filePath))
                {
                    // Convert absolute to relative
                    const normalizedWorkspace = path.resolve(this.workspaceRoot);
                    const normalizedFile = path.resolve(filePath);
                    relativePath = path.relative(normalizedWorkspace, normalizedFile);

                    // Validate path is within workspace
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                    }
                }
                else
                {
                    // Already relative, use directly
                    relativePath = filePath;

                    // Basic validation for relative paths
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                    }
                }

                args.push('--', relativePath);
            }

            const diff = await this.git.diff(args);
            return diff;
        } catch (error)
        {
            console.error('Error comparing branches:', error);
            return '';
        }
    }

    async fetch(): Promise<boolean>
    {
        try
        {
            await this.git.fetch();
            return true;
        } catch (error)
        {
            console.error('Error fetching:', error);
            return false;
        }
    }

    async pull(): Promise<boolean>
    {
        try
        {
            await this.git.pull();
            return true;
        } catch (error)
        {
            console.error('Error pulling:', error);
            return false;
        }
    }

    async rebase(branch: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            await this.git.rebase([branch]);
            return {
                success: true,
                message: `Successfully rebased onto ${branch}`
            };
        } catch (error: any)
        {
            console.error('Error rebasing:', error);

            // Check if it's a conflict
            if (error.message && error.message.includes('conflict'))
            {
                return {
                    success: false,
                    message: `Rebase conflict detected. Please resolve conflicts manually.`
                };
            }

            return {
                success: false,
                message: `Failed to rebase: ${error.message || error}`
            };
        }
    }

    async abortRebase(): Promise<boolean>
    {
        try
        {
            await this.git.rebase(['--abort']);
            return true;
        } catch (error)
        {
            console.error('Error aborting rebase:', error);
            return false;
        }
    }

    async continueRebase(): Promise<boolean>
    {
        try
        {
            await this.git.rebase(['--continue']);
            return true;
        } catch (error)
        {
            console.error('Error continuing rebase:', error);
            return false;
        }
    }

    async push(branch?: string): Promise<boolean>
    {
        try
        {
            if (branch)
            {
                await this.git.push('origin', branch);
            } else
            {
                await this.git.push();
            }
            return true;
        } catch (error)
        {
            console.error('Error pushing:', error);
            return false;
        }
    }

    async stageCommitAndPushFiles(filePaths: string[], commitMessage: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            const relativePaths: string[] = [];

            // Convert all paths to relative and validate
            for (const filePath of filePaths)
            {
                let relativePath: string;

                if (path.isAbsolute(filePath))
                {
                    const normalizedWorkspace = path.resolve(this.workspaceRoot);
                    const normalizedFile = path.resolve(filePath);
                    relativePath = path.relative(normalizedWorkspace, normalizedFile);

                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                    }
                }
                else
                {
                    relativePath = filePath;

                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                    }
                }

                relativePaths.push(relativePath);
            }

            // Check if there are any changes to commit
            const status = await this.git.status();
            const filesToStage: string[] = [];

            for (const relativePath of relativePaths)
            {
                const normalizedPath = relativePath.replace(/\\/g, '/');

                // Check if file has changes (modified, untracked, deleted, etc.)
                const hasChanges = [
                    ...status.modified,
                    ...status.not_added,
                    ...status.deleted,
                    ...status.created,
                    ...status.conflicted
                ].some(file => file === normalizedPath || file === relativePath);

                // Check if already staged
                const isStaged = status.staged.includes(normalizedPath) || status.staged.includes(relativePath);

                if (hasChanges || isStaged)
                {
                    filesToStage.push(relativePath);
                }
            }

            if (filesToStage.length === 0)
            {
                return {
                    success: false,
                    message: 'No changes to commit in the selected files'
                };
            }

            // Stage all files
            await this.git.add(filesToStage);

            // Commit
            await this.git.commit(commitMessage);

            // Push to remote
            await this.git.push();

            return {
                success: true,
                message: `Successfully committed and pushed ${filesToStage.length} file(s)`
            };
        } catch (error: any)
        {
            console.error('Error in stage, commit, and push:', error);
            return {
                success: false,
                message: `Failed to push changes: ${error.message || error}`
            };
        }
    }

    // Stash Operations
    async getStashList(): Promise<StashEntry[]>
    {
        try
        {
            const stashList = await this.git.stashList();
            return stashList.all.map((stash, index) => ({
                index,
                message: stash.message,
                branch: stash.refs || 'unknown',
                date: new Date(stash.date)
            }));
        } catch (error)
        {
            console.error('Error getting stash list:', error);
            return [];
        }
    }

    async stashChanges(message?: string, includeUntracked: boolean = false): Promise<boolean>
    {
        try
        {
            const options = includeUntracked ? ['-u'] : [];
            if (message)
            {
                options.push('-m', message);
            }
            await this.git.stash(options);
            return true;
        } catch (error)
        {
            console.error('Error stashing changes:', error);
            return false;
        }
    }

    async applyStash(stashIndex?: number): Promise<boolean>
    {
        try
        {
            if (stashIndex !== undefined)
            {
                await this.git.stash(['apply', `stash@{${stashIndex}}`]);
            } else
            {
                await this.git.stash(['apply']);
            }
            return true;
        } catch (error)
        {
            console.error('Error applying stash:', error);
            return false;
        }
    }

    async dropStash(stashIndex: number): Promise<boolean>
    {
        try
        {
            await this.git.stash(['drop', `stash@{${stashIndex}}`]);
            return true;
        } catch (error)
        {
            console.error('Error dropping stash:', error);
            return false;
        }
    }

    // Status and Info
    async getGitInfo(filePath?: string): Promise<GitInfo>
    {
        try
        {
            const status = await this.git.status();
            const currentBranch = status.current;
            let lastCommit = '';

            try
            {
                const log = await this.git.log(['--max-count=1']);
                lastCommit = log.latest?.hash || '';
            } catch (logError)
            {
                console.warn('Could not get last commit:', logError);
            }

            const hasLocalChanges = status.files.length > 0;
            let remoteBranch = '';
            let conflictStatus: GitInfo['conflictStatus'] = 'none';

            if (currentBranch)
            {
                try
                {
                    const tracking = await this.git.raw(['rev-parse', '--abbrev-ref', `${currentBranch}@{upstream}`]);
                    remoteBranch = tracking.trim();
                } catch (trackingError)
                {
                    // No upstream branch
                }
            }

            // Check for conflicts
            if (status.conflicted.length > 0)
            {
                conflictStatus = 'conflicts';
            } else if (status.behind > 0 || status.ahead > 0)
            {
                conflictStatus = 'needs-merge';
            }

            return {
                currentBranch: currentBranch || undefined,
                lastCommit,
                hasLocalChanges,
                remoteBranch: remoteBranch || undefined,
                lastSync: new Date(),
                conflictStatus
            };
        } catch (error)
        {
            console.error('Error getting git info:', error);
            return {
                conflictStatus: 'none'
            };
        }
    }

    async isFileTracked(filePath: string): Promise<boolean>
    {
        try
        {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            await this.git.raw(['ls-files', '--error-unmatch', relativePath]);
            return true;
        } catch (error)
        {
            return false;
        }
    }

    async getFileBlame(filePath: string): Promise<string>
    {
        try
        {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            const blame = await this.git.raw(['blame', relativePath]);
            return blame;
        } catch (error)
        {
            console.error('Error getting file blame:', error);
            return '';
        }
    }

    // Utility Methods
    async isGitRepository(): Promise<boolean>
    {
        try
        {
            await this.git.status();
            return true;
        } catch (error)
        {
            return false;
        }
    }

    async getRepositoryRoot(): Promise<string>
    {
        try
        {
            const root = await this.git.revparse(['--show-toplevel']);
            return root.trim();
        } catch (error)
        {
            return this.workspaceRoot;
        }
    }

    async getRemoteUrl(remoteName: string = 'origin'): Promise<string>
    {
        try
        {
            const url = await this.git.getConfig(`remote.${remoteName}.url`);
            return typeof url === 'string' ? url : url?.value || '';
        } catch (error)
        {
            console.error('Error getting remote URL:', error);
            return '';
        }
    }

    // Get current git user name
    async getCurrentGitUser(): Promise<string>
    {
        try
        {
            const userName = await this.git.getConfig('user.name');
            const userValue = typeof userName === 'string' ? userName : userName?.value;

            if (userValue && userValue.trim())
            {
                return userValue.trim();
            }

            // Fallback to email if name is not set
            const userEmail = await this.git.getConfig('user.email');
            const emailValue = typeof userEmail === 'string' ? userEmail : userEmail?.value;

            if (emailValue && emailValue.trim())
            {
                // Extract username from email (part before @)
                const emailUser = emailValue.trim().split('@')[0];
                return emailUser;
            }

            // Final fallback to machine ID
            return vscode.env.machineId.substring(0, 8);
        } catch (error)
        {
            console.error('Error getting git user:', error);
            return vscode.env.machineId.substring(0, 8);
        }
    }

    // Cherry-pick functionality
    async getCommitsFromBranch(branchName: string, filePath?: string, maxCount: number = 20): Promise<CommitInfo[]>
    {
        try
        {
            const args = ['--max-count=' + maxCount, branchName];

            if (filePath)
            {
                let relativePath: string;

                if (path.isAbsolute(filePath))
                {
                    // Convert absolute to relative
                    const normalizedWorkspace = path.resolve(this.workspaceRoot);
                    const normalizedFile = path.resolve(filePath);
                    relativePath = path.relative(normalizedWorkspace, normalizedFile);

                    // Validate path is within workspace
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                    }
                }
                else
                {
                    // Already relative, use directly
                    relativePath = filePath;

                    // Basic validation for relative paths
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                    }
                }

                args.push('--', relativePath);
            }

            const log = await this.git.log(args);

            return log.all.map(commit => ({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
                date: new Date(commit.date),
                files: commit.diff?.files?.map(f => f.file) || []
            }));
        } catch (error)
        {
            console.error('Error getting commits from branch:', error);
            return [];
        }
    }

    async cherryPickCommit(commitHash: string, filePath?: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            if (filePath)
            {
                // Cherry-pick specific file from commit
                let relativePath: string;

                if (path.isAbsolute(filePath))
                {
                    // Convert absolute to relative
                    const normalizedWorkspace = path.resolve(this.workspaceRoot);
                    const normalizedFile = path.resolve(filePath);
                    relativePath = path.relative(normalizedWorkspace, normalizedFile);

                    // Validate path is within workspace
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                    }
                }
                else
                {
                    // Already relative, use directly
                    relativePath = filePath;

                    // Basic validation for relative paths
                    if (relativePath.startsWith('..'))
                    {
                        throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                    }
                }

                // Use git show to get the file content from the specific commit
                const fileContent = await this.git.show([`${commitHash}:${relativePath}`]);

                // Write the content to the file
                const fs = require('fs');
                const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, relativePath);
                fs.writeFileSync(fullPath, fileContent);

                return {
                    success: true,
                    message: `Successfully cherry-picked file '${path.basename(relativePath)}' from commit ${commitHash.substring(0, 8)}`
                };
            }
            else
            {
                // Cherry-pick entire commit
                await this.git.raw(['cherry-pick', commitHash]);

                return {
                    success: true,
                    message: `Successfully cherry-picked commit ${commitHash.substring(0, 8)}`
                };
            }
        } catch (error: any)
        {
            console.error('Error cherry-picking commit:', error);

            // Check if it's a conflict
            if (error.message && error.message.includes('conflict'))
            {
                return {
                    success: false,
                    message: `Cherry-pick conflict detected. Please resolve conflicts manually for commit ${commitHash.substring(0, 8)}`
                };
            }

            return {
                success: false,
                message: `Failed to cherry-pick commit ${commitHash.substring(0, 8)}: ${error.message || error}`
            };
        }
    }

    async cherryPickRange(fromCommit: string, toCommit: string, filePath?: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            if (filePath)
            {
                // For file-specific range, we need to apply each commit individually
                const commits = await this.git.log([`${fromCommit}..${toCommit}`, '--reverse']);
                const results: string[] = [];

                for (const commit of commits.all)
                {
                    const result = await this.cherryPickCommit(commit.hash, filePath);
                    if (result.success)
                    {
                        results.push(`✓ ${commit.hash.substring(0, 8)}: ${commit.message.split('\n')[0]}`);
                    }
                    else
                    {
                        results.push(`✗ ${commit.hash.substring(0, 8)}: ${result.message}`);
                    }
                }

                return {
                    success: true,
                    message: `Cherry-pick range results:\n${results.join('\n')}`
                };
            }
            else
            {
                // Cherry-pick range of commits
                await this.git.raw(['cherry-pick', `${fromCommit}..${toCommit}`]);

                return {
                    success: true,
                    message: `Successfully cherry-picked commit range ${fromCommit.substring(0, 8)}..${toCommit.substring(0, 8)}`
                };
            }
        } catch (error: any)
        {
            console.error('Error cherry-picking range:', error);

            return {
                success: false,
                message: `Failed to cherry-pick range ${fromCommit.substring(0, 8)}..${toCommit.substring(0, 8)}: ${error.message || error}`
            };
        }
    }

    async abortCherryPick(): Promise<boolean>
    {
        try
        {
            await this.git.raw(['cherry-pick', '--abort']);
            return true;
        } catch (error)
        {
            console.error('Error aborting cherry-pick:', error);
            return false;
        }
    }

    async continueCherryPick(): Promise<boolean>
    {
        try
        {
            await this.git.raw(['cherry-pick', '--continue']);
            return true;
        } catch (error)
        {
            console.error('Error continuing cherry-pick:', error);
            return false;
        }
    }

    // Git Add, Commit, and File-Specific Stash operations
    async stageFile(filePath: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            let relativePath: string;

            if (path.isAbsolute(filePath))
            {
                // Convert absolute to relative
                const normalizedWorkspace = path.resolve(this.workspaceRoot);
                const normalizedFile = path.resolve(filePath);
                relativePath = path.relative(normalizedWorkspace, normalizedFile);

                // Validate path is within workspace
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                }
            }
            else
            {
                // Already relative, use directly
                relativePath = filePath;

                // Basic validation for relative paths
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                }
            }

            // Check if file has any changes before staging
            const statusBefore = await this.git.status();
            const normalizedPath = relativePath.replace(/\\/g, '/');

            // Check if file appears in any status array
            const allFilesBefore = [
                ...statusBefore.modified,
                ...statusBefore.not_added,
                ...statusBefore.deleted,
                ...statusBefore.created,
                ...statusBefore.conflicted
            ];

            const hasChanges = allFilesBefore.some(file =>
                file === normalizedPath ||
                file === relativePath
            );

            if (!hasChanges)
            {
                // Check if file is already staged
                if (statusBefore.staged.includes(normalizedPath) || statusBefore.staged.includes(relativePath))
                {
                    return {
                        success: true,
                        message: `'${path.basename(relativePath)}' is already staged`
                    };
                }

                return {
                    success: false,
                    message: `No changes to stage for '${path.basename(relativePath)}'`
                };
            }

            await this.git.add(relativePath);

            return {
                success: true,
                message: `Successfully staged '${path.basename(relativePath)}'`
            };
        } catch (error: any)
        {
            console.error('Error staging file:', error);
            return {
                success: false,
                message: `Failed to stage file: ${error.message || error}`
            };
        }
    }

    async unstageFile(filePath: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            let relativePath: string;

            if (path.isAbsolute(filePath))
            {
                // Convert absolute to relative
                const normalizedWorkspace = path.resolve(this.workspaceRoot);
                const normalizedFile = path.resolve(filePath);
                relativePath = path.relative(normalizedWorkspace, normalizedFile);

                // Validate path is within workspace
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                }
            }
            else
            {
                // Already relative, use directly
                relativePath = filePath;

                // Basic validation for relative paths
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                }
            }

            await this.git.reset(['HEAD', '--', relativePath]);

            return {
                success: true,
                message: `Successfully unstaged '${path.basename(relativePath)}'`
            };
        } catch (error: any)
        {
            console.error('Error unstaging file:', error);
            return {
                success: false,
                message: `Failed to unstage file: ${error.message || error}`
            };
        }
    }

    async commitFile(filePath: string, message: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            let relativePath: string;

            if (path.isAbsolute(filePath))
            {
                // Convert absolute to relative
                const normalizedWorkspace = path.resolve(this.workspaceRoot);
                const normalizedFile = path.resolve(filePath);
                relativePath = path.relative(normalizedWorkspace, normalizedFile);

                // Validate path is within workspace
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                }
            }
            else
            {
                // Already relative, use directly
                relativePath = filePath;

                // Basic validation for relative paths
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                }
            }

            // Stage the file first
            await this.git.add(relativePath);

            // Commit the file
            await this.git.commit(message, [relativePath]);

            return {
                success: true,
                message: `Successfully committed '${path.basename(relativePath)}'`
            };
        } catch (error: any)
        {
            console.error('Error committing file:', error);
            return {
                success: false,
                message: `Failed to commit file: ${error.message || error}`
            };
        }
    }

    async commitStagedChanges(message: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            const status = await this.git.status();

            if (status.staged.length === 0)
            {
                return {
                    success: false,
                    message: 'No staged changes to commit'
                };
            }

            await this.git.commit(message);

            return {
                success: true,
                message: `Successfully committed ${status.staged.length} file(s)`
            };
        } catch (error: any)
        {
            console.error('Error committing staged changes:', error);
            return {
                success: false,
                message: `Failed to commit: ${error.message || error}`
            };
        }
    }

    async stashFile(filePath: string, message?: string): Promise<{ success: boolean, message: string }>
    {
        try
        {
            let relativePath: string;

            if (path.isAbsolute(filePath))
            {
                // Convert absolute to relative
                const normalizedWorkspace = path.resolve(this.workspaceRoot);
                const normalizedFile = path.resolve(filePath);
                relativePath = path.relative(normalizedWorkspace, normalizedFile);

                // Validate path is within workspace
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`File '${filePath}' is outside the repository at '${this.workspaceRoot}'`);
                }
            }
            else
            {
                // Already relative, use directly
                relativePath = filePath;

                // Basic validation for relative paths
                if (relativePath.startsWith('..'))
                {
                    throw new Error(`Relative path '${filePath}' appears to go outside the repository`);
                }
            }

            // Git doesn't have a built-in "stash single file" command
            // Mora hak da se uradi: stage everything else, then stash --keep-index

            // Save current changes
            const currentChanges = await this.git.diff();

            // Stage the specific file
            await this.git.add(relativePath);

            // Stash with --keep-index to keep staged changes (our file)
            const stashMessage = message || `Stashed changes for ${path.basename(relativePath)}`;
            await this.git.stash(['push', '--keep-index', '-m', stashMessage, '--', relativePath]);

            return {
                success: true,
                message: `Successfully stashed '${path.basename(relativePath)}'`
            };
        } catch (error: any)
        {
            console.error('Error stashing file:', error);
            return {
                success: false,
                message: `Failed to stash file: ${error.message || error}`
            };
        }
    }

    async getFileStatus(filePath: string): Promise<{ isModified: boolean, isStaged: boolean, isUntracked: boolean }>
    {
        try
        {
            let relativePath: string;

            if (path.isAbsolute(filePath))
            {
                const normalizedWorkspace = path.resolve(this.workspaceRoot);
                const normalizedFile = path.resolve(filePath);
                relativePath = path.relative(normalizedWorkspace, normalizedFile);
            }
            else
            {
                relativePath = filePath;
            }

            const status = await this.git.status();

            // Normalize path separators for comparison (Windows uses backslashes, git uses forward slashes)
            const normalizedPath = relativePath.replace(/\\/g, '/');

            // Check in various status arrays
            const isModified = status.modified.includes(normalizedPath) ||
                status.modified.includes(relativePath);

            const isStaged = status.staged.includes(normalizedPath) ||
                status.staged.includes(relativePath);

            const isUntracked = status.not_added.includes(normalizedPath) ||
                status.not_added.includes(relativePath);

            // Also check if file appears in any of the status arrays (renamed, deleted, etc.)
            const allFiles = [
                ...status.modified,
                ...status.not_added,
                ...status.deleted,
                ...status.created,
                ...status.renamed.map((r: any) => r.to || r),
                ...status.staged
            ];

            const hasAnyChanges = allFiles.some(file =>
                file === normalizedPath ||
                file === relativePath ||
                (typeof file === 'object' && (file.path === normalizedPath || file.path === relativePath))
            );

            return {
                isModified: isModified || hasAnyChanges,
                isStaged,
                isUntracked
            };
        } catch (error)
        {
            console.error('Error getting file status:', error);
            return { isModified: false, isStaged: false, isUntracked: false };
        }
    }
}
