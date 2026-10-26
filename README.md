# Chez Professional — Mobile Landing Page

Static mobile landing page built from the Chez Professional Figma design, with a cart,
CHIP checkout and an orders admin.

Open `index.html` in a browser, or serve locally:

```bash
python3 -m http.server 5173
```

Locally (and anywhere without the server functions) checkout runs in demo mode.

When `styles.css`, a script, or an image is replaced under the same file name, update the
`?v=` value where it is used (e.g. `md5 -q styles.css | cut -c1-8`) so phones don't keep an
old cached copy. Cloudflare tells browsers to keep files for 4 hours.

## Hosting

Cloudflare Pages project `chez-professional`, connected to this repo: pushing to `main`
deploys www.chezprofessional.com; other branches get a preview at
`<branch>.chez-professional.pages.dev`. No build step, output directory `/`.
chezprofessional.com redirects to www through a Cloudflare Redirect Rule.

`functions/` runs on Cloudflare: `/api/checkout` creates the CHIP payment (prices come from
`products.js`, never from the browser), `/api/chip-callback` marks orders paid after checking
CHIP's signature, and `/api/admin/*` serves the orders admin at `/admin`.

Settings in the Pages project (Settings → Variables and secrets / Bindings), per environment:

| Name | Type | Value |
|---|---|---|
| `DB` | D1 binding | `chez-orders` |
| `CHIP_BRAND_ID` | Text | CHIP → Developers → Brands |
| `CHIP_SECRET_KEY` | Secret | CHIP → Developers → API Keys (test or live) |
| `CHIP_TEST_MODE` | Text | `1` while using CHIP test keys; remove for live |
| `ADMIN_PASSWORD` | Secret | admin sign-in password, at least 12 characters |

Checkout stays in demo mode until `DB`, `CHIP_BRAND_ID` and `CHIP_SECRET_KEY` are all set.
Changes to these settings take effect on the next deployment.
