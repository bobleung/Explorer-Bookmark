import * as vscode from "vscode";

export class TypedDirectory
{
  path: string;
  type: vscode.FileType;
  comment?: string;
  tags?: string[];
  addedBy?: string;
  dateAdded?: Date;
  aiSummary?: string;
  lastSummaryUpdate?: Date;

  constructor(
    path: string,
    type: vscode.FileType,
    comment?: string,
    tags?: string[],
    addedBy?: string,
    dateAdded?: Date,
    aiSummary?: string,
    lastSummaryUpdate?: Date
  )
  {
    this.path = path;
    this.type = type;
    this.comment = comment;
    this.tags = tags || [];
    this.addedBy = addedBy;
    this.dateAdded = dateAdded || new Date();
    this.aiSummary = aiSummary;
    this.lastSummaryUpdate = lastSummaryUpdate;
  }

  updateAISummary(summary: string): void
  {
    this.aiSummary = summary;
    this.lastSummaryUpdate = new Date();
  }

  addTag(tag: string): void
  {
    if (!this.tags) this.tags = [];
    if (!this.tags.includes(tag))
    {
      this.tags.push(tag);
    }
  }

  removeTag(tag: string): void
  {
    if (this.tags)
    {
      this.tags = this.tags.filter(t => t !== tag);
    }
  }
}

export async function buildTypedDirectory(uri: vscode.Uri, comment?: string, tags?: string[])
{
  const type = (await vscode.workspace.fs.stat(uri)).type;
  const username = vscode.env.machineId; // Use machine ID as user identifier
  return new TypedDirectory(uri.fsPath, type, comment, tags, username);
}

