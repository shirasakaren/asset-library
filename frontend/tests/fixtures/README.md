# E2E fixtures

Place small binary fixtures here for the Playwright suite. **These are not
committed by default** — they're test artifacts that the CI seeds via the
backend's `pnpm seed:e2e` script.

Files referenced by specs:

- `thumb.png` — 1280×720 PNG for the thumbnail uploader (≤8 MB).
- `demo.unitypackage` — small valid Unity package (singleshot path).
- `large.unitypackage` — ≥100 MB Unity package (multipart path).
- `demo.uplugin` — small Unreal plugin.
- `demo.fbx`, `demo.glb` — 3D model fixtures.
- `demo.mp4` — short video.
- `eicar.com.txt` — standard EICAR test signature for AV.

Generating fixtures locally:

```bash
# EICAR — single-line ASCII signature, recognised by every AV
cat > tests/fixtures/eicar.com.txt <<'EOF'
X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*
EOF

# Thumbnail
magick -size 1280x720 gradient: tests/fixtures/thumb.png

# Synthetic Unity package (just a .tar.gz that the analyzer parses)
tar czf tests/fixtures/demo.unitypackage README.md package.json
```

Do not commit real licensed assets. The CI environment seeds them
from a private S3 bucket.
