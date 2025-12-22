# Site Blocker

**An AI-mediated site blocker for macOS.** Designed for use with terminal-based AI agents like [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or [Codex CLI](https://github.com/openai/codex).

Instead of just blocking sites, this tool gives your AI assistant instructions to offer **gentle pushback** when you ask to unblock — suggesting alternatives before complying.

## How It Works (With an AI Agent)

When you ask your AI agent to unblock a site:

```
You: "unblock twitter"

Agent: "Before I unblock Twitter — two options:
  1. Same-need: What specifically are you hoping to find? I can look it up.
  2. Different gear: 5-min mobility circuit — done at 5 minutes.

  Or 10 min window, your call."

You: "just do it"

Agent: "Done. Twitter unblocked for 10 min. Auto-reblocks at 2:45 PM."
```

The AI reads `claude.md` / `AGENTS.md` (agent instructions) which tells it to:
- Offer 2 concrete alternatives before unblocking
- Suggest a Break Card (500+ activities like stretches, walks, breathing exercises)
- Comply immediately when you say "just do it" — no lectures
- Track usage patterns and calibrate friction accordingly

**This is autonomy-supportive, not paternalistic.** You always get what you ask for. The AI just adds a brief pause and better options.

## Requirements

- **macOS** (uses `/etc/hosts` and `launchd`)
- **Node.js 24+** (uses built-in `node:sqlite`)
- **pnpm** (package manager)
- **An AI agent** like Claude Code or Codex CLI

```bash
# Check Node version (must be 24+)
node --version

# Install pnpm if needed
npm install -g pnpm
```

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/yourusername/site-blocker.git ~/Dev/site-blocker
cd ~/Dev/site-blocker
pnpm install
pnpm build
```

### 2. Set up passwordless sudo

The blocker edits `/etc/hosts`, which requires sudo. For your AI agent to run commands without prompting you for a password:

```bash
# Create sudoers entry (replace YOUR_USERNAME with your actual username)
sudo tee /etc/sudoers.d/site-toggle << 'EOF'
YOUR_USERNAME ALL=(ALL) NOPASSWD: /Users/YOUR_USERNAME/Dev/site-blocker/site-toggle
EOF

# Fix permissions
sudo chmod 440 /etc/sudoers.d/site-toggle
```

**Verify it works:**
```bash
sudo ~/Dev/site-blocker/site-toggle doctor
```

You should NOT be prompted for a password.

> **Security note:** Passwordless sudo means any process on your machine can run `site-toggle` as root. The script only modifies `/etc/hosts` and is open source for you to audit. If this concerns you, skip this step and enter your password each time, or review the code first.

### 3. Set up the block page server

When you visit a blocked site, you'll see a friendly block page instead of an error. This requires a local HTTP server on port 80.

**Generate your plist from the template:**

```bash
# Replace __REPO_PATH__ with your actual repo path
sed 's|__REPO_PATH__|/Users/YOUR_USERNAME/Dev/site-blocker|g' \
  ~/Dev/site-blocker/com.siteblocker.plist.template \
  > ~/Dev/site-blocker/com.siteblocker.plist
```

**Then install and load it:**

```bash
# Copy to LaunchDaemons
sudo cp ~/Dev/site-blocker/com.siteblocker.plist /Library/LaunchDaemons/

# Load it
sudo launchctl load /Library/LaunchDaemons/com.siteblocker.plist

# Verify it's running
curl http://127.0.0.1
```

You should see the block page HTML.

### 4. Seed the database

This loads the Break Cards and site definitions:

```bash
~/Dev/site-blocker/site-toggle seed
```

### 5. Set your context

Tell the system where you are (affects which Break Cards are suggested):

```bash
# If you're at home
~/Dev/site-blocker/site-toggle context set home

# If you're at a coworking space
~/Dev/site-blocker/site-toggle context set coworking
```

### 6. Block the sites!

```bash
sudo ~/Dev/site-blocker/site-toggle off
```

Done! Twitter, Reddit, and 20+ news sites are now blocked.

### 7. Point your AI agent to the instructions

The key files are `claude.md` and `AGENTS.md` — they contain detailed instructions for how your AI agent should handle unblock requests. Most AI coding tools (Claude Code, Codex CLI, Cursor, etc.) automatically read markdown files like this from your project.

For many agents, the `AGENTS.md` file is automatically loaded when you're in the repo directory.

## Usage with AI Agents

Once set up, just talk to your AI agent naturally:

- **"unblock twitter"** — Agent offers alternatives, then complies
- **"unblock reddit for 5 minutes"** — Agent can honor specific durations
- **"unblock everything"** — Agent will ask which site you actually need
- **"just do it"** — Agent complies immediately, no more friction

The agent uses these commands under the hood:

```bash
# Generate break menu with alternatives
./site-toggle break twitter --json

# Execute user's choice
sudo ./site-toggle choose <event_key> feed --json   # unblock
./site-toggle choose <event_key> card --json        # do the break card instead
```

See `claude.md` / `AGENTS.md` for the full agent protocol.

## Manual CLI Usage

You can also use the CLI directly without an AI agent:

```bash
# Check what's blocked
sudo ~/Dev/site-blocker/site-toggle status

# Unblock a specific site for 10 minutes
sudo ~/Dev/site-blocker/site-toggle on twitter 10

# Unblock all sites for 15 minutes
sudo ~/Dev/site-blocker/site-toggle on "" 15

# Block everything again
sudo ~/Dev/site-blocker/site-toggle off

# Get 2 random Break Card suggestions
~/Dev/site-blocker/site-toggle suggest 2

# See usage stats
~/Dev/site-blocker/site-toggle stats

# Rate a card (affects future suggestions)
~/Dev/site-blocker/site-toggle rate 42 love   # show more often
~/Dev/site-blocker/site-toggle rate 42 ban    # never show again
```

## Practice Modules (Optional)

The repo supports plugin-like **practice modules** (Spanish, strength, writing, etc.). Modules are defined in `data/modules/*.json` and typically match cards by tags (e.g. Spanish cards have the `spanish` tag).

Modules track:
- **Served** cards (shown/suggested to you)
- **Sessions** (started practices) with completion status (`completed`, `partial`, `abandoned`)

```bash
# List installed modules
~/Dev/site-blocker/site-toggle modules

# Show last week of Spanish module activity (sessions + served suggestions)
~/Dev/site-blocker/site-toggle module spanish history --days 7 --limit 10

# Continue the most recent open session (does not create a new session)
~/Dev/site-blocker/site-toggle module spanish resume

# Redo the most recent practice as a new attempt
~/Dev/site-blocker/site-toggle module spanish last

# Mark the most recent open session as completed
~/Dev/site-blocker/site-toggle module spanish complete --status completed
```

## Blocked Sites

**Social:** twitter/x.com, reddit

**News:** nytimes, cnn, bloomberg, wsj, cnbc, ft, marketwatch, businessinsider, reuters, theatlantic, washingtonpost, theguardian, bbc, npr, politico, axios, vox

**Tech:** techcrunch, theverge, wired, arstechnica

## Break Cards

Break Cards are 1-10 minute alternative activities with clear done-conditions:

- **Physical**: stretches, walks, core exercises
- **Restorative**: breathing exercises, tea rituals, sensory resets
- **Creative**: sketching, writing prompts, voice memos
- **Social**: text a friend, voice message someone
- **Work momentum**: close 5 tabs, write 3 TODOs, ship one tiny thing

Cards are filtered by your **context**:
- `home` — includes floor exercises, neighborhood walks, kitchen activities
- `coworking` — desk-appropriate only (no floor exercises, no location-specific walks)

### AI-assisted cards

Some cards include an optional `prompt` field: a ready-to-copy AI prompt you can paste into ChatGPT/Claude (or ask your agent to run directly).

## Customization

### Add your own Break Cards

Create a JSON file in `data/cards/`:

```json
[
  {
    "key": "physical.my_custom_stretch.v1",
    "category": "physical",
    "minutes": 3,
    "activity": "Do my favorite stretch",
    "done_condition": "when you've held for 30 seconds each side",
    "prompt": "Coach me through this stretch. Ask me what feels tight, then give form cues and a 3-minute timer structure.",
    "location": "any",
    "rarity": "common",
    "tags": ["stretch", "reset"],
    "active": true
  }
]
```

Then run `~/Dev/site-blocker/site-toggle seed` to load it.

### Add a new context/location

```bash
# Add a new location
~/Dev/site-blocker/site-toggle locations add coffee_shop "Coffee Shop"

# Add a new context
~/Dev/site-blocker/site-toggle contexts add cafe "Café"

# Link locations to the context
~/Dev/site-blocker/site-toggle contexts link cafe any
~/Dev/site-blocker/site-toggle contexts link cafe indoor
```

### Add a new site to block

Edit `packages/core/src/seed/sites.ts`, add your site definition, then:

```bash
pnpm build
sudo ~/Dev/site-blocker/site-toggle off
```

## Technical Details

1. **`/etc/hosts`** — Maps blocked domains to `127.0.0.1`
2. **LaunchDaemon** — Python HTTP server on port 80 serves a friendly block page
3. **SQLite** — Stores Break Cards, ratings, events, and context settings
4. **Auto-reblock** — Background timer re-blocks after your specified minutes
5. **macOS notifications** — Alerts when sites are re-blocked

## Durable Timers (Optional)

By default, auto-reblock timers don't survive system restarts. To make them durable:

```bash
sudo ~/Dev/site-blocker/site-toggle daemon install
```

This installs a LaunchDaemon that checks the database every 60 seconds and enforces any pending re-blocks.

## Complete Removal

```bash
# 1. Stop and remove LaunchDaemons
sudo launchctl unload /Library/LaunchDaemons/com.siteblocker.plist
sudo rm /Library/LaunchDaemons/com.siteblocker.plist
sudo launchctl unload /Library/LaunchDaemons/com.siteblocker.timers.plist 2>/dev/null
sudo rm /Library/LaunchDaemons/com.siteblocker.timers.plist 2>/dev/null

# 2. Remove sudoers entry
sudo rm /etc/sudoers.d/site-toggle

# 3. Unblock all sites (cleans /etc/hosts)
sudo ~/Dev/site-blocker/site-toggle on

# 4. Flush DNS
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder

# 5. Remove the database
rm -rf ~/Library/Application\ Support/Site\ Blocker/

# 6. Delete the repo
rm -rf ~/Dev/site-blocker
```

## Troubleshooting

**Sites still loading?**
```bash
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```
Also try incognito mode or clearing browser cache.

**Block page not showing?**
```bash
curl http://127.0.0.1  # Should show HTML
cat ~/Dev/site-blocker/server.log  # Check for errors
```

**Passwordless sudo not working?**
```bash
sudo visudo -c -f /etc/sudoers.d/site-toggle  # Check syntax
cat /etc/sudoers.d/site-toggle  # Verify your username is correct
```

**Doctor command shows issues?**
```bash
~/Dev/site-blocker/site-toggle doctor
```
This checks Node version, database, sudo access, and more.

## Files

| Path | Purpose |
|------|---------|
| `site-toggle` | CLI wrapper script |
| `claude.md` | **Instructions for AI agents** |
| `AGENTS.md` | **Instructions for AI agents** (some tools prefer this) |
| `packages/cli/` | TypeScript CLI source |
| `packages/core/` | Database, selection engine, hosts manipulation |
| `data/cards/*.json` | Break Card definitions |
| `index.html` | Block page shown when visiting blocked sites |
| `com.siteblocker.plist.template` | LaunchDaemon template (edit paths before use) |

## License

MIT
