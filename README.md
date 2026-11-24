# ALOK POCKET

The source for [alokrai.github.io](https://alokrai.github.io): a blog that looks like a small TV wired to a controller. Menus and channels are playful; posts turn the screen into quiet paper for reading.

## Everyday use

```bash
npm install          # once
npm run dev          # preview at http://localhost:4000, reloads on save
npm run new -- "Post title" tech    # start a draft (tech | games | essays | projects)
npm run qa           # test every page, button and key in Chrome at 6 screen sizes
```

Run `npm run qa` after changing the design or controls. It needs Google Chrome installed.

Publish by committing and pushing to `main`. GitHub Actions builds the site and deploys it in about a minute.

## Writing

Posts live in `content/posts/` as `YYYY-MM-DD-slug.md`:

```markdown
---
title: My post
date: 2026-11-23
category: tech
summary: One line for lists, RSS and link previews.
draft: true        # remove to publish
---

Markdown goes here.
```

Optional settings:

- `thanks: the people who read drafts` adds "Thanks to … for reading drafts of this." at the end.
- Projects (`category: projects`) can also set `status`, `stack: [A, B]`, `link` and `repo`.

Footnotes: write `[^1]` in the text and put `[^1]: The note.` on its own line anywhere in the file. They're numbered in order and listed under Notes at the end of the post, each with a link back.

Images go in `public/images/` and are referenced as `/images/name.png`.

The About page is `content/pages/about.md`. Site name, description and shelves are in `site.config.json`.

## Controls

| Action | Keyboard | Controller / TV |
| --- | --- | --- |
| Move, or scroll while reading | ↑ ↓ or J K | D-pad |
| Open, or next page while reading | Enter, Space or Z | A |
| Back | Esc, Backspace or X | B |
| Change channel / newer or older post | ← → | D-pad left and right |
| Next channel | | CHANNEL knob |
| Options (text size, tint, sound, random post) | O | OPTIONS |
| Cycle screen tint | T | TINT knob |
| Sound on/off | (in Options) | Speaker grille |
| Main menu | M | HOME |

Channels: 0 is the main menu, 1 is All posts, then one per category in the order of `site.config.json`.

On phones the controller sits under the TV. Opening a post makes the screen fill the phone, and the controller folds into a strip at the bottom (newer/older, OPTIONS, B) that hides while you scroll down.

## Layout

| Path | What it is |
| --- | --- |
| `content/` | Posts and pages (Markdown) |
| `public/assets/style.css` | All styling: the TV, controller, four screen tints and their paper versions for reading |
| `public/assets/app.js` | Controller, knobs, keyboard, cursor, sound, reading progress, phone strip and the cable |
| `scripts/templates.mjs` | HTML for every page |
| `scripts/build.mjs` | Builds `dist/` |
| `scripts/dev.mjs` | Local preview server |
| `scripts/qa.mjs` | Automated browser tests |
