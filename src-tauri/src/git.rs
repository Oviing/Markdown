use std::process::Output;

use serde::Serialize;
use tokio::process::Command;

#[derive(Serialize, Default, Debug, PartialEq)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub dirty: u32,
    pub ahead: u32,
    pub behind: u32,
}

async fn git(dir: &str, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())
}

fn stderr_of(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).trim().to_string()
}

fn parse_porcelain_v2(out: &str) -> GitStatus {
    let mut status = GitStatus {
        is_repo: true,
        ..Default::default()
    };
    let mut oid = String::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("# ") {
            if let Some(head) = rest.strip_prefix("branch.head ") {
                status.branch = head.trim().to_string();
            } else if let Some(o) = rest.strip_prefix("branch.oid ") {
                oid = o.trim().to_string();
            } else if let Some(ab) = rest.strip_prefix("branch.ab ") {
                for part in ab.split_whitespace() {
                    if let Some(n) = part.strip_prefix('+') {
                        status.ahead = n.parse().unwrap_or(0);
                    } else if let Some(n) = part.strip_prefix('-') {
                        status.behind = n.parse().unwrap_or(0);
                    }
                }
            }
        } else if !line.is_empty() {
            status.dirty += 1;
        }
    }
    if status.branch == "(detached)" && oid.len() >= 7 {
        status.branch = format!("({})", &oid[..7]);
    }
    status
}

#[tauri::command]
pub async fn git_status(dir: String) -> Result<GitStatus, String> {
    let out = match git(&dir, &["status", "--porcelain=v2", "--branch"]).await {
        Ok(out) => out,
        Err(_) => return Ok(GitStatus::default()), // git missing → treat as non-repo
    };
    if !out.status.success() {
        return Ok(GitStatus::default());
    }
    Ok(parse_porcelain_v2(&String::from_utf8_lossy(&out.stdout)))
}

#[tauri::command]
pub async fn git_commit(
    dir: String,
    file: Option<String>,
    message: String,
) -> Result<String, String> {
    if let Some(ref file) = file {
        let add = git(&dir, &["add", "--", file]).await?;
        if !add.status.success() {
            return Err(stderr_of(&add));
        }
    }
    let mut args = vec!["commit", "-m", &message];
    if let Some(ref file) = file {
        args.push("--");
        args.push(file);
    }
    let commit = git(&dir, &args).await?;
    if !commit.status.success() {
        let err = stderr_of(&commit);
        let stdout = String::from_utf8_lossy(&commit.stdout);
        if stdout.contains("nothing to commit") || err.contains("nothing to commit") {
            return Err("nothing to commit".into());
        }
        return Err(if err.is_empty() {
            stdout.trim().to_string()
        } else {
            err
        });
    }
    let sha = git(&dir, &["rev-parse", "--short", "HEAD"]).await?;
    Ok(String::from_utf8_lossy(&sha.stdout).trim().to_string())
}

#[tauri::command]
pub async fn git_push(dir: String) -> Result<String, String> {
    let out = git(&dir, &["push"]).await?;
    if !out.status.success() {
        return Err(stderr_of(&out));
    }
    Ok("pushed".into())
}

fn parse_branches(out: &str) -> Vec<String> {
    out.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect()
}

#[tauri::command]
pub async fn git_branches(dir: String) -> Result<Vec<String>, String> {
    // --format avoids the "* current" marker and the detached-HEAD line
    let out = git(&dir, &["branch", "--format=%(refname:short)"]).await?;
    if !out.status.success() {
        return Err(stderr_of(&out));
    }
    Ok(parse_branches(&String::from_utf8_lossy(&out.stdout)))
}

#[tauri::command]
pub async fn git_checkout(dir: String, branch: String) -> Result<(), String> {
    let out = git(&dir, &["checkout", &branch]).await?;
    if !out.status.success() {
        return Err(stderr_of(&out));
    }
    Ok(())
}

#[tauri::command]
pub async fn git_diff(dir: String, file: Option<String>) -> Result<String, String> {
    let mut args = vec!["diff", "HEAD"];
    if let Some(ref file) = file {
        args.push("--");
        args.push(file);
    }
    let out = git(&dir, &args).await?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
    }
    // unborn HEAD (fresh repo): fall back to a plain worktree-vs-index diff
    let mut args = vec!["diff"];
    if let Some(ref file) = file {
        args.push("--");
        args.push(file);
    }
    let out = git(&dir, &args).await?;
    if !out.status.success() {
        return Err(stderr_of(&out));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_dirty_and_ab() {
        let out = "# branch.oid 03374e1deadbeef\n\
                   # branch.head main\n\
                   # branch.upstream origin/main\n\
                   # branch.ab +2 -1\n\
                   1 .M N... 100644 100644 100644 abc def README.md\n\
                   ? notes.md\n";
        let s = parse_porcelain_v2(out);
        assert_eq!(
            s,
            GitStatus {
                is_repo: true,
                branch: "main".into(),
                dirty: 2,
                ahead: 2,
                behind: 1,
            }
        );
    }

    #[test]
    fn parses_clean_repo_without_upstream() {
        let out = "# branch.oid 03374e1deadbeef\n# branch.head main\n";
        let s = parse_porcelain_v2(out);
        assert_eq!(s.branch, "main");
        assert_eq!((s.dirty, s.ahead, s.behind), (0, 0, 0));
        assert!(s.is_repo);
    }

    #[test]
    fn detached_head_shows_short_sha() {
        let out = "# branch.oid 03374e1deadbeef\n# branch.head (detached)\n";
        let s = parse_porcelain_v2(out);
        assert_eq!(s.branch, "(03374e1)");
    }

    #[test]
    fn parses_branch_list() {
        assert_eq!(
            parse_branches("main\nfeature/one\n  spaced  \n\n"),
            vec!["main", "feature/one", "spaced"]
        );
    }

    #[test]
    fn empty_branch_list() {
        assert!(parse_branches("").is_empty());
        assert!(parse_branches("\n\n").is_empty());
    }

    #[test]
    fn initial_commit_unborn_branch() {
        let out = "# branch.oid (initial)\n# branch.head main\n? new.md\n";
        let s = parse_porcelain_v2(out);
        assert_eq!(s.branch, "main");
        assert_eq!(s.dirty, 1);
    }
}
