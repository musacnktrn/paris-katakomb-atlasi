#!/usr/bin/env python3
"""Recupere le tableau d'assemblage de l'atlas IGC et en tire l'index.

Le service ArcGIS public de la Ville de Paris expose, pour chacune des 458
planches, son emprise geographique et l'URL de son PDF. C'est la source de
verite de tout le reste de la chaine.
"""
import argparse
import json
import os
import re
import urllib.parse
import urllib.request

SERVICE = ('https://capgeo2.paris.fr/public/rest/services/IGC/'
           'IGC_TA_Externe/MapServer/0/query')
UA = {'User-Agent': 'catacombes-atlas/1.0 (+https://github.com/)'}

# emprise du Grand Reseau Sud : 5e, 6e, 14e, 15e sud
GRS = dict(west=2.298, south=48.818, east=2.348, north=48.847)


def query(out_sr):
    params = urllib.parse.urlencode({
        'where': '1=1',
        'outFields': 'numero_car,carte',
        'returnGeometry': 'true',
        'outSR': str(out_sr),
        'f': 'json',
    })
    req = urllib.request.Request(f'{SERVICE}?{params}', headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def bbox(geom):
    xs, ys = [], []
    for ring in geom.get('rings', []):
        for x, y in ring:
            xs.append(x)
            ys.append(y)
    return [min(xs), min(ys), max(xs), max(ys)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('-o', '--outdir', default='.', help='dossier de sortie')
    args = ap.parse_args()

    wgs = query(4326)
    l93 = query(2154)

    l93_bb = {f['attributes']['numero_car']: bbox(f['geometry'])
              for f in l93['features']}

    out = []
    for f in wgs['features']:
        a = f['attributes']
        n, url = a['numero_car'], a.get('carte')
        bb = [round(v, 6) for v in bbox(f['geometry'])]
        year = None
        if url:
            m = re.search(r'_(\d{4})\.pdf$', url)
            year = int(m.group(1)) if m else None
        out.append({
            'n': n, 'url': url, 'an': year, 'bb': bb,
            'l93': [round(v, 3) for v in l93_bb.get(n, [])],
            'grs': (bb[2] >= GRS['west'] and bb[0] <= GRS['east']
                    and bb[3] >= GRS['south'] and bb[1] <= GRS['north']),
        })
    out.sort(key=lambda r: r['n'])

    path = os.path.join(args.outdir, 'index_planches.json')
    with open(path, 'w') as fh:
        json.dump(out, fh, ensure_ascii=False)

    grs = [r for r in out if r['grs']]
    with open(os.path.join(args.outdir, 'planches_grs.txt'), 'w') as fh:
        for r in grs:
            if r['url']:
                fh.write(r['url'] + '\n')

    print(f'{len(out)} planches indexees, dont {len(grs)} sur le GRS '
          f'({sum(1 for r in grs if r["url"])} avec PDF)')


if __name__ == '__main__':
    main()
