import { unified } from './node_modules/unified/index.js';
import remarkParse from './node_modules/remark-parse/index.js';
import remarkRehype from './node_modules/remark-rehype/lib/index.js';
import rehypeStringify from './node_modules/rehype-stringify/index.js';
import rehypeParse from './node_modules/rehype-parse/index.js';
import rehypeRemark from './node_modules/rehype-remark/lib/index.js';
import remarkStringify from './node_modules/remark-stringify/index.js';

async function markdownToHtml(md) {
  const r = await unified().use(remarkParse).use(remarkRehype).use(rehypeStringify).process(md);
  return String(r);
}

async function htmlToMarkdown(html) {
  const r = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkStringify, { bullet: '-', fences: true, listItemIndent: 'one', strong: '*' })
    .process(html);
  return String(r);
}

const tableMarkdown = `| A | B | C |
| - | - | - |
| a | b | c |
| d | e | f |
`;

async function main() {
  // Step 1: markdown → HTML (what remark-rehype produces)
  const html1 = await markdownToHtml(tableMarkdown);
  console.log('=== HTML from markdown ===');
  console.log(html1);

  // Step 2: HTML → markdown (canonical)
  const canonical1 = await htmlToMarkdown(html1);
  console.log('=== Canonical markdown from remark-rehype HTML ===');
  console.log(JSON.stringify(canonical1));

  // Step 3: Simulate Tiptap's TableNode.renderHTML (wraps ALL rows in <tbody>)
  const tiptapHtml = '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th><th><p>C</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td><td><p>c</p></td></tr><tr><td><p>d</p></td><td><p>e</p></td><td><p>f</p></td></tr></tbody></table>';
  console.log('\n=== Tiptap HTML ===');
  console.log(tiptapHtml);

  // Step 4: HTML → markdown from Tiptap output  
  const canonical2 = await htmlToMarkdown(tiptapHtml);
  console.log('=== Canonical markdown from Tiptap HTML ===');
  console.log(JSON.stringify(canonical2));

  // Compare
  console.log('\n=== Match? ===', canonical1 === canonical2);
  
  if (canonical1 !== canonical2) {
    console.log('\n=== Differences ===');
    console.log('From remark-rehype HTML:', canonical1);
    console.log('From Tiptap HTML:', canonical2);
  }
}

main().catch(console.error);
