/* The issues of a pack as an agent fixes them: grouped by chapter, each group naming the files to edit, so a refused pack is
   repaired in place (only those files, then make_pack.py and the upload again) and nothing that is right is made again. */
/** "ch03: [rule] msg", "ch03-e004 …", "translations el ch03 …" → { ch03: [ … ] } (the issues of the pack as a whole under "pack") */
export function byChapter(issues: readonly string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const x of issues) {
    const k = /^(?:\S*?translations?\S*\s+(?:[\w-]+\s+)?)?(ch\d+)\b/.exec(x) ?? /\b(ch\d+)(?:-[a-z]\d+)?\b/.exec(x.slice(0, 80));
    const key = k?.[1] ?? 'pack',
      text = x.startsWith(`${key}: `) ? x.slice(key.length + 2) : x;
    m.set(key, [...(m.get(key) ?? []), text]);
  }
  return m;
}

/** the issues as an agent fixes them: per chapter, the files to edit, then each issue */
export function issueReport(
  errors: readonly string[],
  warnings: readonly string[],
  opts: { warnings: boolean; limit: number; more?: string },
): string {
  const out: string[] = [];
  let n = 0;
  const list = (title: string, xs: readonly string[]): void => {
    for (const [ch, items] of byChapter(xs)) {
      out.push(
        `\n## ${title} — ${ch} (${items.length})${ch === 'pack' ? ' — subject.json / the pack as a whole' : ` — edit only ${ch}'s files: chapters/${ch}.json, map/${ch}.json (concepts, known), translations/<locale>/${ch}.json, as each issue says`}`,
      );
      for (const it of items) {
        if (n++ >= opts.limit) {
          out.push(`… and ${errors.length + (opts.warnings ? warnings.length : 0) - opts.limit} more${opts.more ?? ''}`);
          return;
        }
        out.push(`- ${it}`);
      }
    }
  };
  list('Errors', errors);
  if (opts.warnings) list('Warnings', warnings);
  return out.join('\n');
}

/** a refusal of the upload: how many, the issues by chapter, and how to repair without redoing anything */
export function refusal(errors: readonly string[], limit = 60): string {
  return (
    `The pack has ${errors.length} error(s), so it was not saved. Fix only what is listed, in the files named (your work folder; if it is gone: unpack.py --repair on the pack), rebuild with make_pack.py and upload again — everything else stays as it is:` +
    issueReport(errors, [], {
      warnings: false,
      limit,
      more: ' (noema_check_pack with a larger limit lists them all; make_pack.py does too)',
    })
  );
}
