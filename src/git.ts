import { invoke } from "@tauri-apps/api/core";

export interface GitStatus {
  is_repo: boolean;
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
}

export function gitStatus(dir: string): Promise<GitStatus> {
  return invoke("git_status", { dir });
}

export function gitCommit(dir: string, file: string | null, message: string): Promise<string> {
  return invoke("git_commit", { dir, file, message });
}

export function gitPush(dir: string): Promise<string> {
  return invoke("git_push", { dir });
}
