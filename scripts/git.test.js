import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { inspect, prepare } from "../mods/herdr-kickoff/git.js";
import { matches, defaultTitle, keyAction } from "../mods/herdr-kickoff/model.js";
const call = promisify(execFile);
const exec = async (program, args) => {
  try { return { code: 0, ...await call(program, args) }; }
  catch (e) { if (typeof e.code !== "number") throw e; return { code: e.code, stdout: e.stdout, stderr: e.stderr }; }
};
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "kickoff-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const repo = join(home, "repo");
  await call("git", ["init", "-b", "main", repo]);
  await call("git", ["-C", repo, "config", "user.name", "Test"]);
  await call("git", ["-C", repo, "config", "user.email", "test@example.invalid"]);
  await writeFile(join(repo, "file"), "original\n");
  await call("git", ["-C", repo, "add", "."]);
  await call("git", ["-C", repo, "commit", "-m", "initial"]);
  return { home, repo, git: args => call("git", ["-C", repo, ...args]) };
}
test("zoxide filtering preserves ranking and uses smart case", () => {
  const paths = ["/SRC/Herdr", "/src/other", "/src/herdr"];
  assert.deepEqual(paths.filter(p => matches("src herdr", p)), [paths[0], paths[2]]);
  assert.deepEqual(paths.filter(p => matches("SRC", p)), [paths[0]]);
});
test("keyboard workflow covers every field and launch without a mouse", () => {
  assert.equal(keyAction("directory", "directory", "down"), "down");
  assert.equal(keyAction("directory", "directory", "enter"), "pick");
  assert.equal(keyAction("agent", null, "right"), "agent-next");
  assert.equal(keyAction("agent", null, "tab"), "next");
  assert.equal(keyAction("branch", "branch", "w", { control: true }), "mode");
  assert.equal(keyAction("branch", null, "tab", { shift: true }), "previous");
  assert.equal(keyAction("title", null, "enter"), "launch");
  assert.equal(keyAction("directory", "directory", "s", { control: true }), "launch");
});
test("titles follow launch mode and branch", () => {
  assert.equal(defaultTitle("/src/repo", "main", "in-place", "main"), "repo");
  assert.equal(defaultTitle("/src/repo", "feature", "in-place", "main"), "repo:feature");
});
test("new worktree starts from default branch and reopening reuses its path", async t => {
  const { home, repo, git } = await fixture(t);
  await git(["switch", "-c", "other"]);
  await writeFile(join(repo, "other-only"), "other");
  await git(["add", "."]); await git(["commit", "-m", "other"]);
  const target = await prepare(exec, { directory: repo, branch: "feature/a", mode: "worktree" }, home);
  assert.equal((await exec("test", ["-e", join(target.folder, "other-only")])).code, 1);
  assert.equal((await inspect(exec, repo)).current, "other");
  assert.deepEqual(await prepare(exec, { directory: repo, branch: "feature/a", mode: "worktree" }, home), target);
  await assert.rejects(prepare(exec, { directory: repo, branch: "feature/a", mode: "in-place" }, home), /elsewhere/);
});
test("failed in-place switch preserves dirty files", async t => {
  const { home, repo, git } = await fixture(t);
  await git(["switch", "-c", "other"]);
  await writeFile(join(repo, "file"), "other\n"); await git(["commit", "-am", "other"]);
  await git(["switch", "main"]); await writeFile(join(repo, "file"), "dirty\n");
  await assert.rejects(prepare(exec, { directory: repo, branch: "other", mode: "in-place" }, home), /overwritten/);
  assert.equal(await readFile(join(repo, "file"), "utf8"), "dirty\n");
  assert.equal((await inspect(exec, repo)).current, "main");
});
test("in-place creates branch and invalid names fail", async t => {
  const { home, repo } = await fixture(t);
  await prepare(exec, { directory: repo, branch: "new", mode: "in-place" }, home);
  assert.equal((await inspect(exec, repo)).current, "new");
  await assert.rejects(prepare(exec, { directory: repo, branch: "--bad", mode: "worktree" }, home));
});
