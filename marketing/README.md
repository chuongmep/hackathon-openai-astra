# Forma marketing video

An editable, offline English product film, capped at **120 seconds**. The renderer creates a 1280×720 H.264/AAC MP4 at 24 fps with animated architectural geometry, workflow cards, burned-in English captions, a separate SRT, and a normalized English voiceover.

## Render

Requirements: Python 3.10+, Pillow, FFmpeg/ffprobe, and macOS `say` (or supplied narration WAVs).

```sh
cd marketing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Install FFmpeg if needed: brew install ffmpeg
python render.py
```

Result: `output/Forma-demo.mp4`.

`storyboard.json` controls the exact project name, narration, headlines, scene content, voice, and speaking rate. The default Daniel voice is an installed British English system voice with a direct, confident delivery at 175 words/minute. No API key, paid service, or network connection is required for rendering after dependencies are installed. Audio quality depends on the installed system voice. For a professional performance, record or generate the same narration with an energetic, authoritative English delivery: clear diction, purposeful pauses, restrained excitement, and emphasis on “see clearly” and “build confidently.”

```sh
say -v '?'                         # List installed voices
python render.py --voice Daniel
python render.py --fps 12          # Faster draft
python render.py --audio-dir assets/narration
```

With `--audio-dir`, provide one WAV for each scene ID: `intro.wav`, `explore.wav`, `isolate.wav`, `mapping.wav`, `conversation.wav`, `verify.wav`, `astra.wav`, and `outro.wav`. This route also works on Linux with TrueType fonts. Set `MARKETING_FONT` and `MARKETING_FONT_BOLD` if system fonts cannot be found.

Scene duration is measured from narration plus a short pause. Rendering stops with an error if the total would exceed two minutes. Captions are timed proportionally by word count within each scene, not forced-aligned. Update the text to match any replacement narration.

## Creative direction and accuracy

Dark architectural canvas, mint selection accents, rotating illustrative building blocks, large editorial headlines, short workflow sequences, and a concise closing message. There is no background music, leaving the voice clear.

This is an **illustrative marketing demo**, not a screen recording. Geometry, object data, mapping suggestions, and conversation cards are representative graphics. Actual frontend capabilities were checked against the local source: IFC loading, navigation, properties, isolate, review issues, spreadsheet export, and registered model tools. Existing chat replies are mocked. GPT-Live-1, visual understanding, AI mapping, and Agents API are presented as the requested **Astra integration vision**, not verified live integrations or award wins. The video does not promise automatic certification or cost calculation. It preserves the requested spelling `Forma`.

## Outputs and validation

- `Forma-demo.mp4`: complete shareable film.
- `captions.srt`: sidecar English captions (also burned into the video).
- `timeline.json`: measured scene starts and durations.
- `preview-*.jpg`: review frames from each scene.
- Intermediate audio and scene clips for editing.

All generated outputs are ignored by Git. Source files are isolated in `marketing`; the frontend is unchanged.

```sh
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of json output/Forma-demo.mp4
ffmpeg -v error -i output/Forma-demo.mp4 -f null -
```

## Silent edit from a real screen recording

`edit_recording.py` uses real footage, removes loading and idle sections according to `recording-edit.json`, applies **1.2×** speed to every retained segment, and adds English descriptions in a separate footer. The full app frame stays visible. Output is 1920×1080 at 30 fps, with **no audio stream** and a maximum duration of 120 seconds. The current edit is approximately 97 seconds.

```sh
python edit_recording.py '/absolute/path/to/recording.mov'
```

Output: `output/recording-short.mp4`. Edit the source-time `start` and `end` values and descriptions in `recording-edit.json` to change the cut. This renderer uses the same Pillow/FFmpeg dependencies and fonts as the original renderer, but does not use voice synthesis. The original recording is never modified.
