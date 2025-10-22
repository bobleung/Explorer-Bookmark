export enum vsCodeCommands
{
    Open = 'vscode.open',
};

export enum DirectoryProviderCommands
{
    SelectItem = 'directoryprovider/selectitem',
    OpenItem = 'directoryprovider/openitem',
    RefreshEntry = 'directoryprovider/refreshentry',
    CantRemoveItem = 'directoryprovider/cantremoveitem',
    RemoveItem = 'directoryprovider/removeitem',
    RemoveAllItems = 'directoryprovider/removeallitems',
    AddSection = 'directoryprovider/addsection',
    RemoveSection = 'directoryprovider/removesection',
    SelectItemToSection = 'directoryprovider/selectitemtosection',
    ViewAISummary = 'directoryprovider/viewaisummary',
    ShowGitDiff = 'directoryprovider/showgitdiff',
    ExportTeamBookmarks = 'directoryprovider/exportteambookmarks',
    ImportTeamBookmarks = 'directoryprovider/importteambookmarks',
    SyncTeamBookmarks = 'directoryprovider/syncteambookmarks',
    InjectTeamBookmarks = 'directoryprovider/injectteambookmarks',
    AddBookmarkComment = 'directoryprovider/addbookmarkcomment',
    AddBookmarkTags = 'directoryprovider/addbookmarktags',
    // New Collaborative Commands
    AddComment = 'directoryprovider/addcomment',
    UpdateStatus = 'directoryprovider/updatestatus',
    UpdatePriority = 'directoryprovider/updatepriority',
    CreatePR = 'directoryprovider/createpr',
    LinkPR = 'directoryprovider/linkpr',
    ShowGitHub = 'directoryprovider/showgithub',
    SetupGitHub = 'directoryprovider/setupgithub',
    // Cherry-pick Commands
    CherryPickChanges = 'directoryprovider/cherrypickchanges',
    // Git Operations Commands
    GitAddFile = 'directoryprovider/gitaddfile',
    GitCommitFile = 'directoryprovider/gitcommitfile',
    GitStashFile = 'directoryprovider/gitstashfile',
};