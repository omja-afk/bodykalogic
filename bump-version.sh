#!/bin/sh
# Stamp every local script/stylesheet in index.html with ?v=<timestamp>.
#
# GitHub Pages serves assets with a long cache lifetime, so without this a
# returning visitor keeps running the previous build until their browser decides
# otherwise — which is how a freshly deployed key sat there unused.
# Run this before committing a release.
V=$(date +%Y%m%d%H%M)
python3 - "$V" <<'PY'
import io, re, sys
v = sys.argv[1]
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
def stamp(m):
    attr, url = m.group(1), m.group(2)
    if url.startswith(('http://', 'https://', '//', 'data:')):
        return m.group(0)
    return '%s="%s?v=%s"' % (attr, url.split('?')[0], v)
s = re.sub(r'\b(src|href)="([^"]+\.(?:js|css|svg))(?:\?[^"]*)?"', stamp, s)
io.open(p, 'w', encoding='utf-8').write(s)
print('stamped assets with ?v=' + v)
PY
