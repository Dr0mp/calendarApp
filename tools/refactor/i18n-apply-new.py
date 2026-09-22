import json, re, html as H, sys
sys.path.insert(0, 'tools/refactor')
from importlib import import_module
nk = import_module('i18n-new-keys'.replace('-', '_')) if False else None
ns = {}; exec(open('tools/refactor/i18n-new-keys.py', encoding='utf8').read(), ns)
KEYS, BY_VALUE, PREFIX = ns['KEYS'], ns['BY_VALUE'], ns['PREFIX']
todo = json.load(open('tools/refactor/i18n-todo.json'))
h = open('public/index.html', encoding='utf8').read()
# offsets from the JS tooling count UTF-16 code units; convert to Python indices
_u16 = h.encode('utf-16-le')
def py_index(js_offset): return len(_u16[:js_offset * 2].decode('utf-16-le'))
for r in todo: r['start'] = py_index(r['start'])
edits = []; skipped = []; used = set()
for r in todo:
    key = BY_VALUE.get((r['attr'], r['value'])) or next((k for p, k in PREFIX.items() if r['value'].startswith(p)), None)
    if not key: skipped.append((r['idx'], r['attr'], r['value'][:50])); continue
    edits.append((r['start'], r['attr'], key)); used.add(key)
by = {}
for s, a, k in edits: by.setdefault(s, []).append((a, k))
problems = []
for start in sorted(by, reverse=True):
    tag_end = h.index('>', start); tag = h[start:tag_end + 1]
    name = re.match(r'<([a-z0-9-]+)', tag).group(1)
    inner_new = None
    for attr, key in by[start]:
        ro = KEYS[key][0]
        if attr == 'text':
            close = h.index('</%s>' % name, tag_end)
            inner = h[tag_end + 1:close]
            if '<' in inner: problems.append((key, 'has child elements')); continue
            tag = tag.replace('<' + name, '<%s data-i18n="%s"' % (name, key), 1)
            inner_new = H.escape(ro, quote=False)
        else:
            tag = tag.replace('<' + name, '<%s data-i18n-%s="%s"' % (name, attr, key), 1)
            tag = re.sub(r'\s%s="[^"]*"' % re.escape(attr), ' %s="%s"' % (attr, H.escape(ro)), tag, count=1)
    if inner_new is not None:
        close = h.index('</%s>' % name, tag_end)
        h = h[:start] + tag + inner_new + h[close:]
    else:
        h = h[:start] + tag + h[tag_end + 1:]
open('public/index.html', 'w', encoding='utf8').write(h)
# add keys to both languages
js = open('public/src/data/i18n.js', encoding='utf8').read()
def js_str(s): return json.dumps(s, ensure_ascii=False)
all_keys = sorted(used | {'theme_switch_to_light', 'theme_switch_to_dark'})
ro_block = '\n    // Static markup labels (added by the data-i18n migration)\n' + ''.join('    %s: %s,\n' % (k, js_str(KEYS[k][0])) for k in all_keys)
en_block = '\n    // Static markup labels (added by the data-i18n migration)\n' + ''.join('    %s: %s,\n' % (k, js_str(KEYS[k][1])) for k in all_keys)
i_en = js.index('\n  en: {')
ro_end = js.rindex('\n  },', 0, i_en)
js = js[:ro_end].rstrip().rstrip(',') + ',' + ro_block.rstrip(',\n') + '\n' + js[ro_end:]
i_en = js.index('\n  en: {')
en_end = js.index('\n  }\n};', i_en)
js = js[:en_end].rstrip().rstrip(',') + ',' + en_block.rstrip(',\n') + js[en_end:]
open('public/src/data/i18n.js', 'w', encoding='utf8').write(js)
print('annotated', len(edits), 'keys', len(all_keys)); print('problems', problems); print('skipped', skipped)
