import * as vscode from 'vscode';
import { PullRequestInfo } from '../types/TypedDirectory';

interface RequestOptions
{
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface GitHubRepository
{
    owner: string;
    name: string;
    fullName: string;
    url: string;
    defaultBranch: string;
}

export interface GitHubUser
{
    login: string;
    name: string;
    email: string;
    avatarUrl: string;
}

export interface PRReview
{
    id: number;
    user: string;
    state: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
    body: string;
    submittedAt: Date;
}

// github api pozivi
export class GitHubService
{
    private token: string | undefined;
    private baseUrl = 'https://api.github.com';

    constructor()
    {
        this.token = this.getGitHubToken();
    }

    private getGitHubToken(): string | undefined
    {
        const config = vscode.workspace.getConfiguration('folderHub');
        let token = config.get<string>('githubToken');

        if (!token)
        {
            token = process.env.GITHUB_TOKEN;
        }

        return token;
    }

    private async makeRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T>
    {
        if (!this.token)
        {
            throw new Error('GitHub token not configured. Please set folderHub.githubToken in settings.');
        }

        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        // use VS Code's built-in HTTP client or a simple implementation
        try
        {
            const https = require('https');
            const urlParse = require('url');

            return new Promise((resolve, reject) =>
            {
                const parsedUrl = urlParse.parse(url);
                const requestOptions = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || 443,
                    path: parsedUrl.path,
                    method: options.method || 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'VSCode-FolderHub-Extension',
                        ...options.headers
                    }
                };

                const req = https.request(requestOptions, (res: any) =>
                {
                    let data = '';
                    res.on('data', (chunk: any) => data += chunk);
                    res.on('end', () =>
                    {
                        try
                        {
                            if (res.statusCode >= 200 && res.statusCode < 300)
                            {
                                resolve(JSON.parse(data));
                            } else
                            {
                                reject(new Error(`GitHub API error: ${res.statusCode} ${res.statusMessage}`));
                            }
                        } catch (error)
                        {
                            reject(error);
                        }
                    });
                });

                req.on('error', reject);

                if (options.body)
                {
                    req.write(options.body);
                }

                req.end();
            });
        } catch (error)
        {
            throw new Error(`HTTP request failed: ${error}`);
        }
    }

    // Repository Information
    async getRepositoryInfo(owner: string, repo: string): Promise<GitHubRepository>
    {
        const data = await this.makeRequest<any>(`/repos/${owner}/${repo}`);

        return {
            owner: data.owner.login,
            name: data.name,
            fullName: data.full_name,
            url: data.html_url,
            defaultBranch: data.default_branch
        };
    }

    async getRepositoryFromRemote(remoteUrl: string): Promise<GitHubRepository | null>
    {
        // Parse GitHub URL to extract owner/repo
        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
        if (!match) return null;

        const [, owner, repo] = match;
        try
        {
            return await this.getRepositoryInfo(owner, repo);
        } catch (error)
        {
            console.error('Error getting repository info:', error);
            return null;
        }
    }

    // Pull Request Operations
    async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequestInfo[]>
    {
        const data = await this.makeRequest<any[]>(`/repos/${owner}/${repo}/pulls?state=${state}`);

        return data.map(pr => ({
            id: pr.number,
            title: pr.title,
            url: pr.html_url,
            status: pr.state === 'open' ? (pr.draft ? 'draft' : 'open') :
                pr.merged_at ? 'merged' : 'closed',
            author: pr.user.login,
            created: new Date(pr.created_at),
            updated: new Date(pr.updated_at),
            targetBranch: pr.base.ref,
            sourceBranch: pr.head.ref
        }));
    }

    async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestInfo | null>
    {
        try
        {
            const data = await this.makeRequest<any>(`/repos/${owner}/${repo}/pulls/${prNumber}`);

            return {
                id: data.number,
                title: data.title,
                url: data.html_url,
                status: data.state === 'open' ? (data.draft ? 'draft' : 'open') :
                    data.merged_at ? 'merged' : 'closed',
                author: data.user.login,
                created: new Date(data.created_at),
                updated: new Date(data.updated_at),
                targetBranch: data.base.ref,
                sourceBranch: data.head.ref
            };
        } catch (error)
        {
            console.error('Error getting pull request:', error);
            return null;
        }
    }

    async getPRsForBranch(owner: string, repo: string, branch: string): Promise<PullRequestInfo[]>
    {
        const data = await this.makeRequest<any[]>(`/repos/${owner}/${repo}/pulls?head=${owner}:${branch}`);

        return data.map(pr => ({
            id: pr.number,
            title: pr.title,
            url: pr.html_url,
            status: pr.state === 'open' ? (pr.draft ? 'draft' : 'open') :
                pr.merged_at ? 'merged' : 'closed',
            author: pr.user.login,
            created: new Date(pr.created_at),
            updated: new Date(pr.updated_at),
            targetBranch: pr.base.ref,
            sourceBranch: pr.head.ref
        }));
    }

    async createPullRequest(
        owner: string,
        repo: string,
        title: string,
        body: string,
        head: string,
        base: string,
        draft: boolean = false
    ): Promise<PullRequestInfo | null>
    {
        try
        {
            const data = await this.makeRequest<any>(`/repos/${owner}/${repo}/pulls`, {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    body,
                    head,
                    base,
                    draft
                })
            });

            return {
                id: data.number,
                title: data.title,
                url: data.html_url,
                status: data.draft ? 'draft' : 'open',
                author: data.user.login,
                created: new Date(data.created_at),
                updated: new Date(data.updated_at),
                targetBranch: data.base.ref,
                sourceBranch: data.head.ref
            };
        } catch (error)
        {
            console.error('Error creating pull request:', error);
            return null;
        }
    }

    // Pull Request Reviews
    async getPRReviews(owner: string, repo: string, prNumber: number): Promise<PRReview[]>
    {
        const data = await this.makeRequest<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`);

        return data.map(review => ({
            id: review.id,
            user: review.user.login,
            state: review.state,
            body: review.body,
            submittedAt: new Date(review.submitted_at)
        }));
    }

    // User and Team Information
    async getCurrentUser(): Promise<GitHubUser | null>
    {
        try
        {
            const data = await this.makeRequest<any>('/user');

            return {
                login: data.login,
                name: data.name,
                email: data.email,
                avatarUrl: data.avatar_url
            };
        } catch (error)
        {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    async getUser(username: string): Promise<GitHubUser | null>
    {
        try
        {
            const data = await this.makeRequest<any>(`/users/${username}`);

            return {
                login: data.login,
                name: data.name,
                email: data.email,
                avatarUrl: data.avatar_url
            };
        } catch (error)
        {
            console.error('Error getting user:', error);
            return null;
        }
    }

    async getRepositoryCollaborators(owner: string, repo: string): Promise<GitHubUser[]>
    {
        try
        {
            const data = await this.makeRequest<any[]>(`/repos/${owner}/${repo}/collaborators`);

            return data.map(user => ({
                login: user.login,
                name: user.name || user.login,
                email: user.email || '',
                avatarUrl: user.avatar_url
            }));
        } catch (error)
        {
            console.error('Error getting collaborators:', error);
            return [];
        }
    }

    // Utility Methods
    async testConnection(): Promise<boolean>
    {
        try
        {
            await this.getCurrentUser();
            return true;
        } catch (error)
        {
            console.error('GitHub connection test failed:', error);
            return false;
        }
    }

    isConfigured(): boolean
    {
        return !!this.token;
    }

    async setupToken(): Promise<void>
    {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your GitHub Personal Access Token',
            password: true,
            placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx'
        });

        if (token)
        {
            const config = vscode.workspace.getConfiguration('folderHub');
            await config.update('githubToken', token, vscode.ConfigurationTarget.Global);
            this.token = token;

            vscode.window.showInformationMessage('GitHub token configured successfully!');
        }
    }
}
