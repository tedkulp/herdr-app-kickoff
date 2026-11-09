# Kickoff for herdr-app

A native herdr-app dialog for opening a local folder as a new space with a chosen agent. This is a separate project from the Rust herdr-kickoff plugin.

## Develop

Requires herdr-app, Node.js 22 or later for checks, and a Unix-like system. There are no npm dependencies or build steps.

```sh
npm run check
```

The host check renders the initial state. Also exercise Browse, agent selection, invalid folders, and launching in the app before releasing.

## Install locally

From this repository, link the mod into the app's mods folder. The destination must not already exist.

```sh
ln -s "$PWD/mods/herdr-kickoff" "${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/herdr-kickoff"
```

Add this entry to the `global` object in the app's `keys.json`:

```json
"ctrl-shift-n": "mod.open:herdr-kickoff"
```

Type to filter your zoxide directory history. Every word must match, smart case applies, and zoxide ranking is preserved. Use Up/Down and Enter to select, or enter an absolute path or `~/path`. Browse is also available. Missing zoxide leaves direct paths available.

Tab and Shift+Tab move through Directory, Agent, Branch, and Title. On Agent, arrow keys change the selection. On Branch, type to filter local branches, then use Up/Down and Enter to pick. A name with no match creates a new branch. Clear the current branch text to see all branches. Ctrl+W or Alt+Left/Right toggles In place and Worktree while on Branch. Ctrl+S or Ctrl/Cmd+Enter launches from any field; Enter on Title launches. Escape dismisses an open picker, then closes the dialog.

In place switches the chosen folder's checkout before opening a new space. Git's error stays in the form if switching fails. Worktree reopens an existing checkout or creates one under `~/.herdr/worktrees/<repo>/<encoded-branch>`. New branches start from the repository's advertised default branch, otherwise main, master, or HEAD. An already-open local worktree space is selected without starting another agent.

Agent choices come from herdr-app's program table; the last choice is remembered. The title follows the folder and branch until edited. All launches explicitly target this computer.

## Structure

`mods/herdr-kickoff/main.js` owns the dialog, keyboard navigation, asynchronous discovery, and host calls. `model.js` owns filtering, keyboard action mapping, title defaults, and launch argument validation. `git.js` owns repository inspection and branch/worktree preparation, with an injected process runner. Tests use real temporary Git repositories to verify changes and failures without touching user repositories.
