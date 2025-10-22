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

    public static async generateCustomSummary(prompt: string): Promise<string>
    {
        try
        {
            // Try multiple Copilot API access methods for custom prompts
            return await this.generateCopilotCustomSummary(prompt);
        } catch (error)
        {
            console.error('Error generating custom AI summary:', error);
            return "Error generating custom summary. GitHub Copilot may be unavailable.";
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
                // Open interactive Copilot session
                return await this.generateInteractiveSummary(content, filename, extension, prompt);
            }
        } catch (error)
        {
            console.error('Error invoking GitHub Copilot:', error);
            return "GitHub Copilot is required for AI summaries. Please ensure GitHub Copilot is installed, active, and you are signed in.";
        }
    }

    private static async generateCopilotCustomSummary(prompt: string): Promise<string>
    {
        try
        {
            // Use VS Code's GitHub Copilot API to get the summary
            const copilotResponse = await this.invokeCopilotAPI(prompt);

            if (copilotResponse)
            {
                return this.formatCopilotResponse(copilotResponse, 'Git Diff Analysis');
            } else
            {
                return "GitHub Copilot is required for diff analysis. Please ensure GitHub Copilot is installed, active, and you are signed in.";
            }
        } catch (error)
        {
            console.error('Error invoking GitHub Copilot for custom prompt:', error);
            return "GitHub Copilot is required for diff analysis. Please ensure GitHub Copilot is installed, active, and you are signed in.";
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

---

*Please follow the steps above to use GitHub Copilot Chat for AI-powered analysis.*`;

        } catch (error)
        {
            console.error('Error creating interactive session:', error);
            return "GitHub Copilot is required for AI summaries. Please ensure GitHub Copilot is installed, active, and you are signed in.";
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
}
