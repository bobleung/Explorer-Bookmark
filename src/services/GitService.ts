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
            const relativePath = path.relative(this.workspaceRoot, filePath);
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
            const relativePath = path.relative(this.workspaceRoot, filePath);
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
                args.push('--', relativePath);
            }

            const diff = await this.git.diff(args);
            return diff;
        } catch (error)
        {
            console.error('Error getting staged changes:', error);
            return '';
        }
    }

    // Remote Operations
    async compareWithRemote(localBranch?: string, remoteBranch?: string): Promise<string>
    {
        try
        {
            const current = localBranch || await this.getCurrentBranch();
            const remote = remoteBranch || `origin/${current}`;

            const diff = await this.git.diff([`${remote}..${current}`]);
            return diff;
        } catch (error)
        {
            console.error('Error comparing with remote:', error);
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
}
