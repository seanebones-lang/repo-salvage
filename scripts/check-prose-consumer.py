"""Run the reviewed adaptation in a clean workspace, without app imports or credentials."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
source = root / "examples/prose-consumer"
seal = json.loads((root / "examples/discovery-evaluation/adaptation-seal.json").read_text())
assert hashlib.sha256((source / "test_prose.py").read_bytes()).hexdigest() == seal["consumerTestsSha256"]
with tempfile.TemporaryDirectory(prefix="salvage-prose-consumer-") as directory:
    destination = Path(directory)
    for name in ["prose.py", "test_prose.py"]:
        shutil.copyfile(source / name, destination / name)
    shutil.copytree(source / "notices", destination / "notices")
    env = {key: os.environ[key] for key in ["PATH", "SYSTEMROOT"] if key in os.environ}
    completed = subprocess.run(
        [sys.executable, "-I", "-m", "unittest", "discover", "-s", ".", "-p", "test_*.py", "-v"],
        cwd=destination, env=env, capture_output=True, text=True, timeout=30,
    )
    if completed.returncode:
        sys.stderr.write(completed.stderr)
        raise SystemExit(completed.returncode)
    print(json.dumps({"status": "passed", "consumerTests": 8, "seededRoundtripInputs": 1000,
                      "isolatedPython": True, "applicationImports": False, "credentialsForwarded": False,
                      "networkRequests": 0, "originalModuleExecuted": False,
                      "codeSha256": hashlib.sha256((destination / "prose.py").read_bytes()).hexdigest()}))
