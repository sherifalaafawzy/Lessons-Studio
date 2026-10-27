// Markdown files are bundled as text (build.mjs: loader ".md": "text").
declare module "*.md" {
  const text: string;
  export default text;
}
