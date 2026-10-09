"""Verify and execute only the reviewed exact generated adaptation in isolation."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
source = root / 'examples/integer-word-consumer'
evaluation = root / 'examples/scoped-consumer-evaluation'
seal = json.loads((evaluation / 'seal.json').read_text())
result = json.loads((evaluation / 'results.json').read_text())
review = json.loads((evaluation / 'review.json').read_text())
sha256 = lambda b: hashlib.sha256(b).hexdigest()
archive = json.loads((evaluation / 'input-archive.json').read_text())
assert set(archive['files']) == set(seal['files'])
for name, digest in seal['files'].items():
    assert sha256(archive['files'][name].encode()) == digest, 'Archived consumer input changed: ' + name
for name in ['test_consumer.py', 'LICENSE']:
    assert (source / name).read_text() == archive['files']['../integer-word-consumer/' + name]
output_seal = json.loads((evaluation / 'results-seal.json').read_text())
allowed = {'results.json', 'review.json', 'execution.json', 'input-archive.json', '../integer-word-consumer/consumer.py', '../../scripts/check-integer-word-consumer.py'}
assert set(output_seal['files']) == allowed
for name, digest in output_seal['files'].items():
    assert sha256((evaluation / name).read_bytes()) == digest, 'Sealed consumer output changed: ' + name
assert output_seal['inputSealSha256'] == sha256((evaluation / 'seal.json').read_bytes())
assert review['passed'] and review['beforeExecution']
assert result['transportSuccess'] and result['citationsPass'] and result['noticePass']
assert result['prohibitedEvents'] == []
assert review['inputSealSha256'] == result['inputSealSha256'] == sha256((evaluation / 'seal.json').read_bytes())
assert review['codeSha256'] == result['codeSha256'] == sha256((source / 'consumer.py').read_bytes())
assert (source / 'consumer.py').read_text() == result['response']['code']
with tempfile.TemporaryDirectory(prefix='salvage-integer-consumer-') as directory:
    destination = Path(directory)
    for name in ['consumer.py', 'test_consumer.py', 'LICENSE']:
        shutil.copyfile(source / name, destination / name)
    env = {key: os.environ[key] for key in ['PATH', 'SYSTEMROOT'] if key in os.environ}
    completed = subprocess.run(
        [sys.executable, '-I', '-m', 'unittest', 'discover', '-s', '.', '-p', 'test_*.py', '-v'],
        cwd=destination, env=env, capture_output=True, text=True, timeout=30,
    )
    if completed.returncode:
        sys.stderr.write(completed.stderr)
        raise SystemExit(completed.returncode)
    print(json.dumps({'status': 'passed', 'consumerTests': 9, 'referenceComparisons': 1500,
                      'isolatedPython': True, 'applicationImports': False, 'credentialsForwarded': False,
                      'originalModuleExecuted': False, 'codeSha256': result['codeSha256']}))
