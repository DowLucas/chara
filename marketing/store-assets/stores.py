#!/usr/bin/env python3
"""Sync store listings (text + screenshots) with App Store Connect and Google Play.

  python3 stores.py pull                       # live en-US listings -> listing/en.json
  python3 stores.py push [--store apple|play] [--lang sv,de] [--screenshots] [--yes]

push is a dry run (prints the diff) unless --yes. Text comes from listing/<lang>.json,
screenshots from pages-v2/<lang>/<store>/ (build.py --lang). Apple only accepts edits on
a version in an editable state (e.g. PREPARE_FOR_SUBMISSION), never one in review.

Credentials: ASC key TRVV2K4QBL (App Manager) in ~/secrets/chara-apple; Play service
account at app/google-play-service-account.json.
"""
import argparse, hashlib, json, os, sys, time
import jwt, requests
import build

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
LISTING = os.path.join(HERE, 'listing')

ASC_APP_ID = '6773089720'
ASC_ISSUER = 'f8cafeb5-a003-43e3-884f-e1c3fd8b6886'
ASC_KEY_ID = 'TRVV2K4QBL'
ASC_KEY = os.path.expanduser(f'~/secrets/chara-apple/AuthKey_{ASC_KEY_ID}.p8')
ASC = 'https://api.appstoreconnect.apple.com/v1'
ASC_SCREENSHOT_TYPE = 'APP_IPHONE_67'   # the 6.9" slot; takes 1320x2868

PLAY_PACKAGE = 'chara.app'
PLAY_SA = os.path.join(REPO, 'app', 'google-play-service-account.json')
PLAY = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PLAY_PACKAGE}'
PLAY_UPLOAD = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PLAY_PACKAGE}'

# app locale (app/lib/locales) -> (App Store locale, Play locale)
LOCALES = {
    'en': ('en-US', 'en-US'), 'ar': ('ar-SA', 'ar'), 'da': ('da', 'da-DK'),
    'de': ('de-DE', 'de-DE'), 'es': ('es-ES', 'es-ES'), 'fi': ('fi', 'fi-FI'),
    'fr': ('fr-FR', 'fr-FR'), 'it': ('it', 'it-IT'), 'ja': ('ja', 'ja-JP'),
    'nb-NO': ('no', 'no-NO'), 'nl': ('nl-NL', 'nl-NL'), 'pl': ('pl', 'pl-PL'),
    'pt': ('pt-BR', 'pt-BR'), 'sv': ('sv', 'sv-SE'), 'zh-Hans': ('zh-Hans', 'zh-CN'),
}

# listing/<lang>.json holds one shared text per field; these map it onto each store's API.
APPLE_INFO_FIELDS = ['name', 'subtitle']                                   # appInfoLocalizations
APPLE_VERSION_FIELDS = ['description', 'keywords', 'promotionalText']     # appStoreVersionLocalizations
PLAY_FIELDS = {'title': 'name', 'shortDescription': 'shortDescription', 'fullDescription': 'description'}
LIMITS = {'name': 30, 'subtitle': 30, 'keywords': 100, 'promotionalText': 170, 'description': 4000,
          'shortDescription': 80}
EDITABLE = {'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'}


def check(r):
    if not r.ok:
        sys.exit(f'{r.request.method} {r.url} -> {r.status_code}\n{r.text[:800]}')
    return r.json() if r.content else {}

# ---------- App Store Connect ----------

