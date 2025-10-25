# 1.0.0

- Forked from Explorer Bookmark by UrosVujosevic
- Grateful for the excellent foundation provided by the original extension

# 1.0.1

- Added drag-and-drop functionality to reorder bookmarks
- Implemented `TreeDragAndDropController` for intuitive bookmark reordering
- Updated VS Code engine requirement to ^1.66.0 (required for drag-and-drop API)
- Fixed missing semicolons in DirectoryWorker.ts
- Changed tree view registration from `registerTreeDataProvider` to `createTreeView` to support drag-and-drop controller

# 1.0.2

- Added toggle reorder mode feature with dedicated toolbar button
- Reorder mode collapses all folders and adds drag handle (≡) prefix to items
- Drag-and-drop now only works when reorder mode is enabled
- Items now drop AFTER the target item (changed from before)
- Fixed MIME type to match VS Code convention (application/vnd.code.tree.explorer-bookmark)
- Enabled hover highlighting during drag operations for better UX
- Nested children are hidden in reorder mode to simplify the reordering experience
