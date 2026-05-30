# clodia

Multi-agent Claude Code supervisor. Clodia orchestrates multiple Claude Code sessions through tmux, with a terminal dashboard for spawning agents, viewing output, approving permission prompts, attaching to tmux windows, and killing agents.

## Requirements

- Node.js 20 or newer
- tmux
- Claude Code CLI available as `claude`

On macOS, install tmux with:

```sh
brew install tmux
```

## Run

Run the latest npm package:

```sh
npx clodia
```

Run Clodia against a specific project directory:

```sh
npx clodia ~/myproject
```

Run directly from GitHub:

```sh
npx github:serge-ivo/clodia
```

## Keyboard Shortcuts

```text
n        Spawn new agent
v        View selected agent output
a        Attach to selected agent tmux window
y/d      Approve or deny permission prompts
k        Kill selected agent
up/down  Navigate agent list
q        Quit dashboard
```

Agents keep running in tmux after the dashboard exits.

## Development

```sh
pnpm install
pnpm build
node dist/cli.js
```

Watch TypeScript while developing:

```sh
pnpm dev
```

## Publish

```sh
npm login
npm publish
```