class Apple:
    def __init__(self):
        now = int(time.time())
        token = jwt.encode({'iss': ASC_ISSUER, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'},
                           open(ASC_KEY).read(), algorithm='ES256', headers={'kid': ASC_KEY_ID, 'typ': 'JWT'})
        self.s = requests.Session()
        self.s.headers['Authorization'] = f'Bearer {token}'

    def get(self, path, **params):
        return check(self.s.get(ASC + path, params=params))

    def send(self, method, path, type_, attrs, id_=None, rels=None):
        data = {'type': type_, 'attributes': attrs}
        if id_:
            data['id'] = id_
        if rels:
            data['relationships'] = {k: {'data': {'type': t, 'id': i}} for k, (t, i) in rels.items()}
        return check(self.s.request(method, ASC + path, json={'data': data}))['data']

    def targets(self, editable, strict=True):
        """(appInfo id, appStoreVersion id, version string): the newest ones for pull,
        the editable ones for push. strict=False (dry run) falls back to the newest."""
        infos = self.get(f'/apps/{ASC_APP_ID}/appInfos')['data']
        versions = self.get(f'/apps/{ASC_APP_ID}/appStoreVersions', limit=10,
                            **{'filter[platform]': 'IOS'})['data']
        if not editable:
            infos.sort(key=lambda i: i['attributes']['appStoreState'] == 'READY_FOR_SALE')   # newest first
        want = (lambda st: st in EDITABLE) if editable else (lambda st: True)
        info = next((i for i in infos if want(i['attributes']['appStoreState'])), None)
        ver = next((v for v in versions if want(v['attributes']['appStoreState'])), None)
        if editable and not (info and ver):
            states = [v['attributes']['versionString'] + ' ' + v['attributes']['appStoreState'] for v in versions[:3]]
            if not strict:
                print(f'Apple: no editable version yet ({", ".join(states)}); diffing against the newest.')
                return self.targets(editable=False)
            sys.exit('Apple: no editable version. Create the next version in App Store Connect '
                     f'first (latest: {", ".join(states)}).')
        return info['id'], ver['id'], ver['attributes']['versionString']

    def localizations(self, info_id, ver_id):
        """{locale: (infoLoc, versionLoc)} with raw API objects (either may be None)."""
        out = {}
        for loc in self.get(f'/appInfos/{info_id}/appInfoLocalizations', limit=50)['data']:
            out.setdefault(loc['attributes']['locale'], [None, None])[0] = loc
        for loc in self.get(f'/appStoreVersions/{ver_id}/appStoreVersionLocalizations', limit=50)['data']:
            out.setdefault(loc['attributes']['locale'], [None, None])[1] = loc
        return out

    def upload_screenshots(self, ver_loc_id, files):
        """Replace the 6.9" screenshot set of one version localization with files, in order."""
        sets = self.get(f'/appStoreVersionLocalizations/{ver_loc_id}/appScreenshotSets')['data']
        sset = next((s for s in sets if s['attributes']['screenshotDisplayType'] == ASC_SCREENSHOT_TYPE), None)
        if sset:
            for shot in self.get(f'/appScreenshotSets/{sset["id"]}/appScreenshots')['data']:
                check(self.s.delete(f'{ASC}/appScreenshots/{shot["id"]}'))
        else:
            sset = self.send('POST', '/appScreenshotSets', 'appScreenshotSets',
                             {'screenshotDisplayType': ASC_SCREENSHOT_TYPE},
                             rels={'appStoreVersionLocalization': ('appStoreVersionLocalizations', ver_loc_id)})
        for path in files:
            body = open(path, 'rb').read()
            shot = self.send('POST', '/appScreenshots', 'appScreenshots',
                             {'fileName': os.path.basename(path), 'fileSize': len(body)},
                             rels={'appScreenshotSet': ('appScreenshotSets', sset['id'])})
            for op in shot['attributes']['uploadOperations']:
                chunk = body[op['offset']:op['offset'] + op['length']]
                headers = {h['name']: h['value'] for h in op['requestHeaders']}
                r = requests.request(op['method'], op['url'], data=chunk, headers=headers)
                if not r.ok:
                    sys.exit(f'Apple upload chunk failed for {path}: {r.status_code} {r.text[:300]}')
            self.send('PATCH', f'/appScreenshots/{shot["id"]}', 'appScreenshots',
                      {'uploaded': True, 'sourceFileChecksum': hashlib.md5(body).hexdigest()}, id_=shot['id'])

# ---------- Google Play ----------

class Play:
    def __init__(self):
        sa = json.load(open(PLAY_SA))
        now = int(time.time())
        assertion = jwt.encode({'iss': sa['client_email'], 'aud': sa['token_uri'], 'iat': now, 'exp': now + 3600,
                                'scope': 'https://www.googleapis.com/auth/androidpublisher'},
                               sa['private_key'], algorithm='RS256')
        tok = check(requests.post(sa['token_uri'], data={
            'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': assertion}))
        self.s = requests.Session()
        self.s.headers['Authorization'] = f'Bearer {tok["access_token"]}'
        self.edit = check(self.s.post(f'{PLAY}/edits'))['id']

    def listings(self):
        return {l['language']: l for l in check(self.s.get(f'{PLAY}/edits/{self.edit}/listings')).get('listings', [])}

    def put_listing(self, lang, fields):
        check(self.s.put(f'{PLAY}/edits/{self.edit}/listings/{lang}', json={'language': lang, **fields}))

    def upload_screenshots(self, lang, files):
        check(self.s.delete(f'{PLAY}/edits/{self.edit}/listings/{lang}/phoneScreenshots'))
        for path in files:
            check(self.s.post(f'{PLAY_UPLOAD}/edits/{self.edit}/listings/{lang}/phoneScreenshots',
                              params={'uploadType': 'media'}, data=open(path, 'rb').read(),
                              headers={'Content-Type': 'image/png'}))

    def commit(self):
        check(self.s.post(f'{PLAY}/edits/{self.edit}:commit'))

    def discard(self):
        self.s.delete(f'{PLAY}/edits/{self.edit}')

# ---------- commands ----------

def load(lang):
    return json.load(open(os.path.join(LISTING, f'{lang}.json')))

def pull(_args):
    apple = Apple()
    info_id, ver_id, version = apple.targets(editable=False)
    info_loc, ver_loc = apple.localizations(info_id, ver_id)['en-US']
    play = Play()
    try:
        pl = play.listings()['en-US']
    finally:
        play.discard()
    path = os.path.join(LISTING, 'en.json')
    out = load('en') if os.path.exists(path) else {}   # keeps the screenshot 'pages' captions
    out.update({f: info_loc['attributes'].get(f) or '' for f in APPLE_INFO_FIELDS})
    out.update({f: ver_loc['attributes'].get(f) or '' for f in APPLE_VERSION_FIELDS})
    out['shortDescription'] = pl.get('shortDescription', '')
    for play_f, ours in PLAY_FIELDS.items():
        if (pl.get(play_f) or '') != out[ours]:
            print(f'warning: Play {play_f} differs from Apple {ours}; keeping the Apple text')
    os.makedirs(LISTING, exist_ok=True)
    json.dump(out, open(path, 'w'), indent=2, ensure_ascii=False)
    print(f'pulled Apple {version} + Play en-US -> {os.path.relpath(path, HERE)}')

def validate(lang, data):
    errs = [f'{lang} {f}: missing' for f in LIMITS if f not in data]
    errs += [f'{lang} {f}: {len(data[f])} chars (> {n})' for f, n in LIMITS.items() if len(data.get(f, '')) > n]
    if errs:
        sys.exit('\n'.join(errs))

def screenshots(lang, store):
    d = os.path.join(build.out_dir(lang), store)
    files = sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith('.png'))
    if not files:
        sys.exit(f'no screenshots in {d}; run build.py --lang {lang}')
    return files

