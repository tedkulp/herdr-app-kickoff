import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, knownAgents, pickFolder, home, run, exec, shared, setShared, spaces, panes } from "herdr";
import { launchArgs, matches, defaultTitle, keyAction } from "./model.js";
import { inspect, prepare } from "./git.js";

const FIELDS = ["directory", "agent", "branch", "title"];
export default class Kickoff extends View {
  init(_props, cx) {
    this.folder = InputState.new({ value: "", placeholder: "Filter zoxide history, or /path or ~/path" });
    this.branch = InputState.new({ value: "", placeholder: "Filter branches or type a new branch" });
    this.title = InputState.new({ value: "", placeholder: "Space title" });
    this.agents = [];
    this.directories = [];
    this.agentKey = shared("herdr-kickoff.last-agent") || "shell";
    this.loading = true; this.busy = false; this.error = ""; this.notice = "";
    this.field = "directory"; this.picker = "directory"; this.at = 0;
    this.directory = ""; this.repo = null; this.mode = "in-place"; this.titleEdited = false;
    this.probeVersion = 0;
    this.handle = cx.focus_handle();
    this.folder.on("change", (_e, cx) => {
      this.picker = "directory"; this.at = 0; this.moved = false; this.directory = ""; this.repo = null;
      this.probeVersion++; this.probing = false; this.error = ""; cx.notify();
    });
    this.branch.on("change", (_e, cx) => { this.picker = "branch"; this.at = 0; this.moved = false; this.updateTitle(); cx.notify(); });
    this.title.on("change", () => { if (!this.settingTitle) this.titleEdited = true; });
    for (const [field, input] of [["directory", this.folder], ["branch", this.branch], ["title", this.title]]) {
      input.on("focus", (_e, cx) => { this.field = field; cx.notify(); });
    }
    this.folder.focus();
    cx.spawn(async (cx) => {
      try {
        this.agents = await knownAgents();
        if (!this.choices().some(a => a.key === this.agentKey)) this.agentKey = "shell";
      } catch (error) { this.notice = `Agent discovery failed: ${error}`; }
      this.loading = false; cx.notify();
    });
    cx.spawn(async (cx) => {
      try {
        const r = await exec("zoxide", ["query", "--list"]);
        if (r.code !== 0) throw new Error(r.stderr || "zoxide query failed");
        this.directories = r.stdout.split("\n").filter(Boolean);
      } catch { this.notice = "Zoxide is unavailable. Enter /path or ~/path, or Browse."; }
      cx.notify();
    });
  }

