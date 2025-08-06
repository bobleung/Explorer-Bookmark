import * as vscode from "vscode";
import * as path from "path";

export class AIService
{
    private static readonly MAX_FILE_SIZE = 100000; // 100KB limit for analysis
    private static readonly SUPPORTED_EXTENSIONS = [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.h',
        '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.dart', '.scala', '.sh',
        '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.scss',
        '.sql', '.r', '.m', '.pl', '.lua', '.vim', '.dockerfile', '.gitignore'
    ];

    public static async generateFileSummary(uri: vscode.Uri): Promise<string>
    {
        try
        {
            // Check if file type is supported
            const ext = path.extname(uri.fsPath).toLowerCase();
            if (!this.SUPPORTED_EXTENSIONS.includes(ext))
            {
                return "File type not supported for AI analysis.";
            }

            // Check file size
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.size > this.MAX_FILE_SIZE)
            {
                return "File too large for AI analysis (>100KB).";
            }

            // Read file content
            const content = await vscode.workspace.fs.readFile(uri);
            const textContent = Buffer.from(content).toString('utf8');

            // Use GitHub Copilot to generate the summary
            return await this.generateCopilotSummary(textContent, path.basename(uri.fsPath), ext);
        } catch (error)
        {
            console.error('Error generating AI summary:', error);
            return "Error generating summary. File may not be accessible or GitHub Copilot may be unavailable.";
        }
    }

    private static async generateCopilotSummary(content: string, filename: string, extension: string): Promise<string>
    {
        try
        {
            // Create a prompt for GitHub Copilot to analyze the file
            const prompt = this.createAnalysisPrompt(content, filename, extension);

            // Use VS Code's GitHub Copilot API to get the summary
            const copilotResponse = await this.invokeCopilotAPI(prompt);

            if (copilotResponse)
            {
                return this.formatCopilotResponse(copilotResponse, filename);
            } else
            {
                // Alternative: Open interactive Copilot session
                const useInteractive = await vscode.window.showInformationMessage(
                    'GitHub Copilot API not directly accessible. Would you like to generate the summary interactively?',
                    'Yes, Open Copilot Chat', 'Use Basic Analysis'
                );

                if (useInteractive === 'Yes, Open Copilot Chat')
                {
                    return await this.generateInteractiveSummary(content, filename, extension, prompt);
                } else
                {
                    // Fallback to basic analysis
                    return this.generateFallbackSummary(content, filename, extension);
                }
            }
        } catch (error)
        {
            console.error('Error invoking GitHub Copilot:', error);
            return this.generateFallbackSummary(content, filename, extension);
        }
    }

    private static async generateInteractiveSummary(content: string, filename: string, extension: string, prompt: string): Promise<string>
    {
        try
        {
            // Create a temporary document with the analysis prompt
            const promptDoc = await vscode.workspace.openTextDocument({
                content: prompt,
                language: 'markdown'
            });

            // Show the document
            const editor = await vscode.window.showTextDocument(promptDoc);

            // Try to open Copilot Chat
            try
            {
                await vscode.commands.executeCommand('github.copilot.interactiveEditor.explain');
            } catch
            {
                try
                {
                    await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
                } catch
                {
                    vscode.window.showInformationMessage(
                        'Please use the Copilot Chat panel to analyze the file. The prompt has been opened in a new document.'
                    );
                }
            }

            // Return instructions for the user
            return `# 🤖 AI Summary for ${filename}

*To generate a comprehensive AI summary:*

1. **Copy the analysis prompt** from the document that was just opened
2. **Open GitHub Copilot Chat** (Ctrl+Shift+P → "GitHub Copilot: Focus on Copilot Chat")
3. **Paste and send** the prompt to get an intelligent analysis
4. **Copy the response** back here if you want to save it with the bookmark

## Quick Manual Analysis

${this.generateFallbackSummary(content, filename, extension)}

---

*For the best AI-powered analysis, please follow the steps above to use GitHub Copilot Chat.*`;

        } catch (error)
        {
            console.error('Error creating interactive session:', error);
            return this.generateFallbackSummary(content, filename, extension);
        }
    }

    private static createAnalysisPrompt(content: string, filename: string, extension: string): string
    {
        const truncatedContent = content.length > 3000 ? content.substring(0, 3000) + "..." : content;

        return `Please analyze this ${extension} file named "${filename}" and provide a comprehensive summary:

\`\`\`${extension.substring(1)}
${truncatedContent}
\`\`\`

Please provide:
1. **Purpose**: What does this file do?
2. **Key Components**: Main functions, classes, or sections
3. **Dependencies**: Important imports or external dependencies
4. **Complexity**: Estimate of code complexity (Low/Medium/High)
5. **Framework/Technology**: Any specific frameworks or technologies used
6. **Notable Patterns**: Design patterns, architectural decisions, or code style
7. **Recommendations**: Any suggestions for improvement or important notes

Format the response in markdown with clear sections and bullet points.`;
    }

    private static async invokeCopilotAPI(prompt: string): Promise<string | null>
    {
        try
        {
            // Check if GitHub Copilot extension is available
            const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
            if (!copilotExtension)
            {
                console.log('GitHub Copilot extension not found');
                return null;
            }

            // Ensure the extension is activated
            if (!copilotExtension.isActive)
            {
                await copilotExtension.activate();
            }

            // Try to use GitHub Copilot Chat API if available
            try
            {
                // First try the newer language model API (VS Code 1.90+)
                if ('lm' in vscode && typeof (vscode as any).lm?.selectChatModels === 'function')
                {
                    const models = await (vscode as any).lm.selectChatModels({
                        vendor: 'copilot',
                        family: 'gpt-4'
                    });

                    if (models.length > 0)
                    {
                        const model = models[0];
                        const messages = [
                            (vscode as any).LanguageModelChatMessage.User(prompt)
                        ];

                        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

                        let result = '';
                        for await (const chunk of response.text)
                        {
                            result += chunk;
                        }

                        return result;
                    }
                }
            } catch (lmError)
            {
                console.log('Language model API not available, trying alternative methods:', lmError);
            }

            // Try using Copilot commands
            try
            {
                // Try different command variations that might be available
                const commands = [
                    'github.copilot.generate',
                    'github.copilot.chat.explainThis',
                    'github.copilot.interactiveEditor.generate',
                    'copilot.generate'
                ];

                for (const command of commands)
                {
                    try
                    {
                        const result = await vscode.commands.executeCommand(command, {
                            prompt: prompt,
                            language: 'markdown'
                        });

                        if (result && typeof result === 'string')
                        {
                            return result;
                        }
                    } catch (cmdError)
                    {
                        // Try next command
                        continue;
                    }
                }
            } catch (commandError)
            {
                console.error('Error using Copilot commands:', commandError);
            }

            // Try accessing Copilot extension API directly
            try
            {
                const api = copilotExtension.exports;
                if (api && typeof api.generateCompletion === 'function')
                {
                    const result = await api.generateCompletion(prompt);
                    if (result)
                    {
                        return result;
                    }
                }
            } catch (apiError)
            {
                console.error('Error accessing Copilot API:', apiError);
            }

            // If all methods fail, show a helpful message
            vscode.window.showInformationMessage(
                'GitHub Copilot is installed but the API is not accessible. Please ensure you have the latest version and are signed in.',
                'Open Copilot Chat'
            ).then(action =>
            {
                if (action === 'Open Copilot Chat')
                {
                    vscode.commands.executeCommand('github.copilot.interactiveEditor.explain');
                }
            });

            return null;
        } catch (error)
        {
            console.error('Error invoking Copilot API:', error);
            return null;
        }
    }

    private static formatCopilotResponse(response: string, filename: string): string
    {
        const header = `# 🤖 AI Summary for ${filename}\n\n*Generated by GitHub Copilot*\n\n---\n\n`;
        const footer = `\n\n---\n\n*Summary generated on ${new Date().toLocaleString()}*`;

        return header + response + footer;
    }

    private static generateFallbackSummary(content: string, filename: string, extension: string): string
    {
        const lines = content.split('\n');
        const totalLines = lines.length;
        const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;
        const fileSize = Buffer.byteLength(content, 'utf8');

        let summary = `# 📄 File Summary: ${filename}\n\n`;
        summary += `*GitHub Copilot unavailable - using basic analysis*\n\n`;
        summary += `## Basic Information\n`;
        summary += `- **File Type**: ${extension}\n`;
        summary += `- **Total Lines**: ${totalLines}\n`;
        summary += `- **Non-empty Lines**: ${nonEmptyLines}\n`;
        summary += `- **File Size**: ${(fileSize / 1024).toFixed(2)} KB\n\n`;

        // Simple pattern detection
        summary += `## Quick Analysis\n`;

        // Check for common patterns
        const patterns = this.detectBasicPatterns(content, extension);
        patterns.forEach(pattern =>
        {
            summary += `- ${pattern}\n`;
        });

        // Check for TODO/FIXME comments
        const todos = content.match(/(?:TODO|FIXME|HACK|BUG):/gi) || [];
        if (todos.length > 0)
        {
            summary += `- **Action Items**: ${todos.length} TODO/FIXME comments found\n`;
        }

        summary += `\n## Note\n`;
        summary += `To get detailed AI-powered analysis, please ensure GitHub Copilot is installed and active.`;

        return summary;
    }

    private static detectBasicPatterns(content: string, extension: string): string[]
    {
        const patterns: string[] = [];

        // Language-specific basic detection
        switch (extension)
        {
            case '.js':
            case '.ts':
            case '.jsx':
            case '.tsx':
                if (content.includes('import ') || content.includes('require('))
                {
                    patterns.push('**Module System**: Uses imports/requires');
                }
                if (content.includes('class '))
                {
                    patterns.push('**Object-Oriented**: Contains class definitions');
                }
                if (content.includes('function ') || content.includes('=>'))
                {
                    patterns.push('**Functional**: Contains function definitions');
                }
                if (content.includes('useState') || content.includes('useEffect'))
                {
                    patterns.push('**Framework**: React with Hooks detected');
                }
                if (content.includes('interface ') || content.includes('type '))
                {
                    patterns.push('**TypeScript**: Type definitions found');
                }
                break;

            case '.py':
                if (content.includes('def '))
                {
                    patterns.push('**Functions**: Python function definitions found');
                }
                if (content.includes('class '))
                {
                    patterns.push('**Classes**: Python class definitions found');
                }
                if (content.includes('import ') || content.includes('from '))
                {
                    patterns.push('**Modules**: Import statements found');
                }
                break;

            case '.md':
                const headers = content.match(/^#+/gm) || [];
                if (headers.length > 0)
                {
                    patterns.push(`**Documentation**: ${headers.length} headers found`);
                }
                break;

            case '.json':
                try
                {
                    const parsed = JSON.parse(content);
                    if (parsed.name && parsed.version)
                    {
                        patterns.push('**Package Configuration**: Appears to be package.json');
                    }
                } catch
                {
                    patterns.push('**JSON**: Invalid JSON format');
                }
                break;
        }

        // General patterns
        if (content.includes('test') || content.includes('spec'))
        {
            patterns.push('**Testing**: Likely a test file');
        }
        if (content.includes('config') || content.includes('settings'))
        {
            patterns.push('**Configuration**: Configuration-related content');
        }
        if (content.includes('api') || content.includes('endpoint'))
        {
            patterns.push('**API**: API-related functionality');
        }

        return patterns.length > 0 ? patterns : ['**Content**: Standard file with no specific patterns detected'];
    }
}
