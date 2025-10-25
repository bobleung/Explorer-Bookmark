# 1.0.0

- Forked from Explorer Bookmark by UrosVujosevic
- Grateful for the excellent foundation provided by the original extension

# 1.0.1

- Added drag-and-drop functionality to reorder bookmarks
- Implemented `TreeDragAndDropController` for intuitive bookmark reordering
- Updated VS Code engine requirement to ^1.66.0 (required for drag-and-drop API)
- Fixed missing semicolons in DirectoryWorker.ts
- Changed tree view registration from `registerTreeDataProvider` to `createTreeView` to support drag-and-drop controller
