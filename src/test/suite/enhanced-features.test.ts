import * as assert from 'assert';
import * as vscode from 'vscode';
import { DirectoryWorker } from '../../operator/DirectoryWorker';
import { TypedDirectory } from '../../types/TypedDirectory';
import { BookmarkSection } from '../../types/BookmarkSection';

suite('Explorer Bookmark Enhanced Features Test Suite', () =>
{
    vscode.window.showInformationMessage('Starting Enhanced Explorer Bookmark tests...');

    test('TypedDirectory - Collaborative Features', async () =>
    {
        // Test collaborative features
        const testDir = new TypedDirectory(
            'test/file.ts',
            vscode.FileType.File,
            'Test comment',
            ['test', 'important'],
            'testUser'
        );

        // Test comment functionality
        assert.strictEqual(testDir.comment, 'Test comment');

        // Test tag functionality
        testDir.addTag('new-tag');
        assert.ok(testDir.tags?.includes('new-tag'));

        // Test watcher functionality
        testDir.addWatcher('user1');
        testDir.addWatcher('user2');
        assert.strictEqual(testDir.watchers.length, 2);
        assert.ok(testDir.isWatchedBy('user1'));

        // Test status and priority
        testDir.updateStatus('in-review', 'testUser');
        testDir.updatePriority('high', 'testUser');
        assert.strictEqual(testDir.status, 'in-review');
        assert.strictEqual(testDir.priority, 'high');

        // Test AI summary
        testDir.updateAISummary('This is a test file for TypeScript functionality');
        assert.ok(testDir.aiSummary);
        assert.ok(testDir.lastSummaryUpdate);

        console.log('✅ TypedDirectory collaborative features working correctly');
    });

    test('BookmarkSection - Section Management', () =>
    {
        // Test section creation
        const section = new BookmarkSection('test-id', 'Test Section');
        assert.strictEqual(section.name, 'Test Section');
        assert.strictEqual(section.id, 'test-id');

        // Test directory management
        const testDir = new TypedDirectory('test/path', vscode.FileType.File);
        section.addDirectory(testDir);
        assert.strictEqual(section.directories.length, 1);

        section.removeDirectory('test/path');
        assert.strictEqual(section.directories.length, 0);

        console.log('✅ BookmarkSection management working correctly');
    });

    test('Enhanced Visual Indicators', () =>
    {
        // Test that TypedDirectory provides all necessary data for visual indicators
        const testDir = new TypedDirectory(
            'src/important.ts',
            vscode.FileType.File,
            'Critical authentication logic',
            ['auth', 'security', 'critical'],
            'developer1'
        );

        // Set up collaborative features
        testDir.updatePriority('critical', 'developer1');
        testDir.updateStatus('in-review', 'developer1');
        testDir.addWatcher('reviewer1');
        testDir.addWatcher('reviewer2');
        testDir.updateAISummary('Complex authentication module handling user sessions');

        // Simulate Git info
        testDir.updateGitInfo({
            currentBranch: 'feature/auth-improvements',
            hasLocalChanges: true,
            conflictStatus: 'none'
        });

        // Test that all indicator data is available
        assert.strictEqual(testDir.priority, 'critical');
        assert.strictEqual(testDir.status, 'in-review');
        assert.strictEqual(testDir.watchers.length, 2);
        assert.ok(testDir.aiSummary);
        assert.ok(testDir.tags && testDir.tags.length > 0);
        assert.ok(testDir.gitInfo?.hasLocalChanges);

        console.log('✅ Enhanced visual indicators data available');
    });

    test('Integration Architecture', () =>
    {
        // Test that the main services can be instantiated
        // This validates the architecture described in the specification

        try
        {
            // These should not throw if properly structured
            const { GitService } = require('../../services/GitService');
            const { GitHubService } = require('../../services/GitHubService');
            const { AIService } = require('../../services/AIService');
            const { TeamBookmarkService } = require('../../services/TeamBookmarkService');
            const { CommentService } = require('../../services/CommentService');

            assert.ok(GitService, 'GitService should be available');
            assert.ok(GitHubService, 'GitHubService should be available');
            assert.ok(AIService, 'AIService should be available');
            assert.ok(TeamBookmarkService, 'TeamBookmarkService should be available');
            assert.ok(CommentService, 'CommentService should be available');

            console.log('✅ Service architecture properly structured');
        } catch (error)
        {
            assert.fail(`Service architecture test failed: ${error}`);
        }
    });

    test('Specification Compliance', () =>
    {
        // Verify that key features from the specification are implemented

        // Check TypedDirectory has all required collaborative features
        const testDir = new TypedDirectory('test.ts', vscode.FileType.File);

        // Collaborative features from specification
        assert.ok('comments' in testDir, 'Comments system should be available');
        assert.ok('watchers' in testDir, 'Watchers system should be available');
        assert.ok('priority' in testDir, 'Priority system should be available');
        assert.ok('status' in testDir, 'Status system should be available');

        // Git integration features
        assert.ok('gitInfo' in testDir, 'Git integration should be available');
        assert.ok('relatedPRs' in testDir, 'PR integration should be available');

        // AI features
        assert.ok('aiSummary' in testDir, 'AI summary should be available');
        assert.ok('updateAISummary' in testDir, 'AI summary updates should be available');

        console.log('✅ Specification requirements implemented');
    });
});