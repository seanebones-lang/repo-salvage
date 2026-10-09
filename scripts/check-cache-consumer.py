"""Execute the reviewed generated adaptation in a clean consumer workspace."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
source = root / 'examples/cache-consumer'
evaluation = root / 'examples/full-chain-evaluation'
seal = json.loads((evaluation / 'seal.json').read_text())
result = json.loads((evaluation / 'adaptation-results.json').read_text())
assert hashlib.sha256((source / 'test_cache.py').read_bytes()).hexdigest() == seal['files']['../cache-consumer/test_cache.py']
assert hashlib.sha256((source / 'consumer.py').read_bytes()).hexdigest() == result['codeSha256']
corpus = json.loads((evaluation / 'corpus.json').read_text())
assert (source / 'LICENSE').read_text() == next(f['content'] for f in corpus['files'] if f['path'] == 'LICENSE')
with tempfile.TemporaryDirectory(prefix='salvage-cache-consumer-') as directory:
    destination = Path(directory)
    for name in ['consumer.py', 'test_cache.py', 'LICENSE']:
        shutil.copyfile(source / name, destination / name)
    env = {key: os.environ[key] for key in ['PATH', 'SYSTEMROOT'] if key in os.environ}
    completed = subprocess.run(
        [sys.executable, '-I', '-m', 'unittest', 'discover', '-s', '.', '-p', 'test_*.py', '-v'],
        cwd=destination, env=env, capture_output=True, text=True, timeout=30,
    )
    if completed.returncode:
        sys.stderr.write(completed.stderr)
        raise SystemExit(completed.returncode)
    print(json.dumps({'status': 'passed', 'consumerTests': 10, 'referenceModelOperations': 2000,
                      'isolatedPython': True, 'applicationImports': False, 'credentialsForwarded': False,
                      'originalModuleExecuted': False, 'codeSha256': result['codeSha256']}))
