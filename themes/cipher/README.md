# Cipher

A minimal Hugo theme for technical writing — **editorial × terminal**.
Clean reading typography with monospace accents, first-class code blocks,
light/dark toggle, table of contents, search, KaTeX and Mermaid.

Built for **easy customization** (everything lives in CSS variables) and
**efficiency** (plain CSS + a tiny dependency-free JS file, no build step,
no web-font downloads — works with regular *and* extended Hugo).

---

## Enable it

In your site config (`config.yaml`):

```yaml
theme: cipher
```

Then run `hugo server`.

---

## Customization — the 30-second version

Open [`assets/css/main.css`](assets/css/main.css). The **only** area you
usually touch is the top of the file:

```css
:root {
  --accent: #0f9d6e;        /* links / highlights in light mode */
  --content-width: 46rem;   /* reading measure */
  --font-sans: ...;         /* body font */
  --font-mono: ...;         /* code + UI accents */
}
html.dark {
  --accent: #3ddc84;        /* links / highlights in dark mode */
}
```

Change `--accent` (two lines) and the whole theme follows: links, tags,
active TOC item, the terminal prompt, headings anchors, code inserts, etc.

Palettes, code-highlighting colors, spacing — all documented inline as
CSS variables. No SCSS to compile.

---

## Site parameters

All optional; sensible defaults live in the theme's `config.toml`.

```yaml
params:
  brand: "Alessio Maddaluno"     # header text (falls back to site title)
  prompt: "~$"                    # terminal prefix before the brand ("" to hide)
  greet: "Hello :)"               # homepage heading
  subtitle: "..."                 # appended to the <title> on the home page
  defaultTheme: system            # system | light | dark
  switch: ["🌚", "🌝"]            # [dark-icon, light-icon] for the toggle
  displayDate: true
  displayDescription: true
  displayReadingTime: true
  toc: true                       # per-post override with front matter `toc: false`
  selectable: true

  author:
    name: Alessio Maddaluno
    status: "Currently living on Earth 🌍"
    avatar: https://avatars.githubusercontent.com/u/39380241?v=4
    description: "Short bio shown on the homepage."

  social:
    - name: email
      url: "mailto:you@example.com"
    - name: github
      url: "https://github.com/you"
    - name: rss
      url: "index.xml"

  math:    { enable: true, provider: katex }
  diagram: { enable: true, provider: mermaid }

  search:
    enable: true
    title: "Search"
    placeholder: "type to search"
```

### Menu

```yaml
menu:
  main:
    - { identifier: home,   name: Home, weight: 1 }
    - { identifier: tags,   name: Tags, weight: 2 }
    - { identifier: search, name: 🔍,   weight: 3 }   # needs a search page (below)
```

### Search page

Create `content/search.md`:

```yaml
---
title: Search
layout: search
---
```

Make sure the home output includes JSON (used as the search index):

```yaml
outputs:
  home: [HTML, RSS, JSON]
```

### Social icons

Icons are inline SVGs in [`data/svg.toml`](data/svg.toml), matched by the
social entry's `name`. Add your own key there, or pass `svg: "<svg>…</svg>"`
directly on a social entry.

---

## Per-post front matter

```yaml
---
title: "My post"
date: 2025-10-19
description: "One-line summary shown in lists and under the title."
tags: ["ctf", "web"]
toc: false        # hide the TOC on this post
math: true        # force KaTeX on this post
diagram: true     # force Mermaid on this post
draft: false
---
```

## Feature parity notes

- **Code**: uses Hugo's Chroma classes; colors are theme-variable driven, so
  code re-colors with the light/dark toggle.
- **TOC**: sticky sidebar on wide screens (≥1180px), collapsible box on mobile,
  with scroll-spy highlighting the current section.
- **Reading time**: from Hugo's `.ReadingTime`.

## License

MIT.
