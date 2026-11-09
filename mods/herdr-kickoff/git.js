// exec is supplied by the host, or a real subprocess adapter in integration tests.
async function git(exec, cwd, args, required = true) {
  const r = await exec("git", ["-C", cwd, ...args]);
  if (required && r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || "Git command failed.");
  return r.code === 0 ? r.stdout.trimEnd() : null;
}

export async function inspect(exec, directory) {
  const root = await git(exec, directory, ["rev-parse", "--show-toplevel"], false);
  if (!root) return null;
  const current = await git(exec, root, ["symbolic-ref", "--quiet", "--short", "HEAD"], false);
  const refs = await git(exec, root, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "refs/heads"]);
  const branches = refs.split("\n").filter(Boolean);
  if (branches.includes(current)) branches.splice(branches.indexOf(current), 1);
  if (current) branches.unshift(current);
  const base = await git(exec, root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], false)
    || ["main", "master"].find(b => branches.includes(b)) || "HEAD";
  const raw = await git(exec, root, ["worktree", "list", "--porcelain", "-z"]);
  const worktrees = [];
  let entry;
  for (const line of raw.split("\0")) {
    if (line.startsWith("worktree ")) { entry = { path: line.slice(9), branch: null }; worktrees.push(entry); }
    else if (entry && line.startsWith("branch refs/heads/")) entry.branch = line.slice(18);
    else if (entry && line.startsWith("prunable")) entry.prunable = true;
  }
  return { root, current, branches, base, worktrees: worktrees.filter(w => !w.prunable) };
}

export async function prepare(exec, { directory, branch, mode }, userHome) {
  const valid = await exec("test", ["-d", directory]);
  if (valid.code !== 0) throw new Error("Choose an existing folder.");
  const repo = await inspect(exec, directory);
  if (!repo) {
    if (mode === "worktree" || branch) throw new Error("This folder is not in a Git repository.");
    return { folder: directory, reuse: false };
  }
  if (!branch && mode === "in-place") return { folder: directory, reuse: false };
  if (!branch) throw new Error("Choose or type a branch for the worktree.");
  const validated = await git(exec, repo.root, ["check-ref-format", "--branch", branch]);
  if (validated !== branch) throw new Error("Enter a literal branch name.");
  const checkout = repo.worktrees.find(w => w.branch === branch);
  const exists = repo.branches.includes(branch);
  if (mode === "in-place") {
    if (checkout && checkout.path !== repo.root) throw new Error("That branch is checked out elsewhere. Choose Worktree to reopen it.");
    if (branch !== repo.current) await git(exec, repo.root, exists ? ["switch", branch] : ["switch", "-c", branch, repo.base]);
    return { folder: directory, reuse: false };
  }
  if (checkout) return { folder: checkout.path, reuse: true };
  const repoName = repo.root.split("/").pop();
  // Encode rather than flatten slashes, so feature/a and feature-a cannot collide.
  const path = `${userHome}/.herdr/worktrees/${repoName}/${encodeURIComponent(branch)}`;
  await git(exec, repo.root, exists ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, repo.base]);
  return { folder: path, reuse: true };
}