  choices() { return [...this.agents.filter(a => a.installed), { key: "shell", name: "Shell" }]; }
  rows() {
    if (this.picker === "directory") return this.directories.filter(d => matches(this.folder.value(), d));
    if (this.picker === "branch") return (this.repo?.branches ?? []).filter(b => matches(this.branch.value(), b));
    return [];
  }
  close() { if (!this.busy) closeOverlay(props().overlay); }
  focus(field, cx) {
    this.field = field; this.picker = null;
    if (field === "agent") this.handle.focus();
    else ({ directory: this.folder, branch: this.branch, title: this.title })[field].focus();
    cx.notify();
  }
  move(delta, cx) { this.focus(FIELDS[(FIELDS.indexOf(this.field) + delta + FIELDS.length) % FIELDS.length], cx); }
  updateTitle() {
    if (this.titleEdited) return;
    this.settingTitle = true;
    this.title.set_value(defaultTitle(this.directory || this.folder.value(), this.branch.value().trim(), this.mode, this.repo?.current));
    this.settingTitle = false;
  }
  chooseDirectory(value, cx) {
    if (this.busy) return;
    let directory;
    try { directory = launchArgs(value, "", "shell", [], home()).folder; }
    catch (error) { this.error = String(error); cx.notify(); return; }
    this.folder.set_value(directory); this.directory = directory; this.picker = null;
    this.repo = null; this.branch.set_value(""); this.picker = null; this.updateTitle();
    const version = ++this.probeVersion;
    this.probing = true; this.error = "";
    this.focus("agent", cx);
    cx.spawn(async (cx) => {
      try {
        const repo = await inspect(exec, directory);
        if (version !== this.probeVersion) return;
        this.repo = repo; this.branch.set_value(repo?.current || ""); this.picker = null; this.updateTitle();
      } catch (error) { if (version === this.probeVersion) this.error = String(error); }
      if (version === this.probeVersion) this.probing = false;
      cx.notify();
    });
  }
  accept(cx) {
    if (this.busy) return;
    const rows = this.rows();
    if (this.field === "directory") {
      const text = this.folder.value();
      this.chooseDirectory(text.startsWith("/") || text.startsWith("~") ? text : rows[this.at] || text, cx);
    } else if (this.field === "branch") {
      // Existing matches are picked; a query with no matches creates a new branch.
      if (this.picker && rows[this.at] && (this.moved || !rows.includes(this.branch.value()))) this.branch.set_value(rows[this.at]);
      this.picker = null; this.moved = false; this.updateTitle(); this.focus("title", cx);
    } else if (this.field === "title") this.start(cx);
    else this.move(1, cx);
  }
  toggleMode(cx) { if (!this.busy) { this.mode = this.mode === "in-place" ? "worktree" : "in-place"; this.updateTitle(); cx.notify(); } }
  browse(cx) {
    if (this.busy) return;
    cx.spawn(async (cx) => {
      try { const folder = await pickFolder(); if (folder) this.chooseDirectory(folder, cx); }
      catch (error) { this.error = String(error); }
      cx.notify();
    });
  }
  key(e, cx) {
    const action = keyAction(this.field, this.picker, e.key, e.modifiers);
    if (!action) return;
    cx.stop_propagation();
    if (this.busy) return;
    if (action === "launch") this.start(cx);
    else if (action === "close") this.close();
    else if (action === "dismiss") { this.picker = null; cx.notify(); }
    else if (action === "pick") this.accept(cx);
    else if (action === "next" || action === "previous") {
      if (this.field === "directory" && !this.directory && action === "next") this.accept(cx);
      else this.move(action === "next" ? 1 : -1, cx);
    } else if (action === "up" || action === "down") {
      const n = this.rows().length;
      if (n) this.at = (this.at + (action === "down" ? 1 : n - 1)) % n;
      this.moved = true; cx.notify();
    } else if (action === "mode") this.toggleMode(cx);
    else if (action.startsWith("agent-")) {
      const list = this.choices(); const at = Math.max(0, list.findIndex(a => a.key === this.agentKey));
      this.agentKey = list[(at + (action === "agent-next" ? 1 : list.length - 1)) % list.length].key; cx.notify();
    }
  }
  start(cx) {
    if (this.busy || this.loading || this.probing) return;
    this.busy = true; this.error = ""; cx.notify();
    const agentKey = this.agentKey;
    const mode = this.mode;
    const branch = this.branch.value().trim();
    cx.spawn(async (cx) => {
      try {
        const args = launchArgs(this.directory || this.folder.value(), this.title.value(), agentKey, this.agents, home());
        const target = await prepare(exec, { directory: args.folder, branch, mode }, home());
        const tabIds = s => new Set(s.tabs.map(t => t.id));
        const existing = target.reuse && spaces().find(s => {
          if (s.machine) return false;
          const tabs = tabIds(s);
          const folder = panes().find(p => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
          return folder?.replace(/\/+$/, "") === target.folder.replace(/\/+$/, "");
        });
        if (existing) run("space.select", { id: existing.id });
        else run("space.new", { ...args, folder: target.folder });
        setShared("herdr-kickoff.last-agent", agentKey);
        closeOverlay(props().overlay);
      } catch (error) { this.error = String(error); }
      this.busy = false; cx.notify();
    });
  }
  render(cx) {
    const t = theme();
    const button = (id, text, action, selected = false) => div().id(id).px(10).py(6).rounded(6)
      .bg(selected ? t.selected : t.raised).cursor_pointer().on_click((_e, cx) => { if (!this.busy) action(cx); }).child(text);
    const input = (state, field) => h_flex().h(34).px(10).border_1().border_color(this.field === field ? t.accent : t.input).rounded(6).bg(t.background).child(Input.new(state).flex_1());
    const rows = this.rows();
    const first = Math.max(0, this.at - 3);
    const list = v_flex().gap(2).children(rows.slice(first, first + 7).map((value, offset) => {
      const selected = first + offset === this.at;
      const checkout = this.picker === "branch" && this.repo?.worktrees.find(w => w.branch === value);
      return div().id(`choice-${offset}`).px(10).py(4).rounded(4).truncate()
        .bg(selected ? t.selected : t.popover).cursor_pointer()
        .on_click((_e, cx) => {
          if (this.busy) return;
          if (this.picker === "directory") this.chooseDirectory(value, cx);
          else { this.branch.set_value(value); this.picker = null; this.updateTitle(); this.focus("title", cx); }
        }).child(`${value}${checkout ? "  ⎇ worktree" : ""}`);
    }));
    return v_flex().id("kickoff").track_focus(this.handle).size_full().p(18).gap(10)
      .bg(t.popover).text_color(t.foreground).text_size(13).on_key_down((e, cx) => this.key(e, cx))
      .child(div().text_size(18).font_semibold().child("New space"))
      .child(div().text_color(t.muted).child("Directory"))
      .child(h_flex().gap(8).child(div().flex_1().child(input(this.folder, "directory")))
        .child(button("browse", "Browse…", cx => this.browse(cx))))
      .when(this.picker === "directory", e => e.child(list).child(div().text_color(t.dim).text_size(11).child(`${rows.length} matches · ↑↓ choose · Enter selects · absolute paths open directly`)))
      .child(div().text_color(t.muted).child("Agent · ←→ choose"))
      .child(h_flex().gap(6).flex_wrap().border_1().border_color(this.field === "agent" ? t.accent : t.popover).rounded(6)
        .children(this.choices().map(a => button(`agent-${a.key}`, a.name, cx => { this.agentKey = a.key; this.focus("agent", cx); }, this.agentKey === a.key))))
      .child(h_flex().gap(8).items_center().child(div().flex_1().text_color(t.muted).child(this.probing ? "Reading branches…" : "Branch"))
        .child(button("in-place", "In place", cx => { this.mode = "in-place"; this.updateTitle(); cx.notify(); }, this.mode === "in-place"))
        .child(button("worktree", "Worktree", cx => { this.mode = "worktree"; this.updateTitle(); cx.notify(); }, this.mode === "worktree")))
      .child(input(this.branch, "branch"))
      .when(this.picker === "branch", e => e.child(list).child(div().text_size(11).text_color(t.dim).child(`${rows.length} matches · ↑↓ choose · Enter selects · no match creates a branch`)))
      .child(div().text_size(11).text_color(t.dim).child(this.repo ? `New branches start from ${this.repo.base} · Ctrl+W toggles launch mode` : "Choose a Git folder for branches and worktrees"))
      .child(div().text_color(t.muted).child("Title"))
      .child(input(this.title, "title"))
      .when(Boolean(this.notice), e => e.child(div().text_color(t.muted).child(this.notice)))
      .when(Boolean(this.error), e => e.child(div().text_color(t.blocked).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().text_size(11).text_color(t.muted).child("Tab / Shift+Tab fields · Ctrl+S opens · Esc dismisses / cancels"))
        .child(button("launch", this.busy ? "Opening…" : "Open space", cx => this.start(cx), true)));
  }
}
