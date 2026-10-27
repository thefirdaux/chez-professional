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
| `ADMIN_USERNAME` | Text | admin sign-in username (not case-sensitive); if unset, only the password is checked |
| `EASYPARCEL_API_KEY` | Secret | EasyParcel → Integrations → API (Individual API); turns on courier booking in the admin |
| `EASYPARCEL_DEMO` | Text | `1` to use EasyParcel's demo server (Preview); remove for live |

At checkout the city and state fill in from the postcode, using `assets/postcodes.json`
(built from the `malaysia-postcodes` package, ISC licence). A city the buyer types is never overwritten.

Checkout stays in demo mode until `DB`, `CHIP_BRAND_ID` and `CHIP_SECRET_KEY` are all set.
Changes to these settings take effect on the next deployment.

In the admin, each paid order has **Book courier**: it gets EasyParcel prices for the buyer's
address, books the chosen courier, pays from the client's EasyParcel credit and shows the AWB
to print and the tracking link. Parcel weights come from `weights` in `products.js` (estimates
until the client weighs the products) and can be changed before booking. Test orders can only be
booked while `EASYPARCEL_DEMO` is on, so a test payment never spends real credit.
