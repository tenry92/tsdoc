import * as ts from 'typescript';

import {
  VarirableDocEntry,
} from '../doc';

import {getDocumentation} from '../docblock';

export default function (node: ts.VariableDeclaration, checker: ts.TypeChecker) {
  const symbol = checker.getSymbolAtLocation(node.name!);

  if(symbol) {
    const varType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);

    const varDoc = getDocumentation(symbol, checker) as VarirableDocEntry;
    varDoc.docType = 'variable';
    varDoc.type = checker.typeToString(varType);

    return varDoc;
  }

  return undefined;
}
