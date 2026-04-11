# Source File Storage

Where and how the original source files are stored so the viewer can deep-link into them.

## Recommendation: Cloudflare R2

**Why R2 over alternatives:**

| Option | Storage | Egress | Notes |
|---|---|---|---|
| **Cloudflare R2** ✅ | $0.015/GB-mo | **$0** (free) | S3-compatible, global CDN via Cloudflare, public buckets cached at edge |
| AWS S3 + CloudFront | $0.023/GB-mo | $0.085/GB | Classic, but egress hurts at scale |
| Backblaze B2 + CF | $0.006/GB-mo | $0 via CF partnership | Cheaper storage, needs Cloudflare in front |
| Supabase Storage | Bundled | Bundled | Fine if already using Supabase; not here |
| Self-hosted MinIO | VPS cost | VPS egress | More ops work, less CDN reach |

For this project — ~980 files, mixed PDFs / DOCX / EPUB / audio / a few videos, estimated **<20 GB**, public-read (Islamic scholarship sources), globally accessed — R2 wins on simplicity + zero egress.

**Estimated cost:** ~$0.30/month storage, $0 bandwidth.

## Bucket layout

One bucket: `hizmetsearch-sources`. Everything public-read via a custom subdomain:

```
sources.hizmetsearch.com/
├── risale-i-nur/
│   ├── sozler/
│   │   ├── tr/sozler-bediuzzaman.pdf              # native PDF
│   │   ├── tr/sozler-bediuzzaman.html             # pre-rendered HTML (for text viewer)
│   │   ├── tr/sozler-bediuzzaman.meta.json        # page map, chunk offsets
│   │   └── ar/الكلمات-نورسي.pdf
│   ├── mektubat/
│   │   └── tr/mektubat-bediuzzaman.pdf
│   └── lem-alar/
├── hizmet/
│   ├── kuresel-barisa-dogru-fgulen.pdf
│   ├── kuresel-barisa-dogru-fgulen.html
│   └── kuresel-barisa-dogru-fgulen.meta.json
├── audio/
│   ├── kirkinci/
│   │   ├── dorduncu-soz-sohbet.mp3
│   │   └── dorduncu-soz-sohbet.vtt               # WebVTT transcript with timestamps
│   └── ...
└── video/
    └── ders/
        ├── iman-hakikatleri.mp4
        └── iman-hakikatleri.vtt
```

### Directory conventions

1. **Top-level = collection** (`risale-i-nur/`, `hizmet/`, `audio/`, `video/`)
2. **Second-level = book / work name** (`sozler/`, `mektubat/`)
3. **Third-level = language** (`tr/`, `ar/`, `en/`) — only for text, since audio is usually single-language
4. **Filename = slugified title + primary author**

### Per-file companions

For every source, store up to 3 files:

| File | Purpose |
|---|---|
| `.pdf` / `.docx` / `.epub` / `.mp3` / `.mp4` | **Original** — what the user downloads or streams |
| `.html` | **Rendered text** — used by `TextViewer` for clean reading + chunk highlighting (only for text sources) |
| `.vtt` | **WebVTT transcript** — used by `AudioViewer` / `VideoViewer` to show synced text with karaoke highlight (only for audio/video) |
| `.meta.json` | **Page / chunk offset map** — `{ pages: [{ num: 5, charOffset: 1200 }, ...] }` so viewer can resolve chunk → page or chunk → character range |

## URL scheme

The `Chunk` model gets a new field: `source_url`. At ingestion time the Python pipeline fills this in:

```python
source_url = f"https://sources.hizmetsearch.com/{collection_slug}/{book_slug}/{lang}/{filename}"
```

### Deep-linking format

The frontend viewer route is:

```
/source/:docId?chunk=:chunkId
```

For text (PDF / HTML):
- Viewer loads the HTML companion (or uses `<iframe src="file.pdf#page=N">` for native PDF fallback)
- Scrolls to the chunk's page (or character offset in HTML)
- Wraps the chunk text in `<mark>` for yellow highlighting

For audio/video:
- Player auto-seeks to `chunk.timestamp_start`
- Transcript view scrolls to and highlights the matching VTT cue

## Ingestion pipeline changes

The existing `hizmetrag` Python pipeline needs two additions during extraction:

1. **Write rendered HTML** alongside the original for PDF/DOCX/EPUB — reuse the existing extractor output, wrap paragraphs in `<p data-page="N" data-offset="X">` so the viewer knows where chunks land.
2. **Compute and store `source_url`** on each `Chunk` before indexing to Qdrant.

R2 upload can be done via a single `rclone` or `aws s3 cp` (R2 is S3-compatible) after ingestion:

```bash
rclone sync ./data/rendered r2:hizmetsearch-sources --progress
```

## CORS + cache headers

Set on the R2 bucket:

```json
{
  "cors": [
    {
      "origin": ["https://hizmetsearch.com", "https://hizmetsearch.netlify.app"],
      "methods": ["GET", "HEAD"],
      "headers": ["Range", "If-Modified-Since"],
      "maxAge": 3600
    }
  ]
}
```

Serve `.html`, `.vtt`, `.meta.json` with `Cache-Control: public, max-age=86400, immutable` — sources don't change often, and when they do, the filename changes (hash suffix).

## Legal

Only mirror sources where:
- Public domain (pre-1929 works), **or**
- Explicit permission from the publisher (Sözler Neşriyat, Nil Yayınları, etc.), **or**
- CC-licensed

Store a `license` field per doc in the meta.json; the viewer shows it as a footer.
