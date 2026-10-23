"""ureten: codex. Synthetic bounded-archive, rights and integrity regression; no personal data."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('split_collection', Path(__file__).parents[1] / 'scripts/split-private-collection.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateCollectionTests(unittest.TestCase):
    def fixture(self, root, corrupt=False):
        source = root / 'source.zip'
        assets = []
        with zipfile.ZipFile(source, 'w') as archive:
            for i, size in enumerate([10, 20, 30]):
                data = bytes([i]) * size
                name = 'images/synthetic-' + str(i) + '.png'
                assets.append({'path': name, 'kind': 'image', 'name': 'Synthetic ' + str(i), 'bytes': size,
                               'sha256': ('0' * 64) if corrupt and i == 1 else hashlib.sha256(data).hexdigest()})
                archive.writestr(name, data)
            archive.writestr('collection.json', json.dumps({'schema': 1, 'atlasId': 'paris-catacombs', 'id': 'synthetic-private',
                             'title': 'Synthetic archive', 'rights': 'personal-copy', 'assets': assets}))
        return source

    def test_bounded_parts_keep_original_asset_bytes_metadata_and_rights(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self.fixture(root)
            before = source.read_bytes()
            report = module.split_collection(source, root / 'out', 25)
            self.assertEqual(report['assetCount'], 3)
            self.assertEqual(len(report['parts']), 3)
            self.assertEqual(sum(p['singleAssetExceedsTarget'] for p in report['parts']), 1)
            self.assertEqual(source.read_bytes(), before)
            for part in report['parts']:
                with zipfile.ZipFile(root / 'out' / part['path']) as archive:
                    meta = json.loads(archive.read('collection.json'))
                    self.assertEqual(meta['rights'], 'personal-copy')
                    for asset in meta['assets']:
                        self.assertEqual(hashlib.sha256(archive.read(asset['path'])).hexdigest(), asset['sha256'])

    def test_corrupt_source_never_creates_an_installable_part(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                module.split_collection(self.fixture(root, corrupt=True), root / 'out', 25)
            self.assertFalse(list((root / 'out').glob('*.zip')))


if __name__ == '__main__':
    unittest.main()
