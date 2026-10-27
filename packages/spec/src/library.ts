// The shared library: files many lessons use (the cast, the extended icons, the Darsi mark), served once from
// Lesson Studio's Hosting at /lib/ and referred to as "@lib/v1/...". The player resolves them against its `library`.
import { LIBRARY_ICONS } from "./library-icons.ts";

export { LIBRARY_ICONS, type LibraryIcon } from "./library-icons.ts";

export const DEFAULT_LIBRARY = "https://lessons-studio-6b509.web.app/lib/";
export const CAST = ["amina", "okafor", "salma", "joseph", "farah"] as const;
export const MOODS = ["smile", "talking", "curious", "happy"] as const;
export type CastMember = (typeof CAST)[number];
export type Mood = (typeof MOODS)[number];

/** A cast member in a mood, as an image path. */
export const castPath = (who: CastMember, mood: Mood): string => `@lib/v1/cast/${who}_${mood}.svg`;
export const MARK_PATH = "@lib/v1/brand/darsi-mark.svg";
export const LIBRARY_ICONS_PATH = "@lib/v1/icons.json";

const LIB_FILE = new RegExp(`^@lib/v1/(cast/(${CAST.join("|")})_(${MOODS.join("|")})\\.svg|brand/darsi-mark\\.svg|icons\\.json)$`);
/** Whether a path names a file the library has. */
export const isLibPath = (p: string): boolean => LIB_FILE.test(p);

const CORE = new Set(["user", "page", "bot", "server", "data", "lock", "shield", "phone", "mail", "link", "warning", "key", "cloud", "chip", "wifi", "check", "cross", "spark"]);
const LIBRARY = new Set<string>(LIBRARY_ICONS);
/** An icon the player draws: one of its own 18, or one of the library's (fetched once when a lesson uses it). */
export const isIcon = (name: unknown): boolean => typeof name === "string" && (CORE.has(name) || LIBRARY.has(name));
/** Whether drawing this icon needs the library's icon file. */
export const needsLibraryIcon = (name: string): boolean => !CORE.has(name) && LIBRARY.has(name);
