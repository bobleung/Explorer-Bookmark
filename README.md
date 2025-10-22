# 🔖 Explorer Bookmark for VS Code

**Intelligent bookmarking system with Git integration, AI-powered analysis, and team collaboration features.**

Ever got lost in a huge repo, with no imaginable way back to the files you originally worked on? Say goodbye to endless scrolling trying to find those files after losing where they were.

Explorer Bookmark provides a comprehensive solution for managing important files and folders in large projects, enhanced with modern development workflow features including Git integration, AI-powered code analysis, and seamless team collaboration capabilities.

![gif](docs/demonstration.gif?raw=true)

## Available actions

### 📁 Basic Functionality
- Adding and removing folders/files
- Organizing bookmarks into sections
- Saving everything in the view after closing VS Code (Activated by default, can be changed)
- Resetting the view

### 🤖 AI-Powered Features
- **Generate AI Summary**: Right-click on any bookmarked file to generate an intelligent summary using **GitHub Copilot**
- **View AI Summary**: Quick access to previously generated summaries
- **Smart Analysis**: Comprehensive code analysis with purpose, complexity, and recommendations
- **Interactive Mode**: If direct API access isn't available, seamlessly switch to interactive Copilot Chat
- **Fallback Analysis**: Basic pattern detection when Copilot is unavailable

### 🤝 Team Collaboration
- **Export Team Bookmarks**: Share your bookmark configuration with team members
- **Import Team Bookmarks**: Load bookmarks from team members
- **Sync Team Bookmarks**: Real-time synchronization with team bookmark files
- **Git Integration**: Automatic commits when bookmarks are added

### 📝 Enhanced Organization
- **Comments**: Add contextual notes to your bookmarks
- **Tags**: Categorize bookmarks with custom tags
- **Visual Indicators**: See at a glance which files have summaries, comments, or tags
- **Enhanced Tooltips**: Rich hover information with metadata

## How to Use New Features

### Creating Sections
1. Click the `+` icon in the Explorer Bookmark title bar
2. Enter a name for your section (e.g., "API Endpoints", "Configuration Files")
3. Start adding bookmarks to organize them

### AI Summaries
1. Right-click on any bookmarked file
2. Select "Generate AI Summary"
3. **If GitHub Copilot is available**: Automatic intelligent analysis
4. **If Copilot API unavailable**: Interactive mode opens a prompt for Copilot Chat
5. **If Copilot not installed**: Falls back to basic pattern analysis
6. View summaries later with "View AI Summary"

### Prerequisites for Best AI Experience
- Install **GitHub Copilot** extension
- Sign in to GitHub Copilot
- For newest features, ensure VS Code is updated to latest version

### Team Collaboration
1. **Export**: Use "Export Team Bookmarks" to create a shareable `.vscode/team-bookmarks.json`
2. **Import**: Use "Import Team Bookmarks" to load team configurations
3. **Sync**: Use "Sync Team Bookmarks" to merge changes with team members

### Adding Metadata
- **Comments**: Right-click → "Add Comment" to add contextual notes
- **Tags**: Right-click → "Add Tags" to categorize (comma-separated)

## Visual Indicators
- 🤖 File has AI summary
- 💬 File has comment
- 🏷️ File has tags

## TODO

- Add ignoring files with certain extensions or name patterns
- Smart bookmark suggestions based on usage patterns
- Integration with external documentation systems
