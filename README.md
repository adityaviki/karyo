# Karyo

A simplified CLI coding agent for personal use, inspired by Claude Code.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=your-key-here
npm start
```

## Usage

```bash
# Start in current directory
npm start

# Start in specific directory
npm start -- --dir /path/to/project

# Use a different model
npm start -- --model claude-sonnet-4-20250514
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
- Responses stream in real-time
