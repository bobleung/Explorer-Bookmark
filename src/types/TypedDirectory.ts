import * as vscode from "vscode";

export interface Comment
{
  id: string;
  author: string;
  content: string;
  timestamp: Date;
  type: 'general' | 'code-review' | 'suggestion' | 'question';
  resolved?: boolean;
  parentId?: string; // For threaded discussions
  reactions?: { [emoji: string]: string[] }; // emoji -> array of user IDs
  mentions?: string[]; // array of mentioned user IDs
}

export interface GitInfo
{
  currentBranch?: string;
  lastCommit?: string;
  hasLocalChanges?: boolean;
  remoteBranch?: string;
  lastSync?: Date;
  conflictStatus?: 'none' | 'conflicts' | 'needs-merge';
}

export interface PullRequestInfo
{
  id: number;
  title: string;
  url: string;
  status: 'open' | 'closed' | 'merged' | 'draft';
  author: string;
  created: Date;
  updated: Date;
  reviewStatus?: 'pending' | 'approved' | 'changes-requested';
  targetBranch?: string;
  sourceBranch?: string;
}

export class TypedDirectory
{
  path: string;
  type: vscode.FileType;
  comment?: string;
  tags?: string[];
  addedBy?: string;
  dateAdded?: Date;
  aiSummary?: string;
  lastSummaryUpdate?: Date;

  // Collaborative Features
  comments: Comment[];
  watchers: string[]; // Array of user IDs watching this item
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'archived' | 'in-review' | 'completed';

  // Git Integration
  gitInfo?: GitInfo;
  relatedPRs: PullRequestInfo[];

  // Analytics
  lastAccessed?: Date;
  accessCount: number;

  constructor(
    path: string,
    type: vscode.FileType,
    comment?: string,
    tags?: string[],
    addedBy?: string,
    dateAdded?: Date,
    aiSummary?: string,
    lastSummaryUpdate?: Date,
    // Collaborative Features
    comments?: Comment[],
    watchers?: string[],
    priority?: 'low' | 'medium' | 'high' | 'critical',
    status?: 'active' | 'archived' | 'in-review' | 'completed',
    // Git Integration
    gitInfo?: GitInfo,
    relatedPRs?: PullRequestInfo[],
    // Analytics
    lastAccessed?: Date,
    accessCount?: number
  )
  {
    this.path = path;
    this.type = type;
    this.comment = comment;
    this.tags = tags || [];
    this.addedBy = addedBy;
    this.dateAdded = dateAdded || new Date();
    this.aiSummary = aiSummary;
    this.lastSummaryUpdate = lastSummaryUpdate;

    // Initialize collaborative features
    this.comments = comments || [];
    this.watchers = watchers || [];
    this.priority = priority || 'medium';
    this.status = status || 'active';

    // Initialize git integration
    this.gitInfo = gitInfo;
    this.relatedPRs = relatedPRs || [];

    // Initialize analytics
    this.lastAccessed = lastAccessed;
    this.accessCount = accessCount || 0;
  }

  updateAISummary(summary: string): void
  {
    this.aiSummary = summary;
    this.lastSummaryUpdate = new Date();
  }

  addTag(tag: string): void
  {
    if (!this.tags) this.tags = [];
    if (!this.tags.includes(tag))
    {
      this.tags.push(tag);
    }
  }

  removeTag(tag: string): void
  {
    if (this.tags)
    {
      this.tags = this.tags.filter(t => t !== tag);
    }
  }

  // Comment Management
  addComment(author: string, content: string, type: Comment['type'] = 'general', parentId?: string): Comment
  {
    const comment: Comment = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      author,
      content,
      timestamp: new Date(),
      type,
      parentId,
      reactions: {},
      mentions: this.extractMentions(content)
    };

    this.comments.push(comment);
    return comment;
  }

  resolveComment(commentId: string): void
  {
    const comment = this.comments.find(c => c.id === commentId);
    if (comment)
    {
      comment.resolved = true;
    }
  }

  addReaction(commentId: string, emoji: string, userId: string): void
  {
    const comment = this.comments.find(c => c.id === commentId);
    if (comment)
    {
      if (!comment.reactions) comment.reactions = {};
      if (!comment.reactions[emoji]) comment.reactions[emoji] = [];
      if (!comment.reactions[emoji].includes(userId))
      {
        comment.reactions[emoji].push(userId);
      }
    }
  }

  // Watcher Management
  addWatcher(userId: string): void
  {
    if (!this.watchers.includes(userId))
    {
      this.watchers.push(userId);
    }
  }

  removeWatcher(userId: string): void
  {
    this.watchers = this.watchers.filter(w => w !== userId);
  }

  // Status Management
  updateStatus(newStatus: TypedDirectory['status'], updatedBy: string): void
  {
    const oldStatus = this.status;
    this.status = newStatus;
  }

  updatePriority(newPriority: TypedDirectory['priority'], updatedBy: string): void
  {
    const oldPriority = this.priority;
    this.priority = newPriority;
  }

  // Git Integration
  updateGitInfo(gitInfo: GitInfo): void
  {
    const oldInfo = this.gitInfo;
    this.gitInfo = gitInfo;
  }

  addRelatedPR(prInfo: PullRequestInfo): void
  {
    const exists = this.relatedPRs.find(pr => pr.id === prInfo.id);
    if (!exists)
    {
      this.relatedPRs.push(prInfo);
    }
  }

  updatePRStatus(prId: number, newStatus: PullRequestInfo['status']): void
  {
    const pr = this.relatedPRs.find(p => p.id === prId);
    if (pr)
    {
      pr.status = newStatus;
      pr.updated = new Date();
    }
  }

  recordAccess(): void
  {
    this.lastAccessed = new Date();
    this.accessCount++;
  }

  // Utility Methods
  private extractMentions(content: string): string[]
  {
    const mentionPattern = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionPattern.exec(content)) !== null)
    {
      mentions.push(match[1]);
    }
    return mentions;
  }

  getUnresolvedComments(): Comment[]
  {
    return this.comments.filter(c => !c.resolved);
  }

  getCommentsByType(type: Comment['type']): Comment[]
  {
    return this.comments.filter(c => c.type === type);
  }

  isWatchedBy(userId: string): boolean
  {
    return this.watchers.includes(userId);
  }

  hasUnresolvedComments(): boolean
  {
    return this.getUnresolvedComments().length > 0;
  }

  needsAttention(): boolean
  {
    return this.priority === 'high' || this.priority === 'critical' ||
      this.hasUnresolvedComments() ||
      this.gitInfo?.conflictStatus === 'conflicts';
  }
}

export async function buildTypedDirectory(uri: vscode.Uri, comment?: string, tags?: string[], userName?: string)
{
  const type = (await vscode.workspace.fs.stat(uri)).type;

  let username = userName;
  if (!username)
  {
    // Get git username if not provided
    try
    {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0)
      {
        const { GitService } = await import('../services/GitService');
        const gitService = new GitService(workspaceFolders[0].uri.fsPath);
        username = await gitService.getCurrentGitUser();
      } else
      {
        username = vscode.env.machineId.substring(0, 8);
      }
    } catch (error)
    {
      console.error('Error getting git user in buildTypedDirectory:', error);
      username = vscode.env.machineId.substring(0, 8);
    }
  }

  return new TypedDirectory(uri.fsPath, type, comment, tags, username);
}

