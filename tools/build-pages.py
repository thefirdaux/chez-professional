#!/usr/bin/env python3
"""
Builds the product category pages (keratin-treatment.html, keratin-spray.html,
hair-tonic.html, combo-deals.html) from the matching sections of index.html.

index.html stays the one landing page with everything on it; these pages give Google
(and shared links) one address per product line. Run this after changing index.html,
then commit the pages it writes:

    python3 tools/build-pages.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://www.chezprofessional.com'

PAGES = [
    {
        'file': 'keratin-treatment.html',
        'section': 'keratin-shampoo-mask',
        'name': 'Keratin Treatment Shampoo & Mask',
        'description': 'Chez Professional Keratin Treatment Shampoo and Mask, 280ml. No SLS, no paraben. '
                       'Boosts hydration, repairs damage and smooths frizz for softer, healthier hair.',
    },
    {
        'file': 'keratin-spray.html',
        'section': 'keratin-spray',
        'name': 'Leave In Keratin Spray',
        'description': 'Chez Professional Leave In Keratin Spray, 135ml. Lasting moisture, heat protection '
                       'and added keratin for softer hair that is easier to style.',
    },
    {
        'file': 'hair-tonic.html',
        'section': 'hair-tonic',
        'name': 'Root Booster Hair Tonic',
        'description': 'Chez Professional Root Booster Hair Tonic, 135ml. Ginseng, biotin and menthol to '
                       'nourish hair roots and keep your scalp fresh, even under a hijab.',
    },
    {
        'file': 'combo-deals.html',
        'section': 'combos',
        'name': 'Combo Deals',
        'description': 'Save with Chez Professional combo deals: Keratin Treatment Shampoo + Mask, and '
                       'Leave In Keratin Spray + Root Booster Hair Tonic.',
    },
]


def esc(text):
    return text.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')


def between(html, start, end):
    """The text from `start` up to and including `end` (both must occur once, in order)."""
    i = html.index(start)
    j = html.index(end, i) + len(end)
    return html[i:j]


def build(index, page):
    url = SITE + '/' + page['file'][:-len('.html')]
    title = page['name'] + ' — Chez Professional'

    head = index[:index.index('<body>')]
    head = re.sub(r'<title>.*?</title>', '<title>' + esc(title) + '</title>', head)
    head = re.sub(r'(<meta name="description" content=")[^"]*', r'\g<1>' + esc(page['description']), head)
    head = re.sub(r'(<meta property="og:description" content=")[^"]*', r'\g<1>' + esc(page['description']), head)
    head = re.sub(r'(<meta property="og:title" content=")[^"]*', r'\g<1>' + esc(title), head)
    head = head.replace('<link rel="canonical" href="' + SITE + '/">', '<link rel="canonical" href="' + url + '">')
    head = head.replace('<meta property="og:url" content="' + SITE + '/">', '<meta property="og:url" content="' + url + '">')
    # The site name and logo live on the home page; here Google gets the page's place in the site
    breadcrumb = json.dumps({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': page['name'], 'item': url},
        ],
    }, indent=2)
    head = re.sub(r'  <!-- Tells Google the site.*?</script>\n',
                  '  <!-- Tells Google where this page sits in the site -->\n'
                  '  <script type="application/ld+json">\n' + breadcrumb + '\n  </script>\n',
                  head, flags=re.S)

    header = between(index, '    <header class="site-header">', '    </header>\n')
    header = header.replace('href="#top"', 'href="/"')
    match = re.search(r'      <!-- [^\n]*-->\n      <section [^>]*id="' + page['section'] + r'"[^>]*>.*?\n      </section>\n',
                      index, flags=re.S)
    section = match.group(0)
    footer = between(index, '    <footer class="site-footer">', '    </footer>\n')
    footer = footer.replace('<a href="/' + page['file'][:-5] + '">', '<a href="/' + page['file'][:-5] + '" aria-current="page">')
    sheets = between(index, '  <!-- Product bottom sheet', '  <div class="toast"')
    scripts = between(index, '  <div class="toast"', '</html>\n')

    head = head.replace('<!doctype html>\n', '<!doctype html>\n<!-- Built by tools/build-pages.py from index.html. Edit index.html, then run the script again. -->\n', 1)
    return (
        head + '<body>\n'
        '  <div class="page page--home page--category">\n'
        + header + '\n'
        '    <main id="top">\n'
        '      <div class="category-head section--beige">\n'
        '        <nav class="category-head__crumbs text-subheadline" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">›</span> <span aria-current="page">'
        + esc(page['name']) + '</span></nav>\n'
        '        <h1 class="category-head__title text-title3">' + esc(page['name']) + '</h1>\n'
        '      </div>\n\n'
        + section +
        '    </main>\n\n'
        + footer + '  </div>\n\n'
        + sheets + scripts
    )


def main():
    index = (ROOT / 'index.html').read_text()
    for page in PAGES:
        (ROOT / page['file']).write_text(build(index, page))
        print('wrote', page['file'])


if __name__ == '__main__':
    main()
