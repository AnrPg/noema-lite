#!/usr/bin/env python3
"""Upload Claude's drafts to Weblate as "needs editing" (docs/i18n.md §9.3). A DRY RUN unless --apply is given.

  python3 tools/i18n/weblate_import_drafts.py [--component engine …] [--locale el …] [--skip-sensitive]
  python3 tools/i18n/weblate_import_drafts.py --facades <exchange dir>/weblate-facades [--locale el …]
  … --apply            really upload (needs WEBLATE_URL and WEBLATE_API_TOKEN in the environment)

What is uploaded
  * i18n/<component>/drafts/<locale>.arb → Weblate project `noema-lite` (--project), component <component>, translation
    <locale>: only the keys that are in en.arb and NOT yet in the approved i18n/<component>/<locale>.arb.
  * i18n/glossary/drafts/<locale>.csv → component `glossary`: the rows whose term is not yet in i18n/glossary/<locale>.csv.
  * --facades DIR (written by tools/i18n/weblate_facades.py export): <dir>/<component>/drafts/<locale>.json → project
    `noema-lite-courses`, the component slug from INDEX.json: the keys en.json has and <locale>.json (reviewed) lacks.

How (Weblate REST API, POST /api/translations/<project>/<component>/<language>/file/, multipart):
  method=fuzzy      "Add as translation needing edit" (default; --method suggest adds suggestions instead)
  conflicts=ignore  "Change only untranslated strings": a draft never overwrites a translation made in Weblate
The translation is found by its file name (GET /api/components/<project>/<component>/translations/), so BCP 47 tags
(zh-Hans, pt-PT, es-ES, ar-EG) map to whatever language code Weblate uses. A locale Weblate does not have yet is
reported (create it with `weblate_setup.py init-locale <tag>`, merge, let Weblate pull) and skipped.

The token is read from the environment only (WEBLATE_API_TOKEN) and never printed or written anywhere.
Exit 0 when every planned upload succeeded (dry run: when the plan could be made), 1 otherwise.
"""
import argparse, csv, glob, io, json, os, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))


class Upload:
    def __init__(self, project, component, locale, repo_file, name, content, keys, **info):
        self.project, self.component, self.locale = project, component, locale
        self.repo_file = repo_file      # the translation file in the repository Weblate reads (to find the translation)
        self.name, self.content, self.keys, self.info = name, content, keys, info

    def line(self):
        extra = ' · '.join(f'{v} {k.replace("_", " ")}' for k, v in self.info.items() if v)
        return f'{self.project}/{self.component} {self.locale}: {self.keys} key(s) to upload' + (f' ({extra})' if extra else '')


def rjson(p):
    with open(p, encoding='utf-8') as f: return json.load(f, object_pairs_hook=OrderedDict)


def messages(arb):
    return OrderedDict((k, v) for k, v in (arb or {}).items() if not k.startswith('@'))


# ------------------------------------------------------------------------------------------------ the plan
def plan_arb(repo, project='noema-lite', components=None, locales=None, skip_sensitive=False):
    out = []
    for dp in sorted(glob.glob(os.path.join(repo, 'i18n', '*', 'drafts', '*.arb'))):
        comp = os.path.basename(os.path.dirname(os.path.dirname(dp))); loc = os.path.basename(dp)[:-4]
        if (components and comp not in components) or (locales and loc not in locales): continue
        en_p = os.path.join(repo, 'i18n', comp, 'en.arb')
        if not os.path.exists(en_p): continue
        en = rjson(en_p); en_m = messages(en)
        ap = os.path.join(repo, 'i18n', comp, loc + '.arb')
        approved = messages(rjson(ap)) if os.path.exists(ap) else {}
        draft = messages(rjson(dp))
        body = OrderedDict([('@@locale', loc)])
        info = OrderedDict([('approved_already', 0), ('not_in_english', 0), ('sensitive', 0), ('sensitive_skipped', 0), ('empty', 0)])
        for k, v in draft.items():
            if k not in en_m: info['not_in_english'] += 1; continue
            if isinstance(approved.get(k), str) and approved[k] != '': info['approved_already'] += 1; continue
            if not isinstance(v, str) or not v.strip(): info['empty'] += 1; continue
            if (en.get('@' + k) or {}).get('x-sensitive'):
                if skip_sensitive: info['sensitive_skipped'] += 1; continue
                info['sensitive'] += 1
            body[k] = v
        n = len(body) - 1
        if n:
            out.append(Upload(project, comp, loc, f'i18n/{comp}/{loc}.arb', loc + '.arb',
                              (json.dumps(body, ensure_ascii=False, indent=2) + '\n').encode('utf-8'), n, **info))
    return out


