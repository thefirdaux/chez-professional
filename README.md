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
| `EASYPARCEL_CLIENT_ID` | Text | EasyParcel Developer Hub (api.easyparcel.com) → your application |
| `EASYPARCEL_CLIENT_SECRET` | Secret | same application; with the client ID it turns on courier booking in the admin |
| `EASYPARCEL_DEMO` | Text | `1` where the admin connects an EasyParcel **sandbox** (Preview); remove for live |

At checkout the city and state fill in from the postcode, using `assets/postcodes.json`
(built from the `malaysia-postcodes` package, ISC licence). A city the buyer types is never overwritten.

Postage: the buyer pays EasyParcel's cheapest courier rate for their address
(`/api/shipping-quote` shows it at checkout; `/api/checkout` works it out again), less
`shipping.covered` in `products.js` (RM4 in Malaysia, nothing abroad). The shop delivers to
Malaysia, Singapore and Brunei (`countries`). If EasyParcel isn't connected or doesn't answer,
Malaysian addresses use the estimates in `shipping.fallback`; Singapore and Brunei buyers are
asked to try again in a few minutes.

Checkout stays in demo mode until `DB`, `CHIP_BRAND_ID` and `CHIP_SECRET_KEY` are all set.
Changes to these settings take effect on the next deployment.

EasyParcel uses its Open API with OAuth. The Developer Hub application's Redirect URI must be
`<site>/api/easyparcel-callback` (add one for www.chezprofessional.com and one for each preview
you test on). In the admin, press **Connect EasyParcel** once and sign in to the client's
EasyParcel account; the tokens are kept in D1 (`settings` table) and refreshed automatically.

The admin's **Settings** page shows the CHIP setup (live or test, and the payment methods CHIP
has switched on), the EasyParcel connection and credit, and the postage rules.

Each paid order then has **Book courier**: it gets EasyParcel prices for the buyer's address,
books the chosen courier (paid from the EasyParcel credit straight away) and shows the A6 AWB
to print and the tracking link. Parcel weights and box sizes come from `parcels` in `products.js` (as the client packs each
product) and the weight can be changed before booking. Test orders can only be
booked while `EASYPARCEL_DEMO` is on, so a test payment never spends real credit.
