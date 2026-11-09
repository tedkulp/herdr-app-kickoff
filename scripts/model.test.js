import { test } from "node:test";
import assert from "node:assert/strict";
import { launchArgs } from "../mods/herdr-kickoff/model.js";

test("local shell launches explicitly on this computer without overriding its shell", () => {
  assert.deepEqual(launchArgs("~/src", " Work ", "shell", [], "/home/user"), { folder: "/home/user/src", machine: "", name: "Work" });
});
test("agent launch preserves the program's argument boundaries", () => {
  const agents = [{ key: "custom", installed: true, run: ["agent", "--model", "a b"] }];
  assert.deepEqual(launchArgs("/tmp/a b", "", "custom", agents, "/home/user").argv, ["agent", "--model", "a b"]);
});
test("stale agent selection and relative paths cannot launch", () => {
  assert.throws(() => launchArgs("/tmp", "", "missing", [], "/home/user"), /installed agent/);
  assert.throws(() => launchArgs("relative", "", "shell", [], "/home/user"), /absolute/);
});