def read_csv(p):
    with open(p, encoding='utf-8', newline='') as f: return list(csv.DictReader(f))


def plan_glossary(repo, project='noema-lite', locales=None):
    out = []
    for dp in sorted(glob.glob(os.path.join(repo, 'i18n', 'glossary', 'drafts', '*.csv'))):
        loc = os.path.basename(dp)[:-4]
        if locales and loc not in locales: continue
        ap = os.path.join(repo, 'i18n', 'glossary', loc + '.csv')
        done = {r.get('source') for r in read_csv(ap) if (r.get('target') or '').strip()} if os.path.exists(ap) else set()
        rows, info = [], OrderedDict([('approved_already', 0), ('empty', 0)])
        for r in read_csv(dp):
            if r.get('source') in done: info['approved_already'] += 1; continue
            if not (r.get('target') or '').strip(): info['empty'] += 1; continue
            rows.append((r['source'], r['target']))
        if rows:
            buf = io.StringIO(); w = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator='\n')
            w.writerow(['source', 'target']); w.writerows(rows)
            out.append(Upload(project, 'glossary', loc, f'i18n/glossary/{loc}.csv', loc + '.csv', buf.getvalue().encode('utf-8'),
                              len(rows), **info))
    return out


def plan_facades(xdir, project='noema-lite-courses', locales=None, components=None):
    idx_p = os.path.join(xdir, 'INDEX.json')
    if not os.path.exists(idx_p): raise SystemExit(f'{xdir}: no INDEX.json (tools/i18n/weblate_facades.py export)')
    idx = rjson(idx_p); out = []
    top = os.path.basename(os.path.normpath(xdir))      # the folder Weblate's file mask starts with (weblate-facades)
    for comp in idx['components']:
        if components and comp['slug'] not in components: continue
        cdir = os.path.join(xdir, comp['dir']); en = rjson(os.path.join(cdir, 'en.json'))
        for dp in sorted(glob.glob(os.path.join(cdir, 'drafts', '*.json'))):
            loc = os.path.basename(dp)[:-5]
            if locales and loc not in locales: continue
            rp = os.path.join(cdir, loc + '.json')
            reviewed = rjson(rp) if os.path.exists(rp) else {}
            body, info = OrderedDict(), OrderedDict([('reviewed_already', 0), ('superseded', 0), ('empty', 0)])
            for k, v in rjson(dp).items():
                if k not in en: info['superseded'] += 1; continue
                if isinstance(reviewed.get(k), str) and reviewed[k] != '': info['reviewed_already'] += 1; continue
                if not isinstance(v, str) or not v.strip(): info['empty'] += 1; continue
                body[k] = v
            if body:
                out.append(Upload(project, comp['slug'], loc, f'{top}/{comp["dir"]}/{loc}.json', loc + '.json',
                                  (json.dumps(body, ensure_ascii=False, indent=1) + '\n').encode('utf-8'), len(body), **info))
    return out


# ------------------------------------------------------------------------------------------------ the API
class Api:
    def __init__(self, base, token, timeout=600):
        self.base = base.rstrip('/'); self._token = token; self.timeout = timeout

    def _req(self, method, url, data=None, headers=None):
        h = {'Authorization': 'Token ' + self._token, 'Accept': 'application/json', 'User-Agent': 'noema-lite-weblate-tools'}
        h.update(headers or {})
        for attempt in range(5):
            req = urllib.request.Request(url, data=data, method=method, headers=h)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    body = r.read()
                    return json.loads(body) if body else {}
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 4:
                    time.sleep(int(e.headers.get('Retry-After') or 5 * (attempt + 1))); continue
                detail = e.read().decode('utf-8', 'replace')[:800]
                raise RuntimeError(f'{method} {url}: HTTP {e.code} {detail}') from None
        raise RuntimeError(f'{method} {url}: rate limited')

    def get(self, path):
        return self._req('GET', path if path.startswith('http') else self.base + path)

    def translations(self, project, component):
        url, out = f'{self.base}/api/components/{project}/{component}/translations/', []
        while url:
            page = self.get(url); out += page.get('results', []); url = page.get('next')
        return out

    def upload(self, translation_url, name, content, fields):
        boundary = 'noema-' + uuid.uuid4().hex
        parts = []
        for k, v in fields.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode('utf-8'))
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                     f'Content-Type: application/octet-stream\r\n\r\n'.encode('utf-8') + content + b'\r\n')
        parts.append(f'--{boundary}--\r\n'.encode('utf-8'))
        return self._req('POST', translation_url.rstrip('/') + '/file/', b''.join(parts),
                         {'Content-Type': f'multipart/form-data; boundary={boundary}'})


