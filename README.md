# Chez Professional — Mobile Landing Page

Static mobile landing page built from the Chez Professional Figma design.

Open `index.html` in a browser, or serve locally:

```bash
python3 -m http.server 5173
```

When `styles.css` or `script.js` changes, update the `?v=` value on its link in
`index.html` (e.g. `md5 -q styles.css | cut -c1-8`) so phones don't keep an old cached copy.
