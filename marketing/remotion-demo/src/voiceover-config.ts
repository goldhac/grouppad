// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the GroupPad demo: scene timing + Scout's narration.
// Everything (the timeline, each scene, the audio sync) reads from THIS file so
// durations never drift. Technique borrowed from the Claude+Remotion+ElevenLabs
// writeup; content is 100% GroupPad's real product.
//
// Script rule: one person (Scout) thinking out loud, not six separate headlines.
// Lines bridge with connectors ("usually", "and", "still torn?", "then") so the
// read is continuous. Timing is derived from the narration, not the reverse.
// ─────────────────────────────────────────────────────────────────────────────

export const FPS = 30;

export type Scene = {
  id: string;
  /** Seconds this scene is on screen. Derived from the narration's natural pace. */
  durationSeconds: number;
  /** Seconds to delay the voiceover so it doesn't overlap the transition wipe. */
  audioDelay: number;
  /** Scout's narration line for this scene. */
  text: string;
  /** Voiceover audio file in public/vo/. Filled once generated via muapi. */
  audio?: string;
};

export const SCENES: Scene[] = [
  {
    id: 'intro',
    durationSeconds: 5.5,
    audioDelay: 0.4,
    text: 'Planning a trip with friends usually means forty open tabs and a group chat that never actually decides.',
    audio: 'vo/intro.mp3',
  },
  {
    id: 'board',
    durationSeconds: 6.0,
    audioDelay: 0.5,
    text: 'GroupPad puts every home your group is considering onto one shared board.',
    audio: 'vo/board.mp3',
  },
  {
    id: 'perPerson',
    durationSeconds: 6.0,
    audioDelay: 0.5,
    text: 'And every home shows the real cost per person, recounted the second someone new joins.',
    audio: 'vo/perPerson.mp3',
  },
  {
    id: 'vote',
    durationSeconds: 5.5,
    audioDelay: 0.5,
    text: 'Everyone votes out in the open, and the homes your group loves rise into the shortlist on their own.',
    audio: 'vo/vote.mp3',
  },
  {
    id: 'scout',
    durationSeconds: 6.0,
    audioDelay: 0.5,
    text: "Still torn? Ask Scout. It ranks every home for your group and tells you exactly why.",
    audio: 'vo/scout.mp3',
  },
  {
    id: 'lock',
    durationSeconds: 5.0,
    audioDelay: 0.5,
    text: 'Then you lock one official pick. The whole group, finally agreed.',
    audio: 'vo/lock.mp3',
  },
  {
    id: 'end',
    durationSeconds: 3.5,
    audioDelay: 0.3,
    text: 'GroupPad. Plan it together, free in your browser.',
    audio: 'vo/end.mp3',
  },
];

export const sceneFrames = (s: Scene) => Math.round(s.durationSeconds * FPS);
export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + sceneFrames(s), 0);
export const TOTAL_SECONDS = SCENES.reduce((n, s) => n + s.durationSeconds, 0);
