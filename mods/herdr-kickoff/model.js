// App-independent validation and translation of a launch request.
export function launchArgs(folder, title, agentKey, agents, userHome) {
  const value = folder.trim();
  const path = value === "~" ? userHome : value.startsWith("~/") ? userHome + value.slice(1) : value;
  if (!path.startsWith("/")) throw new Error("Enter an absolute folder path or ~/path.");
  const args = { folder: path, machine: "" };
  if (title.trim()) args.name = title.trim();
  if (agentKey !== "shell") {
    const agent = agents.find(a => a.key === agentKey && a.installed);
    if (!agent || !Array.isArray(agent.run) || !agent.run.length) throw new Error("Choose an installed agent.");
    args.argv = [...agent.run];
  }
  return args;
}

export function matches(query, candidate) {
  return query.trim().split(/\s+/).filter(Boolean).every(term =>
    term !== term.toLowerCase() ? candidate.includes(term) : candidate.toLowerCase().includes(term));
}

export function defaultTitle(directory, branch, mode, current) {
  const name = directory.replace(/\/+$/, "").split("/").pop() || "/";
  return branch && (mode === "worktree" || branch !== current) ? `${name}:${branch}` : name;
}

export function keyAction(field, picker, key, modifiers = {}) {
  if ((key === "s" && modifiers.control) || (key === "enter" && (modifiers.control || modifiers.platform))) return "launch";
  if (key === "escape") return picker ? "dismiss" : "close";
  if (key === "tab") return modifiers.shift ? "previous" : "next";
  if (picker && (key === "up" || key === "down")) return key;
  if (field === "agent" && ["left", "right", "up", "down"].includes(key)) return key === "left" || key === "up" ? "agent-previous" : "agent-next";
  if (field === "branch" && ((key === "w" && modifiers.control) || (modifiers.alt && ["left", "right"].includes(key)))) return "mode";
  if (key === "enter") return picker ? "pick" : field === "title" ? "launch" : "next";
  return null;
}
