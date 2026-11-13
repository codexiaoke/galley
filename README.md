<p align="center">
  <img src="docs/assets/galley-icon.svg" width="88" height="88" alt="">
</p>

<h1 align="center">Galley</h1>

<p align="center">A self-hosted blog that agents run and you approve.</p>

<p align="center">
  <a href="https://github.com/codexiaoke/galley/actions/workflows/image.yml"><img src="https://github.com/codexiaoke/galley/actions/workflows/image.yml/badge.svg" alt="Build"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="https://github.com/codexiaoke/galley/pkgs/container/galley"><img src="https://img.shields.io/badge/ghcr.io-galley-0b7285.svg" alt="Container image"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

---

A *galley* is the proof a printer hands an editor before anything goes to press. That is the whole idea
here: an agent picks topics, writes drafts and maintains the knowledge behind them, and nothing reaches
a reader until you have read it and said yes.

Galley is one Docker container and one data directory. It calls no language model of its own — every bit
of intelligence comes from whichever agent you connect over [MCP](https://modelcontextprotocol.io), so
there are no model keys to configure and no vendor to lock into.

<p align="center">
  <img src="docs/assets/screenshot-article.jpg" width="800" alt="An article with its table of contents">
</p>

## Why it is built this way

- **Articles are assembled from knowledge, not typed once and forgotten.** Facts, concepts, code, data,
  and your own opinions and experiences live as *knowledge blocks*. An article is written in its own
  words and marks which passage rests on which block.
- **Change a block and every article that leans on it gets fixed.** Updating a block finds every passage
  citing it, asks the agent to rewrite those passages, and collects the result into one card for you.
- **Publishing is enforced by the program, not by the agent's good behaviour.** The MCP surface has no
  publish, unpublish, or permission-changing tool. Approval is the only way in.
- **No model keys, no lock-in.** Skills are served over MCP, so an agent that connects learns how to
  operate the site without any local setup.
- **Your data stays a file.** SQLite plus an images folder. Back it up by downloading one archive.

## How it works

1. You drop a thought, a link or a screenshot into the **inbox**. The agent turns it into knowledge
   blocks and proposes topics.
2. You accept a topic. The agent claims it, writes the article, cites blocks, and opens a **change set**.
3. You review: a rendered preview, a word-level diff, inline comments on any sentence. Then **approve**
   or **send it back**.
4. Approved work goes live. Later, when a block changes, every article resting on it comes back to you
   as a revision task.

<p align="center">
  <img src="docs/assets/screenshot-review.jpg" width="800" alt="Reviewing a change set in the admin">
</p>

## What you get

**Writing and knowledge**

- Six kinds of knowledge block (fact, concept, code, data, opinion, experience), full-text search,
  near-duplicate detection, source links, staleness tracking, version-pinned citations.
- Change sets with inline review comments, rejection rounds, and an audit trail of every decision.
- 30 MCP tools, per-agent access keys, a call log, and per-agent switches for every optional tool.
- Three editable skills (overview, writing, inbox) served over MCP, with revision history.

**Articles that do more than hold text**

- 17 components: callouts, charts, timelines, pull quotes, stat tiles, step-by-step code, flow diagrams,
  tabs, before/after comparisons, collapsible sections, quizzes, and more.
- Code blocks with syntax highlighting, filenames and highlighted lines; a table of contents; footnotes;
  image lightboxes; LaTeX via KaTeX; Mermaid diagrams validated at save time.
- **27 built-in algorithm animations** (sorting, search, mazes, graphs, trees, dynamic programming) that
  readers can play, step through and scrub, with switchable inputs and side-by-side races.
- **Code-driven animations**: write JavaScript in the article, run it in a QuickJS sandbox on the server,
  and the animation follows what the code actually did.
- **Runnable code blocks**: readers press Run and the code executes in a sandboxed worker in their own
  browser — no network, no DOM, with time and memory limits.

<p align="center">
  <img src="docs/assets/screenshot-algorithm.jpg" width="800" alt="An algorithm animation playing inside an article">
</p>

**Presenting**

- Any article turns into a full-screen slide deck: arrow keys step through code animations before turning
  the page, with speaker notes, autoplay and adjustable speed.
- Record it to MP4 entirely in your own browser — landscape or portrait, captions, microphone. Nothing is
  uploaded and the server does no work.
- Export the deck to PDF, one slide per page.

<p align="center">
  <img src="docs/assets/screenshot-present.jpg" width="800" alt="Presentation mode with the control bar">
</p>

**For readers**

- Three built-in themes (Book, Plain, Engineer), each with a dark variant, switched from the admin.
- Terms defined in the knowledge base get a hover definition the first time they appear.
- A site-wide knowledge graph, public revision history per article, series with previous/next links,
  share card images rendered server-side, RSS, sitemap, structured data, and full-text search.
- Visitor stats with no cookies and no third party: the visitor mark is salted per day and cannot be
  traced back after midnight.

**Running the site**

- Daily automatic backups kept on the server, plus a one-click full archive and restore.
- Email notification when something is waiting for you (standard SMTP, no provider lock-in).
- A guest book, an operations log you can make public, and reader analytics the agent can read to pick
  better topics.

## Quick start

### With Docker

You need Docker on the server. Nothing else.

```bash
git clone https://github.com/codexiaoke/galley.git && cd galley
```

```bash
./deploy.sh
```

The script asks for a port, an optional domain, and an admin password, writes them to `.env`, pulls the
image, starts it and waits until it is healthy. Give it a domain and it also runs Caddy for automatic
HTTPS. Images are built by GitHub Actions for both x86 and ARM, so the server only downloads — a 2-core
box is plenty.

See [docs/deployment.md](docs/deployment.md) for offline installs, building on your own machine and
shipping to the server, environment variables and day-to-day commands.

### Locally

Node.js 22 and pnpm.

```bash
pnpm install && cp .env.example .env.local
```

Set `GALLEY_ADMIN_PASSWORD` (8 characters or more) in `.env.local`, then:

```bash
pnpm dev
```

The site is on http://localhost:3000, the admin on `/admin`, the MCP endpoint on `/mcp`. Run
`pnpm seed:demo` if you want a few example articles to look at.

## Connect an agent

Add an agent on the admin's **MCP** page and it shows an access key once, along with a ready-made config
snippet. On the command line:

```bash
pnpm agent:create Codex
```

Put the key in `GALLEY_TOKEN` and add this to your Codex config:

```toml
[mcp_servers.galley]
url = "http://localhost:3000/mcp"
bearer_token_env_var = "GALLEY_TOKEN"
default_tools_approval_mode = "approve"
```

That last line stops Codex asking for approval on every call, which matters for unattended runs — and it
is safe, because none of the tools can publish anything.

There is also a plugin that skips the manual setup: download one pre-filled with your site's address from
the admin, or use the generic one in [integrations/codex](integrations/codex).

## Documentation

| Document | What is in it |
|---|---|
| [docs/requirements.md](docs/requirements.md) | What the product is and every feature's current state |
| [docs/design-knowledge-blocks.md](docs/design-knowledge-blocks.md) | Knowledge blocks, citations and change sets |
| [docs/deployment.md](docs/deployment.md) | Deployment in depth and environment variables |
| [AGENTS.md](AGENTS.md) | Conventions for anyone — human or agent — writing code here |

The design documents are written in Chinese.

## Project layout

| Path | What lives there |
|---|---|
| `src/core` | Data model, markup, and every business rule. No Next.js imports |
| `src/mcp` | The MCP server; each tool is a thin shell over core |
| `src/app` | Public site, admin, and the MCP endpoint |
| `src/render` | Turning article markup into pages |
| `skills` | Skills served to agents |
| `drizzle` | Database migrations |

Permission rules live only in `src/core`. The admin and MCP call the same functions and pass a different
identity, so there is one place where "who may do what" is decided.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Galley is a personal-scale
project by design: there is no plugin system and no theme marketplace, and the way to make it yours is to
fork it. The code is organised with that in mind.

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm test` | Run the tests |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Lint |
| `pnpm build` | Production build |
| `pnpm db:generate` | Generate a migration after changing the schema |

## License

[MIT](LICENSE)
