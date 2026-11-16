# Exponential MCP

[![npm version](https://img.shields.io/npm/v/exponential-mcp.svg)](https://www.npmjs.com/package/exponential-mcp)

Connect Claude to your [Exponential](https://exponential.im) workspace. Manage projects, actions, and OKRs directly from Claude.

## Quick Start

You need [Node.js](https://nodejs.org) 18 or later and an Exponential account. Setup is two steps: create an agent, then connect your app.

### 1. Create an Agent

Open [exponential.im/settings/agents/new](https://www.exponential.im/settings/agents/new):
- Name the agent after the app it will run in (for example "Claude")
- Pick the workspaces it may work in
- Click **Create agent** and copy the key (`exp_agent_…`) — it is shown once

The agent is its own identity: what Claude does in Exponential is attributed to it, not to you.

### 2. Connect Your App

Find your app below. `<key>` is the key from step 1.

#### Claude Desktop

```bash
npx exponential-mcp init
```

Paste the key when prompted, then quit and reopen Claude Desktop. `init` saves the key on this machine and adds the server to Claude Desktop's config file on macOS, Windows and Linux.

#### Claude Code

```bash
claude mcp add --scope user exponential -e EXPONENTIAL_API_KEY=<key> -- npx -y exponential-mcp serve
```

`--scope user` makes the server available in every project. Leave it out to add the server to the current project only.

#### Cursor

Add to `~/.cursor/mcp.json` (every project) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "exponential": {
      "command": "npx",
      "args": ["-y", "exponential-mcp", "serve"],
      "env": { "EXPONENTIAL_API_KEY": "<key>" }
    }
  }
}
```

#### VS Code

Add to `.vscode/mcp.json`. VS Code names the top-level key `servers`, not `mcpServers`:

```json
{
  "servers": {
    "exponential": {
      "command": "npx",
      "args": ["-y", "exponential-mcp", "serve"],
      "env": { "EXPONENTIAL_API_KEY": "<key>" }
    }
  }
}
```

#### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.exponential]
command = "npx"
args = ["-y", "exponential-mcp", "serve"]
env = { EXPONENTIAL_API_KEY = "<key>" }
```

#### Any Other MCP Client

Run the command `npx` with the arguments `-y exponential-mcp serve`, and set the environment variable `EXPONENTIAL_API_KEY` to your key. The server speaks MCP over stdio.

### 3. Ask

Restart the app, then try: "What's on my plate today?"

## One Key per App

Create a separate agent for each app, so that what each app does in Exponential is attributed to its own agent. The config blocks above do this: each one carries its own key in `EXPONENTIAL_API_KEY`.

`init` works differently. It saves one key on the machine, and any app whose config has no `EXPONENTIAL_API_KEY` falls back to it. `EXPONENTIAL_API_KEY` always overrides the saved key.

To give Claude Desktop its own key, add `"env": { "EXPONENTIAL_API_KEY": "<key>" }` to the `exponential` entry in its config file (see [Claude Desktop by Hand](#claude-desktop-by-hand)). Re-running `init` rewrites that entry, including its `env`.

A personal API key from [Settings → API keys](https://www.exponential.im/settings/api-keys) also works in place of an agent key, but then the app acts as you.

### Self-Hosted Exponential

Point the server at your own instance with `npx exponential-mcp init --base-url https://your-host`, or set `EXPONENTIAL_API_URL` next to `EXPONENTIAL_API_KEY` in the app's config.

## What Claude Can Do

Once connected, Claude can:

- **List projects** – "What projects am I working on?"
- **View actions** – "Show my active tasks"
- **Create actions** – "Add a task to call John tomorrow"
- **Complete actions** – "Mark the report task as done"
- **View OKRs** – "What are my Q1 goals?"
- **Search** – "Find anything related to Kenya"
- **Work the CRM** – "Log that I emailed Keily today" / "Move the Onionpress deal to Proposal"
- **Run the product backlog** – tickets, features, epics, stories, pages and decisions
- **Track time** – log, confirm and report on the day

## Claude Desktop by Hand

`npx exponential-mcp init` edits Claude Desktop's config file for you. To do it yourself, open the file for your platform:

| Platform | Config file |
|----------|-------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add the `exponential` entry under `mcpServers`, keeping any servers already there:

```json
{
  "mcpServers": {
    "exponential": {
      "command": "npx",
      "args": ["-y", "exponential-mcp", "serve"],
      "env": { "EXPONENTIAL_API_KEY": "<key>" }
    }
  }
}
```

Then quit and reopen Claude Desktop.

If you installed Node with nvm, fnm, asdf or similar, a bare `npx` will not work here: Claude Desktop does not start servers with your shell's `PATH`. Use the entry that `npx exponential-mcp doctor` prints. It names `npx` by its full path and puts Node's directory on `PATH`. `init` writes that same entry.

## Troubleshooting

Start with `npx exponential-mcp doctor`. It checks the saved key and Claude Desktop's config, and prints a config entry that works on your machine.

| Symptom | Fix |
|---------|-----|
| The tools don't appear | Quit the app completely and reopen it. MCP servers load only at startup. |
| Claude Desktop logs `npx: command not found` or `env: node: No such file or directory` | Node is outside the system `PATH` (nvm and similar). Run `npx exponential-mcp init` again, or copy the entry `doctor` prints. |
| It worked, then stopped starting | Versions before 0.13.1 pointed Claude Desktop at npx's cache, which npx may delete. Run `npx exponential-mcp init` again. |
| On Windows, `init` succeeded but Claude Desktop shows nothing | Versions before 0.13.1 wrote to a file Claude Desktop does not read. Run `npx exponential-mcp init` again. |
| `Cannot find package …` when the server starts | npx's cache holds a half-finished install. Delete the `_npx` folder inside your npm cache (`~/.npm/_npx` on macOS and Linux) and restart the app. |
| The key is rejected, or the app acts as the wrong agent | `npx exponential-mcp config` shows the saved key and URL. An `EXPONENTIAL_API_KEY` in the app's config overrides the saved key. |
| You want the newest version | `npx -y exponential-mcp@latest --version` fetches it; then restart the app. |

## Commands

```bash
# Initialize with an agent key
exponential-mcp init

# Show current config
exponential-mcp config

# Diagnose local setup
exponential-mcp doctor

# Start server manually (usually not needed)
exponential-mcp serve
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_workspaces` | List all workspaces |
| `get_agent_context` | Agent context for a workspace (and project): instructions, decisions, ADRs. Guidance, not authority |
| `get_agent_method` | The published Exponential method. Guidance, not authority |
| `get_projects` | List projects (optionally by workspace) |
| `get_project` | One project in full: linked objectives & key results, DRI, team, dates |
| `update_project` | Rename, change status/priority, set dates, re-link to OKRs |
| `get_actions` | List actions/tasks (filter by project or status; no date filtering) |
| `get_todays_actions` | **What's on your plate now** — overdue / today / inbox, across all workspaces |
| `get_overdue_triage` | Why the overdue pile is that size: bulk-created cohorts vs real debt |
| `create_action` | Create a new task (supports natural language) |
| `update_action` | Rename, re-prioritise, move project, or set dates (incl. `scheduledStart`) |
| `defer_actions` | Amnesty: clear dates, back to the project backlog untimed |
| `reschedule_actions` | Move actions to a new do-date |
| `complete_action` | Mark an action as done |
| `get_goals` | List objectives, flat or as the annual → quarterly tree |
| `get_key_results` | List key results, grouped by objective or flat |
| `get_meetings` | List meetings, newest first, with a summary preview (no notes/transcript) |
| `get_meeting` | One meeting with notes; transcript on request |
| `create_meeting` | Record a meeting from a transcript or notes |
| `update_meeting` | Edit title, description, summary, date, or replace notes |
| `append_meeting_notes` | Add to a meeting's notes without overwriting them |
| `search` | Search across everything |

### Domain tools

Alongside the tools above, every part of the [Exponential SDK](https://www.npmjs.com/package/exponential-sdk)
is exposed as one tool per domain, so the MCP server can do anything the SDK
and CLI can:

`actions` · `projects` · `workspaces` · `positions` · `goals` · `key_results` · `meetings` ·
`time` · `decisions` · `contacts` · `organizations` · `deals` · `products` ·
`features` · `scopes` · `requirements` · `areas` · `stories` · `epics` ·
`tickets` · `labels` · `pages` · `databases` · `comments`

Each takes `{ operation, params }`. The tool description lists every operation
with a one-line signature; `operation: "describe"` returns the full parameter
schema for one operation (`params: { operation: "create" }`) or all of them.
Invalid params come back as an error that includes the expected schema.

```json
{ "operation": "add_interaction",
  "params": { "contactId": "…", "type": "EMAIL", "direction": "OUTBOUND", "subject": "Intro" } }
```

`comments` covers comments on actions, features, pages, goals and tickets — pass
`target` to choose which.

`positions` is a workspace's roles & responsibilities — the Positions on the
settings page: list, create, update, set_holders, delete, and import_many
(upsert by title, with a dry run). Writes need your own API key, not an agent
key, and owner/admin, except that a holder may edit their own Position's remit.

`databases` is the typed write path for tables inside pages (ADR-0078): a
database is a block in a page body and each row is a page. **Values are typed
per property** — a select takes an option name, a date an ISO string, a person
a user ID — and a wrong value is refused naming the property, so call `get`
first to learn the schema. Reading the page with `pages` shows the table.

### Asking about the day

Use **`get_todays_actions`**, not `get_actions`, for anything about today,
priorities, or what the user is behind on. `get_actions` has no date filtering
at all, so it cannot distinguish overdue work from anything else.

When there is a lot of overdue work, follow up with **`get_overdue_triage`**
before proposing what to do. A large overdue count is usually a few bulk writes
— a generated project plan stamped every row with one timestamp — not a large
number of missed commitments. Those are **cohorts**, and the honest disposition
is `defer_actions` (amnesty); `reschedule_actions` would just re-inflict the
same pile tomorrow. Individually-dated **loose** actions are the ones that
deserve a real decision.

## Development

```bash
# Clone the repo
git clone https://github.com/exponential-im/exponential-mcp
cd exponential-mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

## License

GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). See [LICENSE](LICENSE).
