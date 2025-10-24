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

    // team bookmark stvari
    ExportTeamBookmarks = 'directoryprovider/exportteambookmarks',
    ImportTeamBookmarks = 'directoryprovider/importteambookmarks',
    SyncTeamBookmarks = 'directoryprovider/syncteambookmarks',
    InjectTeamBookmarks = 'directoryprovider/injectteambookmarks',

    AddBookmarkComment = 'directoryprovider/addbookmarkcomment',
    AddBookmarkTags = 'directoryprovider/addbookmarktags',
    AddComment = 'directoryprovider/addcomment',
    UpdateStatus = 'directoryprovider/updatestatus',
    UpdatePriority = 'directoryprovider/updatepriority',

    CreatePR = 'directoryprovider/createpr',
    LinkPR = 'directoryprovider/linkpr',
    ShowGitHub = 'directoryprovider/showgithub',
    SetupGitHub = 'directoryprovider/setupgithub',

    CherryPickChanges = 'directoryprovider/cherrypickchanges',
    GitAddFile = 'directoryprovider/gitaddfile',
    GitCommitFile = 'directoryprovider/gitcommitfile',
    GitStashFile = 'directoryprovider/gitstashfile',
    GitPushBookmarkedFiles = 'directoryprovider/gitpushbookmarkedfiles',
    GitFetch = 'directoryprovider/gitfetch',
    GitPull = 'directoryprovider/gitpull',
    GitRebase = 'directoryprovider/gitrebase',
    GitOperations = 'directoryprovider/gitoperations',
};