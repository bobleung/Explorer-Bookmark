import * as vscode from 'vscode';
import { Comment, TypedDirectory } from '../types/TypedDirectory';

export interface CommentThread
{
    rootComment: Comment;
    replies: Comment[];
    participants: string[];
    isResolved: boolean;
    lastActivity: Date;
}

export interface CommentNotification
{
    id: string;
    type: 'mention' | 'reply' | 'resolve' | 'reaction';
    fromUser: string;
    toUser: string;
    commentId: string;
    itemPath: string;
    message: string;
    timestamp: Date;
    read: boolean;
}

export interface CommentFilter
{
    author?: string;
    type?: Comment['type'];
    resolved?: boolean;
    mentions?: string;
    dateRange?: { start: Date; end: Date };
}

export class CommentService
{
    private notifications: CommentNotification[] = [];
    private readonly MAX_NOTIFICATIONS = 100;

    constructor() { }

    // Comment Thread Management
    getCommentThreads(item: TypedDirectory): CommentThread[]
    {
        const threads: CommentThread[] = [];
        const processedComments = new Set<string>();

        // Find root comments (those without parentId)
        const rootComments = item.comments.filter(c => !c.parentId);

        for (const rootComment of rootComments)
        {
            if (processedComments.has(rootComment.id)) continue;

            const replies = this.getRepliesForComment(item, rootComment.id);
            const participants = this.getThreadParticipants(rootComment, replies);
            const isResolved = rootComment.resolved || false;
            const lastActivity = this.getLastActivityTime(rootComment, replies);

            threads.push({
                rootComment,
                replies,
                participants,
                isResolved,
                lastActivity
            });

            processedComments.add(rootComment.id);
            replies.forEach(reply => processedComments.add(reply.id));
        }

        return threads.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    }

