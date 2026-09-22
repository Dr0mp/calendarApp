# Helpers for the hardcoded-string sweep: exact replacements + new keys appended to both languages.
import json
ROOT = '/root/cal/public/src/'
NEW_KEYS = {}
def R(path, pairs):
    s = open(ROOT + path, encoding='utf8').read()
    for a, b in pairs:
        n = s.count(a)
        assert n >= 1, (path, a[:90])
        s = s.replace(a, b)
    open(ROOT + path, 'w', encoding='utf8').write(s)
def K(**kw):
    for k, v in kw.items(): NEW_KEYS[k] = v
def flush(section):
    p = ROOT + 'data/i18n.js'
    js = open(p, encoding='utf8').read()
    existing = set()
    import re
    for m in re.finditer(r'^\s{4}([a-z0-9_]+):', js, re.M): existing.add(m.group(1))
    keys = [k for k in NEW_KEYS if k not in existing]
    dup = [k for k in NEW_KEYS if k in existing]
    if dup: print('already present (skipped):', dup)
    if not keys: return
    js_str = lambda s: json.dumps(s, ensure_ascii=False)
    ro = '\n    // ' + section + '\n' + ''.join('    %s: %s,\n' % (k, js_str(NEW_KEYS[k][0])) for k in keys)
    en = '\n    // ' + section + '\n' + ''.join('    %s: %s,\n' % (k, js_str(NEW_KEYS[k][1])) for k in keys)
    i_en = js.index('\n  en: {'); ro_end = js.rindex('\n  },', 0, i_en)
    js = js[:ro_end].rstrip().rstrip(',') + ',' + ro.rstrip(',\n') + '\n' + js[ro_end:]
    i_en = js.index('\n  en: {'); en_end = js.index('\n  }\n};', i_en)
    js = js[:en_end].rstrip().rstrip(',') + ',' + en.rstrip(',\n') + js[en_end:]
    open(p, 'w', encoding='utf8').write(js)
    print('added', len(keys), 'keys')
