# Artwork provenance

The twelve painted raster assets below were generated on 26 October 2026 with
OpenAI's built-in image generation tool, then converted for the browser build.
They depict fictional people and places. No image generation runs while you play.
The jazz-bar archive image is fictional too; it is not a historical photograph.

The studio window and initial portraits established the style. Later street
scenes used the window as a reference, Ivo used the existing portraits, and
Hugo at the bench used his own portrait. The reference images are part of this
same set. The backgrounds leave room for the player's actual print to be
composited separately. Required lettering is rendered by the game.

| Asset | Role |
| --- | --- |
| [window.webp](../../src/ui/atelier/assets/window.webp) | Studio service window. Original paper-and-ink scene, with space for a customer and approved print. |
| [clem.webp](../../src/ui/atelier/assets/clem.webp) | Clem portrait. Fictional jazz-bar owner in the studio visual style. |
| [mara.webp](../../src/ui/atelier/assets/mara.webp) | Mara portrait. Fictional bakery owner in the studio visual style. |
| [hugo.webp](../../src/ui/atelier/assets/hugo.webp) | Hugo portrait. Fictional watch repairer in the studio visual style. |
| [ivo.webp](../../src/ui/atelier/assets/ivo.webp) | Ivo portrait. Fictional apprentice, using the existing Clem and Hugo portraits as style references. |
| [jazz.webp](../../src/ui/neighbourhood/assets/jazz.webp) | Jazz-bar exterior. Evening street scene using the studio window as a style reference. |
| [bakery.webp](../../src/ui/neighbourhood/assets/bakery.webp) | Bakery exterior. Evening street scene using the studio window as a style reference. |
| [watch.webp](../../src/ui/neighbourhood/assets/watch.webp) | Watch workshop exterior. Evening street scene using the studio window as a style reference. |
| [courtyard.webp](../../src/ui/neighbourhood/assets/courtyard.webp) | Courtyard gathering. An outdoor print gathering setting with space for separate player work. |
| [open-studios.webp](../../src/ui/neighbourhood/assets/open-studios.webp) | Open-studio gathering. A workshop gallery setting with space for separate player work. |
| [first-night-room.jpg](../../src/ui/creative/assets/first-night-room.jpg) | First-night room. A fictional archival-style jazz-bar photograph; not a historical photograph. |
| [hugo-at-bench.webp](../../src/ui/creative/assets/hugo-at-bench.webp) | Hugo at the bench. A keepsake illustration using the existing Hugo portrait as its character reference. |

The [asset manifest](artwork-manifest.json) records the exact files, byte sizes,
SHA-256 hashes and generation intent. WebP assets were encoded with cwebp;
the archive-style photograph was converted to JPEG. The original generation
records have been condensed here to describe the shipped assets without local
machine information.

The print layouts, motifs, lettering, miniature geometry and interface graphics
are drawn by code. Sound is synthesized in the browser. Fonts are bundled from
Young Serif and Atkinson Hyperlegible, with their licences retained in
[third-party notices](../../public/THIRD-PARTY-NOTICES.txt).

README screenshots are captures of the running game, not promotional mockups.
The [content terms](../../CONTENT-LICENSE.md) reserve only rights actually held
and do not assert exclusive copyright in generated material.