    private getRepliesForComment(item: TypedDirectory, commentId: string): Comment[]
    {
        const replies: Comment[] = [];
        const directReplies = item.comments.filter(c => c.parentId === commentId);

        for (const reply of directReplies)
        {
            replies.push(reply);
            // Recursively get nested replies
            replies.push(...this.getRepliesForComment(item, reply.id));
        }

        return replies.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    private getThreadParticipants(rootComment: Comment, replies: Comment[]): string[]
    {
        const participants = new Set<string>();
        participants.add(rootComment.author);

        replies.forEach(reply => participants.add(reply.author));

        return Array.from(participants);
    }

    private getLastActivityTime(rootComment: Comment, replies: Comment[]): Date
    {
        let lastTime = rootComment.timestamp;

        replies.forEach(reply =>
        {
            if (reply.timestamp > lastTime)
            {
                lastTime = reply.timestamp;
            }
        });

        return lastTime;
    }

    // Comment Filtering and Search
    filterComments(item: TypedDirectory, filter: CommentFilter): Comment[]
    {
        let comments = [...item.comments];

        if (filter.author)
        {
            comments = comments.filter(c => c.author.toLowerCase().includes(filter.author!.toLowerCase()));
        }

        if (filter.type)
        {
            comments = comments.filter(c => c.type === filter.type);
        }

        if (filter.resolved !== undefined)
        {
            comments = comments.filter(c => (c.resolved || false) === filter.resolved);
        }

        if (filter.mentions)
        {
            const mentionsLower = filter.mentions.toLowerCase();
            comments = comments.filter(c =>
                c.mentions?.some(mention => mention.toLowerCase().includes(mentionsLower)) ||
                c.content.toLowerCase().includes(`@${mentionsLower}`)
            );
        }

        if (filter.dateRange)
        {
            comments = comments.filter(c =>
                c.timestamp >= filter.dateRange!.start &&
                c.timestamp <= filter.dateRange!.end
            );
        }

        return comments;
    }

    searchComments(item: TypedDirectory, searchTerm: string): Comment[]
    {
        const term = searchTerm.toLowerCase();
        return item.comments.filter(comment =>
            comment.content.toLowerCase().includes(term) ||
            comment.author.toLowerCase().includes(term)
        );
    }

    // Comment Analytics
    getCommentStats(item: TypedDirectory):
        {
            total: number;
            byType: Record<Comment['type'], number>;
            byAuthor: Record<string, number>;
            resolved: number;
            unresolved: number;
            withReactions: number;
            threads: number;
        }
    {
        const stats = {
            total: item.comments.length,
            byType: {} as Record<Comment['type'], number>,
            byAuthor: {} as Record<string, number>,
            resolved: 0,
            unresolved: 0,
            withReactions: 0,
            threads: 0
        };

        // Initialize type counts
        const types: Comment['type'][] = ['general', 'code-review', 'suggestion', 'question'];
        types.forEach(type => stats.byType[type] = 0);

        item.comments.forEach(comment =>
        {
            // Count by type
            stats.byType[comment.type]++;

            // Count by author
            if (!stats.byAuthor[comment.author])
            {
                stats.byAuthor[comment.author] = 0;
            }
            stats.byAuthor[comment.author]++;

            // Count resolved/unresolved
            if (comment.resolved)
            {
                stats.resolved++;
            } else
            {
                stats.unresolved++;
            }

            // Count with reactions
            if (comment.reactions && Object.keys(comment.reactions).length > 0)
            {
                stats.withReactions++;
            }
        });

        // Count threads (root comments without parentId)
        stats.threads = item.comments.filter(c => !c.parentId).length;

        return stats;
    }

    // Notification Management
    addNotification(notification: Omit<CommentNotification, 'id' | 'timestamp' | 'read'>): void
    {
        const newNotification: CommentNotification = {
            ...notification,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            read: false
        };

        this.notifications.unshift(newNotification);

        // Keep only recent notifications
        if (this.notifications.length > this.MAX_NOTIFICATIONS)
        {
            this.notifications = this.notifications.slice(0, this.MAX_NOTIFICATIONS);
        }

        // Show VS Code notification for mentions
        if (notification.type === 'mention')
        {
            vscode.window.showInformationMessage(
                `You were mentioned by ${notification.fromUser}: ${notification.message}`,
                'View Comment'
            ).then(selection =>
            {
                if (selection === 'View Comment')
                {
                    // Navigate to the comment (this would be implemented in the main extension)
                    vscode.commands.executeCommand('folderHub.showComment', {
                        itemPath: notification.itemPath,
                        commentId: notification.commentId
                    });
                }
            });
        }
    }

    getNotifications(userId: string, unreadOnly: boolean = false): CommentNotification[]
    {
        let notifications = this.notifications.filter(n => n.toUser === userId);

        if (unreadOnly)
        {
            notifications = notifications.filter(n => !n.read);
        }

        return notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    markNotificationAsRead(notificationId: string): void
    {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification)
        {
            notification.read = true;
        }
    }

    markAllNotificationsAsRead(userId: string): void
    {
        this.notifications
            .filter(n => n.toUser === userId)
            .forEach(n => n.read = true);
    }

    getUnreadCount(userId: string): number
    {
        return this.notifications.filter(n => n.toUser === userId && !n.read).length;
    }

    // Comment Validation and Processing
    validateComment(content: string): { isValid: boolean; errors: string[] }
    {
        const errors: string[] = [];

        if (!content || content.trim().length === 0)
        {
            errors.push('Comment content cannot be empty');
        }

        if (content.length > 10000)
        {
            errors.push('Comment is too long (maximum 10,000 characters)');
        }

        // Check for potential issues
        if (content.includes('<script>'))
        {
            errors.push('Comments cannot contain script tags');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    processCommentContent(content: string):
        {
            processedContent: string;
            mentions: string[];
            links: string[];
        }
    {
        let processedContent = content;

        // Extract mentions
        const mentionPattern = /@(\w+)/g;
        const mentions: string[] = [];
        let match;
        while ((match = mentionPattern.exec(content)) !== null)
        {
            mentions.push(match[1]);
        }

        // Extract links
        const linkPattern = /https?:\/\/[^\s]+/g;
        const links: string[] = [];
        let linkMatch;
        while ((linkMatch = linkPattern.exec(content)) !== null)
        {
            links.push(linkMatch[0]);
        }

        // Process markdown-like formatting
        processedContent = processedContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold**
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // *italic*
            .replace(/`(.*?)`/g, '<code>$1</code>'); // `code`

        return {
            processedContent,
            mentions,
            links
        };
    }

    // Helper Methods for UI
    formatCommentForDisplay(comment: Comment):
        {
            formattedContent: string;
            timeAgo: string;
            isEdited: boolean;
        }
    {
        const processed = this.processCommentContent(comment.content);
        const timeAgo = this.getTimeAgo(comment.timestamp);

        return {
            formattedContent: processed.processedContent,
            timeAgo,
            isEdited: false // Could be extended to track edits
        };
    }

    private getTimeAgo(date: Date): string
    {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 30) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    }

    // Bulk Operations
    resolveAllComments(item: TypedDirectory, author?: string): number
    {
        let resolvedCount = 0;

        item.comments.forEach(comment =>
        {
            if (!comment.resolved && (!author || comment.author === author))
            {
                comment.resolved = true;
                resolvedCount++;
            }
        });

        return resolvedCount;
    }

    deleteCommentsByAuthor(item: TypedDirectory, author: string): number
    {
        const initialCount = item.comments.length;
        item.comments = item.comments.filter(c => c.author !== author);
        const deletedCount = initialCount - item.comments.length;

        return deletedCount;
    }

    exportComments(item: TypedDirectory, format: 'json' | 'csv' | 'markdown' = 'json'): string
    {
        switch (format)
        {
            case 'json':
                return JSON.stringify(item.comments, null, 2);

            case 'csv':
                const headers = 'Author,Type,Content,Timestamp,Resolved,Reactions\n';
                const rows = item.comments.map(c =>
                    `"${c.author}","${c.type}","${c.content.replace(/"/g, '""')}","${c.timestamp.toISOString()}","${c.resolved || false}","${Object.keys(c.reactions || {}).length}"`
                ).join('\n');
                return headers + rows;

            case 'markdown':
                return item.comments.map(c =>
                {
                    const resolved = c.resolved ? ' ✅' : '';
                    const reactions = c.reactions ? Object.keys(c.reactions).join(' ') : '';
                    return `## ${c.type.toUpperCase()} by ${c.author}${resolved}\n\n${c.content}\n\n*${c.timestamp.toLocaleString()}* ${reactions}\n\n---\n`;
                }).join('\n');

            default:
                return JSON.stringify(item.comments, null, 2);
        }
    }
}
