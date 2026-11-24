#!/usr/bin/env node
// Creates a new draft post. Usage: npm run new -- "My post title" tech
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { categories } = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const keys = categories.map((c) => c.key);
const [title, category = 'tech'] = process.argv.slice(2);

if (!title || !keys.includes(category)) {
  console.error(`Usage: npm run new -- "Post title" <${keys.join('|')}>`);
  process.exit(1);
}

const d = new Date();
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const file = path.join(ROOT, 'content/posts', `${date}-${slug}.md`);
if (fs.existsSync(file)) { console.error(`Already exists: ${file}`); process.exit(1); }

const extra = category === 'projects' ? 'status: In progress\nstack: []\nlink:\nrepo:\n' : '';
fs.writeFileSync(file, `---
title: ${title.includes(':') ? JSON.stringify(title) : title}
date: ${date}
category: ${category}
summary:
${extra}draft: true
---

Start writing here.
`);
console.log(`Created ${path.relative(ROOT, file)}\nIt's a draft: it shows in "npm run dev" but not on the live site until you delete "draft: true".`);
