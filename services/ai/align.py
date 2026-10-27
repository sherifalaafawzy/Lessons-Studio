"""Word timings for narration clips, by forced alignment of the known script (PLAN.md Appendix C, item 2).

Gemini TTS returns audio without timestamps. Each sentence is voiced on its own, so its start and end
are already exact; this finds where each word falls inside it. It feeds the script's own tokens to
Whisper (faster-whisper) and reads word boundaries from the decoder's cross-attention (dynamic time
warping), so nothing has to be recognised correctly for the times to be right. With --check it also
transcribes each clip, so the caller can flag a voice that skipped or changed words.

Input (--in): {"clips": [{"key": "...", "wav": "path.wav", "lang": "en", "text": "..."}]}
Output (--out): {"<key>": {"words": [{"w", "s", "e", "p"}], "heard": "..." | null, "duration": seconds}}
Times are seconds from the start of the clip; p is the aligner's confidence (0-1).
"""

import argparse
import json
import sys

from faster_whisper import WhisperModel, decode_audio
from faster_whisper.audio import pad_or_trim
from faster_whisper.tokenizer import Tokenizer

RATE = 16000
MAX_SECONDS = 29.5  # Whisper sees 30 s at a time; sentences are far shorter


def align(model, tokenizer_for, clip, check):
    audio = decode_audio(clip["wav"], sampling_rate=RATE)
    duration = len(audio) / RATE
    if duration > MAX_SECONDS:
        raise ValueError(f"clip is {duration:.1f} s; split the sentence")
    lang = clip["lang"].split("-")[0].lower()
    features = model.feature_extractor(audio)
    frames = features.shape[-1] - 1
    encoded = model.encode(pad_or_trim(features[:, :frames]))
    tok = tokenizer_for(lang)
    tokens = tok.encode(" " + clip["text"].strip())
    found = model.find_alignment(tok, [tokens], encoded, frames)[0]
    words = [
        {"w": w["word"].strip(), "s": round(float(w["start"]), 3), "e": round(float(w["end"]), 3), "p": round(float(w["probability"]), 3)}
        for w in found
    ]
    heard = None
    if check:
        segments, _ = model.transcribe(audio, language=lang, beam_size=1, condition_on_previous_text=False, without_timestamps=True)
        heard = " ".join(s.text.strip() for s in segments)
    return {"words": words, "heard": heard, "duration": round(duration, 3)}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small", help="Whisper model: tiny, base, small, medium, large-v3, turbo")
    ap.add_argument("--check", action="store_true", help="also transcribe each clip")
    a = ap.parse_args()

    with open(a.inp, encoding="utf-8") as f:
        clips = json.load(f)["clips"]
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    tokenizers = {}

    def tokenizer_for(lang):
        if lang not in tokenizers:
            tokenizers[lang] = Tokenizer(model.hf_tokenizer, model.model.is_multilingual, task="transcribe", language=lang)
        return tokenizers[lang]

    out = {}
    for i, clip in enumerate(clips, 1):
        try:
            out[clip["key"]] = align(model, tokenizer_for, clip, a.check)
        except Exception as e:  # one bad clip must not lose the rest
            out[clip["key"]] = {"error": f"{type(e).__name__}: {e}"}
        print(f"aligned {i}/{len(clips)}", file=sys.stderr, flush=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
