"""Update the app from a newer Audy Expansion artifact HTML.

Usage: python scripts/split_artifact.py <audy-expansion.html>
Writes public/audy/page.html (markup + scripts) and public/audy/data.json (the embedded window.D data).
"""
import re, sys
h = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'<script>window\.D=(\{.*?\});</script>', h, re.S)
if not m: sys.exit('window.D data block not found')
open('public/audy/data.json', 'w', encoding='utf-8').write(m.group(1))
open('public/audy/page.html', 'w', encoding='utf-8').write(h[:m.start()] + '<script>window.D=window.__AUDY_DATA__;</script>' + h[m.end():])
print('ok: page', len(h) - len(m.group(1)), 'bytes, data', len(m.group(1)), 'bytes')
