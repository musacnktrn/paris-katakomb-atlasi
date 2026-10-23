# ureten: codex. Synthetic cached WFS fixtures; no network or actual location/private data.
import importlib.util, json, hashlib, tempfile, unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('landcover_builder',Path(__file__).resolve().parents[1]/'scripts/build-landcover.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
class Landcover(unittest.TestCase):
    def fixture(self,root):
        cache=root/'cache';work=root/'work';(cache/'pages').mkdir(parents=True);(cache/'raw').mkdir();work.mkdir()
        geometry={'type':'Polygon','coordinates':[[[2,48],[2.01,48],[2.01,48.01],[2,48]],[[2.001,48.001],[2.002,48.001],[2.002,48.002],[2.001,48.001]]]}
        for layer in builder.LAYERS:
            kinds=['Parc de loisirs','Enseignement primaire'] if layer=='zone_d_activite_ou_d_interet' else ['Synthetic nature']
            features=[{'type':'Feature','geometry':geometry,'properties':{'cleabs':layer+str(i),'nature':nature}} for i,nature in enumerate(kinds)]
            raw=json.dumps({'numberMatched':len(features),'features':features}).encode();digest=hashlib.sha256(raw).hexdigest();(cache/'raw'/(digest+'.body')).write_bytes(raw)
            manifest={'numberMatched':len(features),'pages':[{'bodySha256':digest,'bodyBytes':len(raw),'offset':0,'returned':len(features),'retrievedAt':'2026-01-01T00:00:00Z'}]};(cache/'pages'/(layer+'.pages.json')).write_text(json.dumps(manifest))
        return cache,work,geometry
    def test_declared_land_use_and_holes_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            cache,work,geometry=self.fixture(Path(temp));expected,reports,_=builder.prepare(cache,work)
            self.assertEqual(sum(len(v) for v in expected.values()),7)
            self.assertEqual(json.loads((work/'zone_de_vegetation.jsonl').read_text())['geometry'],geometry)
            report=next(x for x in reports if x['layer']=='zone_d_activite_ou_d_interet');self.assertEqual(report['sourceCount'],2);self.assertEqual(report['selectedCount'],1)
            self.assertNotIn('Enseignement primaire',(work/'zone_d_activite_ou_d_interet.jsonl').read_text())
    def test_tampered_raw_body_is_rejected_before_tiles(self):
        with tempfile.TemporaryDirectory() as temp:
            cache,work,_=self.fixture(Path(temp));meta=json.loads((cache/'pages/zone_de_vegetation.pages.json').read_text());(cache/'raw'/(meta['pages'][0]['bodySha256']+'.body')).write_text('{}')
            with self.assertRaisesRegex(ValueError,'SHA/bytes'):builder.prepare(cache,work)
    def test_pagination_gap_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            cache,work,_=self.fixture(Path(temp));p=cache/'pages/zone_de_vegetation.pages.json';m=json.loads(p.read_text());m['pages'][0]['offset']=3;p.write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError,'pagination gap'):builder.prepare(cache,work)
    def test_non_geographic_positions_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'CRS84'):list(builder.positions([655000,6800000]))
if __name__=='__main__':unittest.main()
