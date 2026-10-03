"""Run all tests from the project root. UI tests require the test-only dependencies."""
import subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=sorted(root.joinpath('tests').glob('*.test.js'))+sorted(root.joinpath('tests').glob('*test.py'))+sorted(root.joinpath('tests').glob('*ui-smoke.py'))+[root/'tests/real-browser-e2e.py',root/'tests/storage-browser-faults.py']
for file in files:
 print('RUN',file.name,flush=True)
 result=subprocess.run(['node' if file.suffix=='.js' else sys.executable,str(file)],cwd=root)
 if result.returncode:sys.exit(result.returncode)
print(f'PASS suite: {len(files)} test scripts')
