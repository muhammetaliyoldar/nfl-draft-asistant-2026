import fs from 'node:fs';
import path from 'node:path';
import { normalizeName } from './database.js';
import type { Position, SourceEntry, SourceKind } from './types.js';

const positionPattern = /\b(QB|RB|WR|TE|DST|DEF|K)\b/i;
const asPosition = (value?: string | null): Position | null => {
  const p = value?.toUpperCase();
  if (p === 'DST') return 'DEF';
  return ['QB', 'RB', 'WR', 'TE', 'DEF', 'K'].includes(p ?? '') ? p as Position : null;
};

function meta(fileName: string, content: string): { kind: SourceKind; format: SourceEntry['format']; source: string } {
  const lower = `${fileName} ${content.slice(0, 500)}`.toLowerCase();
  const kind: SourceKind = lower.includes('mock') || lower.includes('draft board') || lower.includes('draft_board') ? 'mock'
    : /\b(qb|rb|wr|te)\b/.test(lower) && !lower.includes('top 100') && !lower.includes('overall') ? 'position' : 'overall';
  const format = lower.includes('half ppr') ? 'half_ppr' : lower.includes('ppr') ? 'ppr' : lower.includes('standard') || lower.includes('non ppr') ? 'standard' : 'unknown';
  const source = fileName.split(/[_-]/).slice(0, 2).join(' ') || 'Yerel kaynak';
  return { kind, format, source };
}

function cleanPlayer(value: string) {
  return value.replace(/\*\*/g, '').replace(/\s+-\s+(QB|RB|WR|TE|DST|DEF|K)\b.*$/i, '')
    .replace(/\s+\([^)]*\)\s*(?:-|$).*/, '').replace(/\s+-\s+\d+(?:\.\d+)?\s*(?:Pts|PPG).*$/i, '')
    .replace(/\s+\*\([^)]*\)\*$/, '').trim();
}

export function parseMarkdownFile(filePath: string): SourceEntry[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const info = meta(fileName, content);
  let tier: string | null = null;
  const entries: SourceEntry[] = [];
  for (const raw of content.split('\n')) {
    const heading = raw.match(/^#{2,4}\s+\*?\*?(.+?)\*?\*?\s*$/);
    if (heading) { tier = heading[1].replace(/\*\*/g, '').trim(); continue; }
    const item = raw.match(/^\s*\*\s+\*\*(.+?):\*\*\s+(.+)$/);
    if (!item) continue;
    const left = item[1];
    const right = item[2];
    const rankMatch = left.match(/#(\d+)/);
    const roundPick = left.match(/(\d+)\.(\d+)/);
    const position = asPosition(right.match(positionPattern)?.[1] ?? left.match(positionPattern)?.[1]);
    const playerText = cleanPlayer(right);
    if (playerText.length < 3 || playerText.toLowerCase().includes('tur')) continue;
    const rank = rankMatch ? Number(rankMatch[1]) : roundPick ? (Number(roundPick[1]) - 1) * 12 + Number(roundPick[2]) : null;
    entries.push({ source: info.source, fileName, kind: info.kind, format: info.format, playerText,
      normalizedText: normalizeName(playerText), positionHint: position, tier, rank,
      pickNumber: info.kind === 'mock' ? rank : null, sleeperId: null, confidence: 0 });
  }
  return entries;
}

export function parseAllMarkdown(root = path.resolve('sources')) {
  return fs.readdirSync(root).filter(f => f.endsWith('.md') && f !== 'master_rankings.md').flatMap(f => parseMarkdownFile(path.join(root, f)));
}
