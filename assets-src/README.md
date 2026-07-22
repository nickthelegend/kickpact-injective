# assets-src

Original artwork that icons are derived from. Drop the full-resolution source
here and regenerate — never hand-edit the outputs in `apps/*/assets`, they are
all generated.

| file | used by |
|---|---|
| `ball.png` | `tools/crop-ball.py` → landing favicon + Android launcher/splash |

```bash
python3 tools/crop-ball.py assets-src/ball.png --check   # preview the cut
python3 tools/crop-ball.py assets-src/ball.png           # write the icons
```
