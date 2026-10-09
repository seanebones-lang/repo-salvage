"""Independent archive recipient; validate allowlists and reviewed code hashes first."""
import hashlib, json, os, pathlib, subprocess, tarfile, tempfile
root = pathlib.Path(__file__).resolve().parent.parent
review = json.loads((root / 'examples/rust-go-consumers/review.json').read_text())
checks=[]
with tempfile.TemporaryDirectory(prefix='salvage-native-bundles-') as workspace:
    for language, archive, expected in [
        ('rust', 'rust-edit-distance.tar.gz', {'consumer.rs','acceptance.rs','LICENSE','README.md','manifest.json'}),
        ('go', 'go-rendezvous-consumer.tar.gz', {'consumer.go','acceptance_test.go','go.mod','LICENSE','README.md','manifest.json'})]:
        destination=pathlib.Path(workspace)/language;destination.mkdir()
        with tarfile.open(root/'public'/archive,'r:gz') as bundle:
            members=bundle.getmembers()
            assert len(members)==len(expected) and {m.name for m in members}==expected
            for m in members:
                assert m.isfile() and 0 <= m.size <= 65536
                (destination/m.name).write_bytes(bundle.extractfile(m).read())
        manifest=json.loads((destination/'manifest.json').read_text())
        assert manifest['format']=='repo-salvage/adapted-consumer-bundle-v1'
        assert {f['path'] for f in manifest['files']}==expected-{'manifest.json'}
        for f in manifest['files']:
            data=(destination/f['path']).read_bytes()
            assert hashlib.sha256(data).hexdigest()==f['sha256']
            # Every file must match the reviewed source bundle allowlist exactly.
            assert data==(root/'examples/rust-go-consumers'/language/f['path']).read_bytes()
        code='consumer.rs' if language=='rust' else 'consumer.go'
        approval=next(c for c in review['consumers'] if c['language']==language)
        assert approval['approved'] and hashlib.sha256((destination/code).read_bytes()).hexdigest()==approval['codeSha256']
        env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR','SYSTEMROOT') if k in os.environ}
        def run(args):
            result=subprocess.run(args,cwd=destination,env=env,capture_output=True,text=True,timeout=60)
            if result.returncode: raise RuntimeError(result.stdout+result.stderr)
            return result.stdout+result.stderr
        if language=='rust':
            run([os.environ.get('SALVAGE_RUSTC','rustc'),'--edition=2021','--test','acceptance.rs','-o','acceptance'])
            output=run([str(destination/'acceptance'),'--test-threads=1'])
        else:
            env.update(GOTOOLCHAIN='local',GOPROXY='off',GOSUMDB='off',GOWORK='off',GOENV='off',GOCACHE=str(pathlib.Path(workspace)/'go-cache'),GOPATH=str(pathlib.Path(workspace)/'go-path'))
            output=run([os.environ.get('SALVAGE_GO','go'),'test','-count=1','.'])
        checks.append({'language':language,'status':'passed','archive':archive,'codeSha256':approval['codeSha256']})
print(json.dumps({'checks':checks,'sourceExecuted':'Reviewed standalone adaptations only','providerCalls':0}))
