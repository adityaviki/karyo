# Karyo

A CLI coding agent powered by Vercel AI SDK for multi-provider support.

## Setup

```bash
npm install
npm start -- --login
```

## Authentication

Supports multiple providers:

```bash
npm start -- --login
# Choose:
# 1. Anthropic API key (for Claude models)
# 2. Google API key (for Gemini models)
# 3. OpenAI API key (for GPT models)
```

You can add multiple keys to use different providers.

## Usage

```bash
# Start with default model (Claude Sonnet)
npm start

# Interactive model selection
npm start -- -s

# Use a specific model
npm start -- --model gemini-2.0-flash
npm start -- --model gpt-4o

# With specific directory
npm start -- --dir /path/to/project

# Check auth status
npm start -- --status

# Logout
npm start -- --logout
```

### Models

| Provider | Models |
|----------|--------|
| Anthropic | `claude-opus-4-5-20251101`, `claude-sonnet-4-20250514` (default), `claude-haiku-3-5-20241022` |
| Google | `gemini-2.0-flash`, `gemini-2.0-pro`, `gemini-1.5-pro` |
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `o1`, `o1-mini` |

### Commands

- `/exit` - Exit the agent
- `/clear` - Clear conversation history
- `/model` - Change the model
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

## Architecture

Built with [Vercel AI SDK](https://sdk.vercel.ai/) for unified multi-provider support:

```
streamText() → @ai-sdk/anthropic → Claude
            → @ai-sdk/google    → Gemini
            → @ai-sdk/openai    → GPT
```

## Notes

- Dangerous commands (rm, sudo, git push) require confirmation
- File overwrites and edits require confirmation
- API keys are stored in `~/.karyo-auth.json`
