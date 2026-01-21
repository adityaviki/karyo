# Karyo

A simplified CLI coding agent for personal use, inspired by Claude Code.

## Setup

```bash
npm install
npm start -- --login
```

## Authentication

Anthropic API key authentication:

```bash
npm start -- --login
# Enter your Anthropic API key
```

## Usage

```bash
# Start the agent
npm start

# With specific directory
npm start -- --dir /path/to/project

# Different model
npm start -- --model claude-sonnet-4-20250514

# Check auth status
npm start -- --status

# Logout
npm start -- --logout
```

### Commands

- `/exit` - Exit the agent
- `/clear` - Clear conversation history
- `/help` - Show help

## Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents with line numbers |
| `glob` | Find files by pattern |
| `grep` | Search file contents with regex |
| `bash` | Execute shell commands |
| `write` | Create or overwrite files |
| `edit` | Find and replace text in files |

## Notes

- Dangerous commands (rm, sudo, git push) require confirmation
- File overwrites and edits require confirmation
- API key is stored in `~/.simple-agent-auth.json`
