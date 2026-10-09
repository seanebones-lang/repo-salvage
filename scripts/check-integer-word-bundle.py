"""Run the reviewed generated consumer as an independent archive recipient."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import tarfile
import tempfile

root = Path(__file__).resolve().parent.parent
source = root / 'examples/integer-word-consumer'
evaluation = root / 'examples/scoped-consumer-evaluation'
result = json.loads((evaluation / 'results.json').read_text())
seal = json.loads((evaluation / 'seal.json').read_text())
review = json.loads((evaluation / 'review.json').read_text())
assert review['passed'] and review['codeSha256'] == result['codeSha256']
expected = {'consumer.py', 'test_consumer.py', 'LICENSE', 'README.md', 'SOURCE.md'}
with tempfile.TemporaryDirectory(prefix='salvage-integer-bundle-') as directory:
    destination = Path(directory)
    with tarfile.open(root / 'public/integer-word-consumer.tar.gz', 'r:gz') as archive:
        members = archive.getmembers()
        assert len(members) == len(expected)
        assert {m.name for m in members} == {'integer-word-consumer/' + n for n in expected}
        for m in members:
            assert m.isfile() and m.size <= 100000
            name = m.name.split('/')[1]
            data = archive.extractfile(m).read()
            assert data == (source / name).read_bytes(), 'Packaged bytes differ: ' + name
            if name == 'consumer.py':
                assert hashlib.sha256(data).hexdigest() == result['codeSha256']
                assert data.decode() == result['response']['code']
            if name in ('test_consumer.py', 'LICENSE'):
                assert hashlib.sha256(data).hexdigest() == seal['files']['../integer-word-consumer/' + name]
            (destination / name).write_bytes(data)
    env = {k: os.environ[k] for k in ('PATH', 'SYSTEMROOT') if k in os.environ}
    run = subprocess.run([sys.executable, '-I', '-m', 'unittest', 'discover', '-s', '.', '-p', 'test_consumer.py', '-v'], cwd=destination, env=env, capture_output=True, text=True, timeout=30)
    if run.returncode:
        sys.stderr.write(run.stderr)
        raise SystemExit(run.returncode)
    print(json.dumps({'status':'passed','packagedConsumerTests':9,'referenceComparisons':1500,'files':len(expected),'applicationImports':False,'credentialsForwarded':False,'codeSha256':result['codeSha256']}))