def diff(label, old, new):
    old = {f: (old or {}).get(f) or '' for f in new}   # the API returns null for empty fields
    changed = {f: v for f, v in new.items() if old[f] != v}
    for f, v in changed.items():
        if max(len(old[f]), len(v)) <= 120:
            print(f'  {label}.{f}: {old[f]!r} -> {v!r}')
        else:
            print(f'  {label}.{f}: {len(old[f])} -> {len(v)} chars, starts {v[:60]!r}')
    return changed

def push(args):
    langs = args.lang.split(',') if args.lang else sorted(LOCALES)
    data = {lang: load(lang) for lang in langs}
    for lang, d in data.items():
        validate(lang, d)
    stores = [args.store] if args.store else ['apple', 'play']
    mode = 'PUSH' if args.yes else 'DRY RUN'

    if 'apple' in stores:
        apple = Apple()
        info_id, ver_id, version = apple.targets(editable=True, strict=args.yes)
        locs = apple.localizations(info_id, ver_id)
        print(f'== Apple {version} ({mode})')
        for lang in langs:
            loc = LOCALES[lang][0]
            info_loc, ver_loc = locs.get(loc, (None, None))
            new = data[lang]
            print(f'{lang} -> {loc}')
            info_new = diff('info', info_loc and info_loc['attributes'], {f: new[f] for f in APPLE_INFO_FIELDS})
            ver_new = diff('version', ver_loc and ver_loc['attributes'], {f: new[f] for f in APPLE_VERSION_FIELDS})
            files = screenshots(lang, 'apple') if args.screenshots else []
            if files:
                print(f'  screenshots: replace with {len(files)}')
            if not args.yes:
                continue
            if info_new:
                if info_loc:
                    apple.send('PATCH', f'/appInfoLocalizations/{info_loc["id"]}', 'appInfoLocalizations',
                               info_new, id_=info_loc['id'])
                else:
                    apple.send('POST', '/appInfoLocalizations', 'appInfoLocalizations', {'locale': loc, **info_new},
                               rels={'appInfo': ('appInfos', info_id)})
            if ver_new or files:
                if ver_loc:
                    if ver_new:
                        apple.send('PATCH', f'/appStoreVersionLocalizations/{ver_loc["id"]}',
                                   'appStoreVersionLocalizations', ver_new, id_=ver_loc['id'])
                else:
                    ver_loc = apple.send('POST', '/appStoreVersionLocalizations', 'appStoreVersionLocalizations',
                                         {'locale': loc, **ver_new},
                                         rels={'appStoreVersion': ('appStoreVersions', ver_id)})
            if files:
                apple.upload_screenshots(ver_loc['id'], files)

    if 'play' in stores:
        play = Play()
        try:
            live = play.listings()
            print(f'== Play ({mode})')
            for lang in langs:
                loc = LOCALES[lang][1]
                print(f'{lang} -> {loc}')
                fields = {f: data[lang][ours] for f, ours in PLAY_FIELDS.items()}
                changed = diff('listing', live.get(loc), fields)
                files = screenshots(lang, 'play') if args.screenshots else []
                if files:
                    print(f'  screenshots: replace with {len(files)}')
                if args.yes:
                    if changed or loc not in live:
                        play.put_listing(loc, fields)
                    if files:
                        play.upload_screenshots(loc, files)
            if args.yes:
                play.commit()
        finally:
            if not args.yes:
                play.discard()
    if not args.yes:
        print('\nDry run only. Re-run with --yes to push.')

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('pull').set_defaults(fn=pull)
    ps = sub.add_parser('push')
    ps.add_argument('--store', choices=['apple', 'play'])
    ps.add_argument('--lang', help='comma-separated app locales (default: all 15)')
    ps.add_argument('--screenshots', action='store_true', help='also replace screenshots')
    ps.add_argument('--yes', action='store_true', help='actually push (default is a dry run)')
    ps.set_defaults(fn=push)
    args = p.parse_args()
    sys.stdout.reconfigure(line_buffering=True)   # show progress live when piped to a file
    args.fn(args)

if __name__ == '__main__':
    main()
