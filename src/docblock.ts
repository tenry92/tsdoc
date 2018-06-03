import * as ts from 'typescript';

import {DocEntry, ThrowsEntry} from './doc';

export function getDocumentation(symbol: ts.Symbol, checker: ts.TypeChecker) {
  let description = '';
  const examples = [] as string[];
  let since: string | undefined;
  const throws = [] as ThrowsEntry[];

  for(const comment of symbol.getDocumentationComment(checker)) {
    description += comment.text;
  }

  for(const tag of symbol.getJsDocTags()) {
    if(tag.name == 'example') {
      examples.push(tag.text!);
    } else if(['description', 'desc'].includes(tag.name)) {
      description += tag.text;
    } else if(tag.name == 'since') {
      since = tag.text;
    } else if(['throws', 'throw'].includes(tag.name)) {
      const match = /^\s*(?:\{(.*)\})?\s*(.*)$/.exec(tag.text!);

      throws.push({
        type: match![1] || 'any',
        description: match![2],
      });
    }
  }

  return {
    name: checker.symbolToString(symbol),
    description,
    since,
    examples,
    throws,
  } as DocEntry;
}
