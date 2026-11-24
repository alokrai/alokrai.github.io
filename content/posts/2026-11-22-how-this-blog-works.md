---
title: How this blog works
date: 2026-11-22
category: tech
summary: Markdown files in, a TV and a controller out. A tour of the build.
thanks: everyone who tried the first version
---

This site has no framework.[^1] It's a folder of Markdown files, one small Node build script, and a GitHub Action that publishes the result to GitHub Pages.

## Writing a post

Each post is a Markdown file in `content/posts/`. The top of the file holds a few settings:

```markdown
---
title: How this blog works
date: 2026-11-22
category: tech
summary: One line that shows up in lists and link previews.
thanks: the people who read drafts
---

The post starts here.
```

The `category` decides which channel the post shows up on: `tech`, `games`, `essays` or `projects`. Adding `draft: true` keeps a post visible on my machine but off the live site.

To start a new post from the terminal:

```bash
npm run new -- "My next post" games
```

## The build

The build script reads every post, turns the Markdown into HTML with [marked](https://marked.js.org), highlights code with [highlight.js](https://highlightjs.org), and writes one static page per post. It also writes the channel pages, an RSS feed and a sitemap.

```js
for (const p of posts) {
  await write(`posts/${p.slug}/index.html`, page(site, {
    mode: 'read',
    title: p.title,
    body: postBody(p),
  }));
}
```

Because every post is a real page with its own address, links work, search engines can read it, and it still works with JavaScript turned off.[^2] The TV and the controller are a layer on top.

## Footnotes and thanks

A footnote is `[^1]` in the text and a line starting with `[^1]:` anywhere in the file. The build numbers them in order and lists them under Notes at the end, each with a link back. A `thanks:` line in the settings adds a thank-you after the notes.

## The TV

Three details do most of the work:

1. **A quiet screen for reading.** Menus and channels are bright and playful. When you open a post, the TV and the controller stay where they are, but the screen turns to plain paper and everything else on it goes away. On a phone, the screen fills the phone instead and the controller folds into a strip at the bottom.
2. **One set of actions.** The keyboard, the controller and touch all call the same eight actions: up, down, left, right, A, B, OPTIONS and HOME. The knobs on the TV change channel, tint and sound.
3. **Real pages underneath.** Changing channel is an ordinary link. The static you see in between is a small canvas of noise played on the next page.

The thin line along the top of the screen fills up as you read.

[^1]: Not out of principle. The site is small enough that a framework would have been more code than the blog.
[^2]: Try it: switch JavaScript off and every page still loads. You lose the controller, but nothing you'd need to read.
