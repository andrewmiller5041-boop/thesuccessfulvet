# The Successful Vet — Website

The marketing site and resource hub for **[thesuccessfulvet.com](https://thesuccessfulvet.com)** — a project helping transitioning military veterans navigate the move from uniform to civilian career.

Built by a veteran, for veterans.

---

## What this is

A single-page, single-file static website. No frameworks, no build step, no database. Just one `index.html` that contains all the HTML, CSS, JavaScript, and the book cover image (embedded as base64).

The site introduces visitors to:

- **The Book** — *The Successful Veteran: A Workbook Companion to Military Transition* ([Amazon](https://www.amazon.com/dp/B0DJL271C9))
- **The Newsletter** — free and paid tiers on [Substack](https://successfulvet.substack.com/)
- **The YouTube channel** — [@SuccessfulVet-h9d](https://www.youtube.com/@SuccessfulVet-h9d)
- **Coaching, speaking, and resume review** — direct support options
- **Eight free starter tips** every transitioning veteran can act on today

---

## Tech stack

| Component | Tool |
| --- | --- |
| Hosting | [Vercel](https://vercel.com) (Hobby tier — free) |
| Repository | GitHub (this repo) |
| Domain | thesuccessfulvet.com |
| Contact form backend | [Formspree](https://formspree.io) (free tier) |
| Fonts | Google Fonts — Fraunces (display) + Manrope (body) |
| Book cover | Embedded as inline base64 (single-file delivery) |

That's the entire dependency list. No npm, no Node, no build pipeline.

---

## Repository structure

```
.
├── index.html      ← The entire website (HTML + CSS + JS + book cover)
└── README.md       ← This file
```

That's it. There is no `src/`, no `dist/`, no config files. Edits happen directly to `index.html`.

---

## How to make edits

### Small edits (typos, copy changes, link updates)

1. Open `index.html` on GitHub
2. Click the pencil icon (top-right of the file view) to edit in-browser
3. Make the change
4. Scroll to the bottom, write a short commit message like `Fix typo in About section`
5. Click **Commit changes**

Vercel will detect the commit and auto-deploy in about 15–30 seconds. The live site updates automatically — no manual deployment needed.

### Larger edits (whole new sections, file replacements)

When working with a new version of `index.html`:

1. Open `index.html` on GitHub, click the pencil icon
2. Select all the existing content and delete it
3. Paste the new content
4. Commit

Or upload the new file as a replacement via **Add file → Upload files** (overwriting the existing one).

### Rolling back a bad change

If a change breaks something:

1. Go to your Vercel project → **Deployments** tab
2. Find the last good deployment in the list
3. Click the three-dot menu → **Promote to Production**

The previous version is instantly live again. No need to fix the file first.

---

## Deployment

Deployment is automatic. Every commit to the `main` branch triggers a Vercel build and deploy.

- **Production:** [thesuccessfulvet.com](https://thesuccessfulvet.com)
- **Preview URL (Vercel default):** `thesuccessfulvet.vercel.app`

To check deployment status, visit the Vercel project dashboard → Deployments tab.

---

## Contact form

The contact form at `#contact` posts to a Formspree endpoint. The destination email is configured *only* in the Formspree dashboard — it's never written into this repository, which means it can't leak in source code.

If the form ever needs to be rewired to a different provider, the only line to change is the form's `action` attribute (search for `formspree.io` in `index.html`).

**Formspree free tier:** 50 submissions per month. Plenty for inbound coaching, speaking, and reader inquiries.

---

## Local preview

Because the site is a single self-contained HTML file with no build step, previewing locally is as simple as double-clicking `index.html` to open it in any browser.

For a more accurate preview (closer to how Vercel will serve it), run a simple local server from the project folder:

```bash
# Python 3
python3 -m http.server 8000

# or Node (if installed)
npx serve
```

Then visit `http://localhost:8000` in your browser.

---

## Notes for future me

A few things worth remembering when revisiting this in six months:

- The book cover image is **embedded as base64 inside `index.html`** (look for `data:image/jpeg;base64,...`). If the book cover ever changes, the easiest update is to regenerate the base64 string from the new image file and replace the existing one.
- **No email address appears anywhere in the source HTML.** This is deliberate. All routing happens through Formspree. Do not add `mailto:` links.
- The tagline *"Don't panic. Transitioning out of the military is difficult — but it doesn't have to be hard."* appears in three places intentionally — the hero, the first "Start Here" tip, and the personal note section. The repetition is a refrain, not an oversight.
- **The "Need Help?" section** (formerly "Work With Me") is intentionally framed as optional support rather than a sales pitch. Don't let copy edits drift it back toward sales language. The site's tone is *resource first, services available if needed*.
- **The four-card Start Here / Build These sections** use cream and paper background alternation to create visual rhythm. If you ever add a third "tips" section, keep alternating (cream → paper → cream).

---

## Related properties

- **Book:** [The Successful Veteran on Amazon](https://www.amazon.com/dp/B0DJL271C9)
- **Newsletter:** [successfulvet.substack.com](https://successfulvet.substack.com/)
- **YouTube:** [@SuccessfulVet-h9d](https://www.youtube.com/@SuccessfulVet-h9d)

---

*Built by a veteran, for veterans.*
*— Andrew Miller*
