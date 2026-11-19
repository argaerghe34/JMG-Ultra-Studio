# B-roll finder – where it can look (research, 19 Nov 2026)

What was checked before building `js/tools/47-brollfinder.js`: which sites a panel with Node but no server can search
and download from lawfully, what each gives for a preview, and how the licence is told. "Live" means a real request
was made from this Mac on 19 Nov 2026 and the answer read; "docs" means the site's own documentation was read.

## Summary

| Source | In the tool | Key | Search | Preview without downloading | Licence | Checked |
|---|---|---|---|---|---|---|
| Pexels | on | free key | `GET https://api.pexels.com/v1/videos/search?query=&per_page=` (≤ 80), header `Authorization: <key>` | smallest MP4 in `video_files`, streamed | Pexels licence: free, no credit | docs (not live – no key here) |
| Pixabay | on | free key | `GET https://pixabay.com/api/videos/?key=&q=&per_page=` (3–200) | `videos.tiny` MP4, streamed | Pixabay licence: free, no credit | docs (not live – no key here) |
| Wikimedia Commons | on | none | MediaWiki API, `generator=search`, `gsrsearch=filetype:video …`, `prop=videoinfo` with `extmetadata` and `derivatives` | 240p WebM copy, streamed | per file: CC BY, CC BY-SA, CC0, public domain | live |
| YouTube | on | none | yt-dlp (the Download tab's engine): `--flat-playlist -J` on a search | a small stream address from `yt-dlp -g` (not saved) | Creative Commons BY only when the uploader marked it; else standard licence | live |
| Internet Archive | off to start | none | `advancedsearch.php` + `metadata/<id>/files` | the item's H.264 MP4, streamed | per item (`licenseurl`) | live |
| NASA image and video library | off to start | none | `images-api.nasa.gov/search?media_type=video` + `/asset/<id>` | `~preview.mp4` / `~small.mp4`, streamed | NASA media: generally not copyrighted | live |
| Coverr | no | – | has a public API (`api.coverr.co`) | – | Coverr licence | docs only |
| Mixkit | no | – | no API | – | Mixkit licence | – |
| Videvo | no | – | no public API | – | mixed, per clip | – |

## Each source

**Pexels** – <https://www.pexels.com/api/documentation/>. Keys are given at once at <https://www.pexels.com/api/>.
200 requests an hour, 20,000 a month. A video has `id, width, height, url, image, duration, user{name,url}`,
`video_files[{quality: hd|sd|hls, file_type, width, height, fps, link}]`, `video_pictures`. The API guidelines ask for a
prominent link to Pexels and a credit to the creator where possible, and forbid copying Pexels' core function (a
wallpaper app, say). The tool shows "Footage from Pexels" with a link under the results, names the author on each
card, and keeps author and page in the folder's list. Licence (<https://www.pexels.com/license/>): free to use, paid
work included, no credit needed; not to be resold unaltered or put on other stock sites.

**Pixabay** – <https://pixabay.com/api/docs/>. Key shown on that page when signed in. 100 requests a minute. The
docs say requests must be cached for 24 hours – the tool keeps each search for a day (also for the other sources) –
and that videos may be embedded directly. A hit has `id, pageURL, tags, duration, user, user_id`,
`videos{large,medium,small,tiny}{url,width,height,size,thumbnail}` (`large` can be empty). They ask that people be
shown where the footage is from. Licence (<https://pixabay.com/service/license-summary/>): free to use, no credit
needed; not to be sold or passed on standalone.

**Wikimedia Commons** – <https://www.mediawiki.org/wiki/API:Search>,
<https://www.mediawiki.org/wiki/Extension:CommonsMetadata>. No key. Everything on Commons is under a free licence
or in the public domain, told per file in `extmetadata` (`LicenseShortName`, `LicenseUrl`, `Artist`,
`AttributionRequired`). Files are WebM or Ogg, sometimes very large (one result was 774 MB): the tool downloads
Commons' own 1080p-or-smaller WebM copy and, since Premiere doesn't open WebM, makes it into an H.264 MP4 with the
Download tab's ffmpeg when that is set up (otherwise the WebM is kept and the folder's list still names it).
CC BY-SA is shown with a caution: the film using it has to be shared under the same licence.
**Open point (19 Nov 2026):** searching works, but two real downloads from `upload.wikimedia.org` made by Node were
answered "429 Too many requests" (Retry-After 120), also after waiting. Wikimedia's User-Agent policy
(<https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy>) asks apps to say who they are
*and how to reach their maker*; the tool sends `JMG-Ultra-Studio/<version> (B-roll finder; desktop video-editing
panel)` with no contact, on purpose – adding the project's web address or an e-mail is the owner's decision (it is one
line, `UA` in `js/tools/47-brollfinder.js`). It may also have been this network's address being rate-limited. The tool
never pretends to be a browser. Until this is settled a refused Commons download says so plainly and points to the
clip's page; thumbnails and previews are loaded by the panel's own browser engine and are not affected by the app name.

