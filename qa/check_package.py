from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
r=json.loads((root/'database.rules.json').read_text())
json.loads((root/'firebase.json').read_text())
json.loads((root/'firestore.indexes.json').read_text())
assert 'numChildren(' not in str(r)
assert 'root.child(\'blockedEvidence\').child($reportId).val() ||' not in str(r)
assert r['rules']['.read'] is False and r['rules']['.write'] is False
assert (root/'web/index.html').exists() and (root/'web/assets/main.js').exists()
assert (root/'source/src/main.ts').exists()
assert len(list((root/'source/src').glob('*.ts')))>=3
print('PASS: JSON y estructura; esto NO compila reglas contra Firebase')