def run_uploads(api, uploads, method='fuzzy', conflicts='ignore', ignore_language=False, log=print):
    ok, cache = True, {}
    for u in uploads:
        key = (u.project, u.component)
        try:
            if key not in cache: cache[key] = {t.get('filename'): t for t in api.translations(*key)}
            t = cache[key].get(u.repo_file)
            if not t:
                log(f'SKIP  {u.project}/{u.component} {u.locale}: Weblate has no translation for {u.repo_file} — '
                    f'`python3 tools/i18n/weblate_setup.py init-locale {u.locale}`, merge, then let Weblate pull'); ok = False; continue
            fields = OrderedDict([('method', method), ('conflicts', conflicts)])
            if ignore_language: fields['ignore_language'] = 'true'
            r = api.upload(t['url'], u.name, u.content, fields)
            log(f'OK    {u.project}/{u.component} {u.locale}: accepted {r.get("accepted")}, skipped {r.get("skipped")}, '
                f'not found {r.get("not_found")}, total {r.get("total")}')
        except RuntimeError as e:
            log(f'FAIL  {u.project}/{u.component} {u.locale}: {e}'); ok = False
    return ok


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--repo', default=REPO, help=argparse.SUPPRESS)
    ap.add_argument('--component', action='append', help='only these components (repeatable); `glossary` for the glossary')
    ap.add_argument('--locale', action='append', help='only these locales (BCP 47, repeatable)')
    ap.add_argument('--facades', metavar='DIR', help='upload the facade drafts of an exchange tree instead of the ARB drafts')
    ap.add_argument('--project', help='Weblate project slug (default noema-lite, with --facades noema-lite-courses)')
    ap.add_argument('--method', default='fuzzy', choices=['fuzzy', 'suggest'])
    ap.add_argument('--conflicts', default='ignore', choices=['ignore', 'replace-translated'])
    ap.add_argument('--skip-sensitive', action='store_true', help='leave out keys marked "x-sensitive" (legal, billing, safety)')
    ap.add_argument('--ignore-language', action='store_true', help='upload even if Weblate reads another language from the file')
    ap.add_argument('--apply', action='store_true', help='really upload (otherwise: print the plan, no network)')
    a = ap.parse_args(argv)
    if a.facades:
        uploads = plan_facades(a.facades, a.project or 'noema-lite-courses', a.locale, a.component)
    else:
        comps = [c for c in (a.component or []) if c != 'glossary'] or None
        uploads = [] if a.component and not comps else plan_arb(a.repo, a.project or 'noema-lite', comps, a.locale, a.skip_sensitive)
        if not a.component or 'glossary' in a.component: uploads += plan_glossary(a.repo, a.project or 'noema-lite', a.locale)
    for u in uploads: print(('UPLOAD ' if a.apply else 'plan   ') + u.line())
    print(f'{len(uploads)} upload(s), {sum(u.keys for u in uploads)} key(s), method={a.method}, conflicts={a.conflicts}')
    if not a.apply:
        print('dry run: nothing was sent (add --apply; WEBLATE_URL and WEBLATE_API_TOKEN must be set)')
        return 0
    url, token = os.environ.get('WEBLATE_URL'), os.environ.get('WEBLATE_API_TOKEN')
    if not url or not token: print('WEBLATE_URL and WEBLATE_API_TOKEN must be set in the environment'); return 1
    if not url.startswith('https://') and not urllib.parse.urlparse(url).hostname in ('localhost', '127.0.0.1'):
        print('WEBLATE_URL must be https:// (the token would travel in clear text)'); return 1
    return 0 if run_uploads(Api(url, token), uploads, a.method, a.conflicts, a.ignore_language) else 1


if __name__ == '__main__':
    sys.exit(main())
