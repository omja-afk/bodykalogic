#!/bin/sh
# Stamp every local script/stylesheet in index.html with ?v=<timestamp>.
#
# GitHub Pages sends cache-control: max-age=600 on both the HTML and the assets,
# and their ages drift apart (a page can be served fresh while its scripts are 39
# seconds into their own window). Stamping ties each asset to the HTML that asked
# for it, so a newly fetched page can never pair with a stale script.
#
# It does NOT shorten the 10 minutes. For the first ten minutes after a push, a
# returning visitor may still be served the previous page and the previous assets
# together — consistent, just not new. Hard-refresh if you need it immediately.
V=$(date +%Y%m%d%H%M)
python3 - "$V" <<'PY'
import io, re, sys
v = sys.argv[1]
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
# A filename that already carries an 8-hex content hash is its own cache key —
# changing the file changes the URL. Stamping it would add a query string that
# says nothing, and query strings turned out not to be enough for the tab icon.
HASHED = re.compile(r'-[0-9a-f]{8}\.[a-z]+$')

def stamp(m):
    attr, url = m.group(1), m.group(2)
    if url.startswith(('http://', 'https://', '//', 'data:')):
        return m.group(0)
    if HASHED.search(url.split('?')[0]):
        return '%s="%s"' % (attr, url.split('?')[0])
    return '%s="%s?v=%s"' % (attr, url.split('?')[0], v)
s = re.sub(r'\b(src|href)="([^"]+\.(?:js|css|svg|png))(?:\?[^"]*)?"', stamp, s)
io.open(p, 'w', encoding='utf-8').write(s)
print('stamped assets with ?v=' + v)
PY
