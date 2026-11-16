# huijunjin.github.io

Personal homepage of Huijun Jin, served by GitHub Pages at <https://huijunjin.github.io>.

The site is plain HTML, CSS and JavaScript. There is no template, no Jekyll and no
build step (`.nojekyll` tells GitHub Pages to serve the files as they are), so a
change to a file is live about a minute after it is pushed to `main`.

## Files

```
index.html               home page: intro, research, demo, publications, education/talks/patents/honors
cv/index.html            the HTML CV
files/Huijun_Jin_CV.pdf  the CV as a PDF (linked from the header and the hero)
images/
  profile_picture.jpg    the portrait (square)
  demo-preview.jpg       the demo's first screen, 1200 x 675
demo/index.html          the interactive research demo, one self-contained file
assets/
  site.css               all styles; colours, fonts and sizes are the tokens at the top
  site.js                header, theme switch, e-mail copy button, hero animation, card glyphs
  hnsw.js                the 2-D HNSW the hero animation runs (shared with the demo)
publications/  about/  resume/
                         redirects from the old template's addresses
```

## Common edits

Every section of the home page is marked with an `id` in `index.html`
(`#research`, `#demo`, `#publications`, `#record`), so search for it first.

### Intro text and links
In `index.html`, the hero is the first `<section class="hero">`.
- The paragraph is `<p class="lede">`.
- The availability line is `<p class="status">`. Delete the line to hide it.
- The buttons (CV, Google Scholar, GitHub, ORCID) are the `<a class="chip">` links.

### Add a publication
In `index.html`, under `<ol class="pubs">`, copy one `<li class="pub">` block and edit it.
Papers are listed newest first.

```html
<li class="pub">
  <div class="where"><b>VENUE 2027</b>Conference</div>
  <div>
    <div class="title">Paper title</div>
    <div class="authors"><span class="me">Huijun Jin</span>, Coauthor One, Sanghyun Park</div>
    <div class="venue-full">Full venue name, 2027.</div>
    <div class="acts"><a href="https://doi.org/...">Paper</a><a href="https://github.com/...">Code</a></div>
  </div>
</li>
```

- Wrap your own name in `<span class="me">` so it is underlined.
- `class="pub dh"`, `pub pro` or `pub camp` colours the venue label like the
  matching research card (DHNSW violet, PRO-HNSW green, CAMP-HNSW orange). Leave
  the class as plain `pub` for other papers.
- Add the same paper to `cv/index.html` (section "Publications").
- Korean papers go in the `<details class="more">` list below; update the count
  in its `<summary>`.

### When CAMP-HNSW gets a public link (PVLDB page or DOI)
Add `<a href="...">Paper</a>` as the first link in three places:
1. `index.html`, the research card `<article class="move camp">`, inside `<div class="acts">`
2. `index.html`, the CAMP-HNSW `<li class="pub camp">`, inside `<div class="acts">`
3. `cv/index.html`, the CAMP-HNSW entry

### Education, talks, patents, honors (home page)
In `index.html` under `<section id="record">`, each item is one line:

```html
<li><span class="when">2027</span><span class="what"><b>Title</b>, place or detail</span></li>
```

### CV
- Replace `files/Huijun_Jin_CV.pdf` with the new PDF under the same name.
- Edit the matching section in `cv/index.html`. A dated entry looks like this:

```html
<div class="row"><div><b>Role or title</b>, organisation<div class="sub">One line of detail.</div></div><span class="when">Mar 2027 – present</span></div>
```

### Photo
Replace `images/profile_picture.jpg` with a square image (600 x 600 or larger).

### The demo
The demo is built from its own source, outside this repository. After changing it there:
1. Build it (`python3 tools/bundle.py index.html` in the demo folder).
2. Copy the demo's `dist/demo.html` over `demo/index.html` here.
3. If its first screen changed, replace `images/demo-preview.jpg` (1200 x 675, the
   intro scene in English).

Links into the demo open a scene directly and in English, for example
`demo/?lang=en#repair`. The scenes are `intro`, `density`, `repair`, `shortcut`,
`versus` and `perf`.

### Colours, fonts and spacing
All of them are tokens at the top of `assets/site.css`. The light values are in
the first `:root` block; the dark values are repeated in two blocks right below
it (one for the system setting, one for the theme switch). Change a dark value in
both blocks.

The research colours are the same as in the demo: `--density` (DHNSW),
`--repair` (PRO-HNSW), `--shortcut` (CAMP-HNSW), and `--accent` for search.

### Menu
The header menu is the `<nav class="nav">` near the top of both `index.html` and
`cv/index.html`. Keep the two in step.

## Preview before pushing

Open `index.html` in a browser, or run a local server from this folder:

```
python3 -m http.server 8000
```

and open <http://localhost:8000>. Check a phone-width window and both themes (the
moon/sun button in the header) before pushing.

## Publish

```
git add -A
git commit -m "Describe the change"
git push origin main
```

Editing a file in the GitHub web editor and committing to `main` works the same way.
GitHub Pages serves the new version about a minute later. Every earlier version
stays in the git history and can be restored.

## Old addresses

`/cv/` is unchanged. `/publications/`, `/about/` and `/resume/` are small redirect
pages to the new home page or CV, so links to the old template's pages keep working.
