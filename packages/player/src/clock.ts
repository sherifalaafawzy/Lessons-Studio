/** Where the lesson is in time. Narration drives it when there is audio; otherwise a silent clock does. */
export interface Clock {
  readonly playing: boolean;
  time(): number;
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  setRate(rate: number): void;
  destroy(): void;
}

export class SilentClock implements Clock {
  playing = false;
  private base = 0;
  private since = 0;
  private rate = 1;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  time(): number {
    return this.playing ? this.base + ((this.now() - this.since) / 1000) * this.rate : this.base;
  }
  play(): Promise<void> {
    if (!this.playing) {
      this.since = this.now();
      this.playing = true;
    }
    return Promise.resolve();
  }
  pause(): void {
    if (!this.playing) return;
    this.base = this.time();
    this.playing = false;
  }
  seek(t: number): void {
    this.base = t;
    this.since = this.now();
  }
  setRate(rate: number): void {
    this.base = this.time();
    this.since = this.now();
    this.rate = rate;
  }
  destroy(): void {
    this.playing = false;
  }
}

/**
 * Follows an <audio> element. Nothing downloads until the first play (preload="none").
 * `onError` runs when the narration can't load or play (offline, missing, unsupported), so the player can go on silently.
 */
export class AudioClock implements Clock {
  private readonly audio: HTMLAudioElement;
  private readonly src: string;

  constructor(src: string, onEnded: () => void, onError: () => void = () => {}) {
    this.src = src;
    this.audio = new Audio();
    this.audio.preload = "none";
    this.audio.addEventListener("ended", onEnded);
    this.audio.addEventListener("error", onError);
  }

  get playing(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }
  time(): number {
    return this.audio.currentTime;
  }
  play(): Promise<void> {
    if (!this.audio.src) this.audio.src = this.src;
    return this.audio.play();
  }
  pause(): void {
    this.audio.pause();
  }
  seek(t: number): void {
    if (!this.audio.src) this.audio.src = this.src;
    this.audio.currentTime = t;
  }
  setRate(rate: number): void {
    // Loading a source resets playbackRate to defaultPlaybackRate, so set both.
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
  }
  destroy(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}

/** Opus when the browser plays it, else the fallback file. */
export function pickAudio(audio: string | undefined, fallback: string | undefined): string | undefined {
  if (!audio) return fallback;
  if (!fallback || typeof Audio === "undefined") return audio;
  const a = new Audio();
  const opus = a.canPlayType('audio/ogg; codecs="opus"') || a.canPlayType('audio/webm; codecs="opus"');
  return opus ? audio : fallback;
}
