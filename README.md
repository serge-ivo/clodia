# clodia

High-level terminal orchestrator. Clodia supervises a tmux workspace, explains what each terminal session is doing in simple words, flags what needs attention, and routes your reply back into the right session.

It can spawn Claude Code agents, but it also tracks plain terminal windows inside the Clodia tmux session.

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
n        Spawn new Claude Code agent
r        Reply to selected terminal session
v        View selected session output
a        Attach to selected tmux window
y/d      Approve or deny permission prompts
k        Kill selected session
up/down  Navigate session list
q        Quit dashboard
```

Sessions keep running in tmux after the dashboard exits.

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
