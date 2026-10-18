#!/usr/bin/env python3
"""ureten: codex. Small, explicit OSM geometry extract; never scrape map tiles."""
import argparse, datetime, hashlib, json, pathlib, urllib.parse, urllib.request

QUERY = '[out:json][timeout:25];(way["highway"]["name"](48.818,2.298,48.847,2.348);way["natural"="water"](48.818,2.298,48.847,2.348);way["leisure"="park"](48.818,2.298,48.847,2.348););out geom;'
URL = 'https://overpass-api.de/api/interpreter'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / 'public/data/surface-grs.geojson')
    args = parser.parse_args()
    req = urllib.request.Request(URL, data=urllib.parse.urlencode({'data': QUERY}).encode(), headers={'User-Agent': 'Archify-Paris-Atlas/0.1'})
    with urllib.request.urlopen(req, timeout=40) as response:
        data = json.load(response)
    if data.get('remark'):
        raise ValueError(data['remark'])
    features = []
    for item in data['elements']:
        points = [[p['lon'], p['lat']] for p in item.get('geometry', []) if 'lon' in p and 'lat' in p]
        if len(points) < 2:
            continue
        tags = item.get('tags', {})
        area = (tags.get('natural') == 'water' or tags.get('leisure') == 'park') and len(points) >= 4 and points[0] == points[-1]
        features.append({'type': 'Feature', 'id': 'osm:way:' + str(item['id']), 'properties': {'name': tags.get('name', ''), 'kind': 'water' if tags.get('natural') == 'water' else 'park' if tags.get('leisure') == 'park' else 'road', 'sourceId': 'osm-surface', 'osmId': item['id']}, 'geometry': {'type': 'Polygon' if area else 'LineString', 'coordinates': [points] if area else points}})
    if not features or len({f['id'] for f in features}) != len(features):
        raise ValueError('Empty or duplicate OSM results')
    output = {'type': 'FeatureCollection', 'features': features, 'attribution': '© OpenStreetMap contributors, ODbL 1.0', 'source': URL, 'retrievedAt': datetime.datetime.now().astimezone().isoformat(), 'coverage': [2.298, 48.818, 2.348, 48.847], 'coverageLabel': 'GRS çevresi yerüstü; bütün Paris değildir'}
    encoded = json.dumps(output, ensure_ascii=False, separators=(',', ':')).encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encoded)
    print(json.dumps({'features': len(features), 'bytes': len(encoded), 'sha256': hashlib.sha256(encoded).hexdigest(), 'osm_timestamp': data.get('osm3s', {}).get('timestamp_osm_base')}))

if __name__ == '__main__':
    main()
