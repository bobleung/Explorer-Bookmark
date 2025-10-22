import * as path from 'path';

/**
 * Utility function to validate if a file path is within a workspace
 * This prevents Git operations on files outside the repository
 */
export class PathValidator
{
    /**
     * Check if a file path is within the given workspace root
     * @param workspaceRoot The root directory of the workspace
     * @param filePath The file path to validate
     * @returns true if the file is within the workspace, false otherwise
     */
    static isWithinWorkspace(workspaceRoot: string, filePath: string): boolean
    {
        try
        {
            // Normalize both paths to handle different separators and resolve any '..' or '.' segments
            const normalizedWorkspace = path.resolve(workspaceRoot);
            const normalizedFile = path.resolve(filePath);

            // Get the relative path
            const relativePath = path.relative(normalizedWorkspace, normalizedFile);

            // Debug: Log path validation
            console.log('PathValidator:', {
                file: path.basename(filePath),
                workspace: path.basename(workspaceRoot),
                isWithin: !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
            });

            // If the relative path is empty, the file is exactly the workspace root
            if (relativePath === '') return true;

            // If the relative path starts with '..' it means the file is outside the workspace
            // Also check for absolute paths which would indicate outside workspace
            return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
        }
        catch (error)
        {
            console.error('Error in PathValidator.isWithinWorkspace:', error);
            return false;
        }
    }

    /**
     * Get a user-friendly error message for files outside workspace
     * @param workspaceRoot The root directory of the workspace
     * @param filePath The file path that's outside
     * @returns A formatted error message
     */
    static getOutsideWorkspaceMessage(workspaceRoot: string, filePath: string): string
    {
        return `Error: The selected file is outside the current workspace/repository.

Workspace: ${workspaceRoot}
File: ${filePath}

This file cannot be used with Git features because it's not part of the current repository. Please select a file within the workspace or open the correct workspace folder.`;
    }

    /**
     * Validate a file path for Git operations
     * @param workspaceRoot The root directory of the workspace
     * @param filePath The file path to validate
     * @throws Error if the file is outside the workspace
     */
    static validateForGitOperations(workspaceRoot: string, filePath: string): void
    {
        if (!this.isWithinWorkspace(workspaceRoot, filePath))
        {
            throw new Error(this.getOutsideWorkspaceMessage(workspaceRoot, filePath));
        }
    }
}

// Example usage and test cases
if (require.main === module)
{
    console.log('🔍 Testing PathValidator...');

    const workspaceRoot = 'C:\\Users\\user\\Projects\\my-project';

    // Test cases
    const testCases = [
        {
            file: 'C:\\Users\\user\\Projects\\my-project\\src\\main.ts',
            expected: true,
            description: 'File within workspace'
        },
        {
            file: 'C:\\Users\\user\\Projects\\my-project\\README.md',
            expected: true,
            description: 'File in workspace root'
        },
        {
            file: 'C:\\Users\\user\\Projects\\other-project\\file.ts',
            expected: false,
            description: 'File in different project'
        },
        {
            file: 'C:\\Users\\user\\AppData\\Local\\Programs\\Microsoft VS Code\\settings.json',
            expected: false,
            description: 'VS Code settings file (outside workspace)'
        }
    ];

    testCases.forEach(({ file, expected, description }) =>
    {
        const result = PathValidator.isWithinWorkspace(workspaceRoot, file);
        const status = result === expected ? '✅' : '❌';
        console.log(`${status} ${description}: ${result}`);

        if (!result && !expected)
        {
            console.log(`   Message: ${PathValidator.getOutsideWorkspaceMessage(workspaceRoot, file).split('\n')[0]}`);
        }
    });

    console.log('\n🎯 PathValidator tests completed!');
}