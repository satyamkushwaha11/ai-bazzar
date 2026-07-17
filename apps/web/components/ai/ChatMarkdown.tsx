import * as React from 'react';

/**
 * A deliberately small markdown renderer for chat bubbles.
 *
 * Why not react-markdown: bubbles need bold, italic, code, line breaks and
 * simple lists — nothing else. The remark stack costs ~100KB for that, and
 * pulling it in would also invite headings, tables and images that blow out a
 * 400px bubble.
 *
 * SAFETY: this emits React elements only. There is no dangerouslySetInnerHTML
 * anywhere, so LLM output — which is attacker-influencable via the buyer's own
 * messages — cannot inject HTML or script. Raw HTML in the model's output is
 * rendered as literal text, which is the correct outcome.
 *
 * STREAMING: only CLOSED delimiter pairs are formatted. A half-arrived `**₹1,7`
 * stays literal until its closing `**` lands, so text never flickers between
 * styled and unstyled mid-token.
 */

/** Inline: **bold**, *italic*, _italic_, `code`. Longest delimiters first. */
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;

    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      // Prices land here constantly — tabular keeps them from jittering.
      return (
        <strong key={key} className="tabular font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.length > 4 && part.startsWith('__') && part.endsWith('__')) {
      return (
        <strong key={key} className="tabular font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.length > 2 && part.startsWith('_') && part.endsWith('_')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

/** Group lines into paragraphs and lists. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBER);
    const last = blocks[blocks.length - 1];

    if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1]!);
      else blocks.push({ kind: 'ul', items: [bullet[1]!] });
      continue;
    }
    if (numbered) {
      if (last?.kind === 'ol') last.items.push(numbered[1]!);
      else blocks.push({ kind: 'ol', items: [numbered[1]!] });
      continue;
    }
    if (line.trim() === '') {
      // Blank line ends the current block.
      if (last?.kind === 'p' && last.lines.length) blocks.push({ kind: 'p', lines: [] });
      continue;
    }
    if (last?.kind === 'p') last.lines.push(line);
    else blocks.push({ kind: 'p', lines: [line] });
  }

  return blocks.filter((b) => (b.kind === 'p' ? b.lines.length > 0 : b.items.length > 0));
}

export function ChatMarkdown({ text }: { text: string }) {
  const blocks = React.useMemo(() => toBlocks(text), [text]);

  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) => {
        if (b.kind === 'ul') {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-4">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (b.kind === 'ol') {
          return (
            <ol key={i} className="list-decimal space-y-0.5 pl-4">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, `${i}-${j}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((ln, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(ln, `${i}-${j}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
