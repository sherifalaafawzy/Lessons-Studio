/**
 * The science parsers on their own entry (@lessonstudio/spec/science), for the player's science kit: importing them
 * through the package's main entry would put them in the chunk the core player shares with the kit.
 */
export { parseTex, TexError, TEX_TONES, TEX_MAX, type MNode, type ParsedTex } from "./tex.ts";
export { compileExpr, ExprError, type Fn } from "./expr.ts";
