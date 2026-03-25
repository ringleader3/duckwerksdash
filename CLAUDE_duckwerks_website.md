# CLAUDE.md — The DuckWerks (duckwerks.com)

## What This Is
Personal website for Geoff Goss. Eleventy static site replacing a broken WordPress install.
Hosted on HostGator shared hosting, deployed via SSH/rsync.

## Stack
- **Framework:** Eleventy (11ty) v2
- **Templates:** Nunjucks (.njk)
- **Content:** Markdown (.md) for blog posts
- **Styles:** Single CSS file, dark theme — `src/css/style.css`
- **Hosting:** HostGator — gator3314.hostgator.com
- **cPanel user:** duckwrks

## Key Commands
```bash
npm start          # dev server at http://localhost:8080
npm run build      # build to _site/
./deploy.sh        # build + rsync to live site (~5 seconds)
```

## Project Structure
```
src/
├── _data/site.js          # global site data (title, author, nav)
├── _includes/layouts/
│   ├── base.njk           # main HTML wrapper
│   └── post.njk           # blog post layout
├── css/style.css          # all styles
├── index.njk              # home page
├── professional/index.njk # professional projects
├── music/index.njk        # music projects
├── blog/
│   ├── index.njk          # blog listing
│   └── posts/             # blog posts as .md files
└── images/                # site images

_site/                     # BUILD OUTPUT — upload this to HostGator, don't edit
```

## ⚠️ NEVER TOUCH
- `public_html/podcast/` on the server — live PHP podcast app (B.A.D. Guys)
- `flipupproductions.com/` and `thejunkyardacademy.com/` on the server — separate sites
- The `--filter='protect podcast/'` line in deploy.sh — it protects the podcast from rsync --delete

## Site Pages
| Page         | URL              | File                        |
|--------------|------------------|-----------------------------|
| Home         | /                | src/index.njk               |
| Professional | /professional/   | src/professional/index.njk  |
| Music        | /music/          | src/music/index.njk         |
| Blog index   | /blog/           | src/blog/index.njk          |
| Blog posts   | /blog/posts/[slug]/ | src/blog/posts/[slug].md |

## Adding Content

**New blog post** — create `src/blog/posts/my-title.md`:
```markdown
---
layout: layouts/post.njk
title: "Post Title Here"
date: 2026-03-05
description: "One sentence summary"
tags:
  - post
---
Content here in plain Markdown.
```

**New project card** — copy/paste into the relevant index.njk:
```html
<div class="project-card">
  <div class="project-card-body">
    <h2>Project Name</h2>
    <p class="project-meta">Year — Role</p>
    <p>Short description.</p>
  </div>
  <a href="#" class="project-link">Learn more →</a>
</div>
```

## Content Workflow — Google Docs → Site

Three .docx template files are saved in the repo (or Downloads):
- `duckwerks-blog-template.docx`
- `duckwerks-professional-template.docx`
- `duckwerks-music-template.docx`

**Workflow:**
1. Open a template in Google Docs and fill in the content
2. Share the doc: "Anyone with the link can view"
3. Paste the link to Claude in a new chat session
4. Claude reads the doc and outputs ready-to-paste code:
   - Blog → `.md` file for `src/blog/posts/`
   - Professional/Music → HTML project card blocks for the relevant `index.njk`

## Current Status (2026-03-07)
- Site is live at duckwerks.com with hero image, industrial dark theme, 3-column card grid
- Full CSS design system in place (Bebas Neue + DM Sans + DM Mono, CSS custom properties)
- Per-page color theming via `pageClass` front matter (see Design System below)
- Blog, Professional, and Music all use consistent `project-list` / `project-card` layout with per-page accent colors
- Professional page has real content: 4 job cards with JS expand/collapse for details
- Music page has real content: 4 project cards with external links
- Blog post layout fixed: correct CSS classes, red-accented date, proper typography — matches blog index look and feel
- Home page intro is still placeholder — needs real bio
- B.A.D. Guys podcast not yet added as a card on the Music page
- No 404 page yet, no contact page yet
- GitHub: https://github.com/ringleader3/duckwerks (private)

## What Geoff Wants
- **Home:** Clean intro — who he is, links to the three sections
- **Professional:** Showcase of projects (not a resume)
- **Music:** Musical projects; B.A.D. Guys podcast already linked
- **Blog:** Low-pressure occasional writing in Markdown
- **Design:** Industrial dark — Bebas Neue display font, warm white on near-black

## Design System
**Fonts:** Bebas Neue (headings) · DM Sans (body) · DM Mono (labels/meta/nav)

**Accent colors per page** — set via `pageClass` in front matter, applied to `<main>`:
| Page         | pageClass             | Accent color |
|--------------|-----------------------|--------------|
| Professional | `page--professional`  | cyan `#00c8d4` |
| Music        | `page--music`         | amber `#f5a623` |
| Blog         | `page--blog`          | red `#f87171` |

**Key CSS vars:** `--cyan`, `--cyan-dim`, `--amber`, `--amber-dim`, `--green`, `--red`, `--red-dim`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-base`, `--bg-surface`, `--bg-raised`

## Claude Code Workflow Notes
- Do NOT use the VS Code inline suggestion/popup widget to apply edits — always let Claude Code apply file changes directly via its tools. Interrupting mid-edit with the popup causes partial or failed edits.
- At the start of each session, ask Geoff for permission before making any file edits. Wait for explicit approval ("yes", "go ahead", etc.) before applying changes. Continue asking per-change until Geoff says otherwise.

## Git Workflow
```bash
git add .
git commit -m "describe change"
git push           # saves to GitHub
./deploy.sh        # pushes to duckwerks.com
```