**YouTube** – no official search without a paid-quota Google key, so the existing downloader is used:
`yt-dlp --flat-playlist -J "ytsearch8:<words>"` answers in about 2 s with id, title, length and channel (no
resolution, no licence). YouTube's own "Creative Commons" search filter is the address
`https://www.youtube.com/results?search_query=<words>&sp=EgIwAQ%253D%253D`, which yt-dlp reads the same way – checked
live: a result from it reported `license: "Creative Commons Attribution license (reuse allowed)"` on a full look-up.
So: with "Only free-to-use footage" on, only the Creative Commons search is made; off, the ordinary search is added and
those videos are marked "standard licence: you need permission to use this" and left unticked.
Caveats, said in the tool: the Creative Commons mark is the uploader's own claim (people do re-upload others' work),
and YouTube's terms don't allow downloading except where YouTube offers it or the owner agrees – so downloads are for
footage you have the right to use. Preview: an embedded player doesn't work from a panel (no web address to give
YouTube, error 153), so `yt-dlp -g` is asked for a small stream (format 18, or a ≤ 480p H.264 picture-only stream)
and the `<video>` plays it; nothing is written to disk. If that fails the video's page is opened in the browser.

**Internet Archive** – <https://archive.org/developers/> (`advancedsearch.php`, `metadata/<id>/files`,
`services/img/<id>`, `download/<id>/<file>`). No key. Licence per item in `licenseurl` (often missing: then "not
stated – you need permission"). Results are long films, newsreels and home uploads more often than clean stock
shots, and each result costs a second request, so it is off to start with.

**NASA** – <https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf>. No key. Good for space, Earth from orbit and
science, poor for anything else, so off to start with. NASA media is generally not copyrighted
(<https://www.nasa.gov/nasa-brand-center/images-and-media/>): free to use, but not to suggest NASA backs a product,
and logos and recognisable people are another matter.

**Left out**
- *Coverr* has a public API with search and a signed download address, but its documentation was malformed when read
  and says nothing about keys or limits; worth another look.
- *Mixkit* (Envato) has no API; its terms don't allow automated collection.
- *Videvo* (now part of Freepik) has no public API, and its licences differ clip by clip.
- An official YouTube Data API key would give the licence in the search itself (`videoLicense=creativeCommon`), but
  it is one more key to get and has a daily quota; yt-dlp is already in the panel.

## What "free to use" means in the tool
Stock licences (Pexels, Pixabay), public domain, CC0, NASA, CC BY and CC BY-SA (with its caution). Not free: CC BY-NC
(not for paid work), CC BY-ND (may not be cut into another film), YouTube's standard licence, and anything with no
licence stated. The filter "Only free-to-use footage" is on by default; with it off, the others are shown in red,
are not ticked, and downloading one asks first. Every downloaded clip is listed in `Sources and licences.csv` in its
folder: file, title, source, page, author, licence, licence link, whether it's free, a credit line, the request and
the date. This is a plain-words guide, not legal advice: the page linked for each clip is what counts.

## Shape (aspect ratio) and size (added 19 Nov 2026, the user asked)
"Shape": Any / 16:9 / 9:16 / 1:1 / 4:5. "Size": any, or at least 720p / 1080p / 4K (on the short side). "Size to
download": the best copy up to 720p / 1080p / 4K, or the largest there is.

| Source | Shape | Least size | Copy downloaded |
|---|---|---|---|
| Pexels | its own `orientation=landscape/portrait/square`, then checked from width × height (4:5 is asked as portrait) | its own `size=small/medium/large` (HD / Full HD / 4K) | best `video_files` entry up to the size |
| Pixabay | no filter of its own: three times as many results are asked for and sorted by width × height | its own `min_width` / `min_height` | best of `large/medium/small/tiny` up to the size |
| Wikimedia Commons, Internet Archive | sorted by width × height | sorted by width × height | Commons: its best WebM copy up to the size; Archive: its MP4 |
| NASA | **can't**: the library doesn't give width (shown anyway, with a note) | from the copy's name (`~large` ≈ 1080p) | best copy up to the size |
| YouTube | **can't**: yt-dlp's quick search gives no width or height, and looking each video up fully takes seconds apiece (shown anyway, with a note) | **can't** at search | yt-dlp's format choice: H.264 up to 720p or 1080p; "4K" and "largest" use the Download tab's "Highest quality" (converted to H.264) |

A shape counts with 8% leeway, so cinema-wide 4K (4096×2160) is still 16:9. Each option shows its size and shape
("1920×1080 · 16:9"), or "size not said".

## Nothing is downloaded before the button
Searching asks each site for a list (text and thumbnail addresses). Thumbnails are `<img>` and previews are
`<video>` pointing at the site's own small file: they play from the internet and nothing is written to the chosen
folder. Only "Download" saves files; clips already in the folder are skipped.
