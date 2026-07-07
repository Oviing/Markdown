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
    fn initial_commit_unborn_branch() {
        let out = "# branch.oid (initial)\n# branch.head main\n? new.md\n";
        let s = parse_porcelain_v2(out);
        assert_eq!(s.branch, "main");
        assert_eq!(s.dirty, 1);
    }
}
