import * as ts from 'typescript';

import {
  FunctionDocEntry,
  ParameterDocEntry,
} from '../doc';

import {getDocumentation} from '../docblock';

export default function (node: ts.FunctionLikeDeclaration, checker: ts.TypeChecker) {
  const symbol = checker.getSymbolAtLocation(node.name!);

  if(symbol) {
    const funcType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);

    // e.g. <T extends AbstractComponent>(componentClass: ComponentClass<T>) => any
    const signatureText = checker.typeToString(funcType);

    const signature = checker.getSignatureFromDeclaration(node);
    const signatureType = signature!.getReturnType();
    getDocumentation(symbol, checker);

    const funcDoc = getDocumentation(symbol, checker) as FunctionDocEntry;
    funcDoc.docType = 'function';
    funcDoc.parameters = [];
    funcDoc.returnType = checker.typeToString(signatureType);
    funcDoc.signature = signatureText;

    for(const parameter of node.parameters) {
      const paramSymbol = checker.getSymbolAtLocation(parameter.name);
      const paramType = checker.getTypeOfSymbolAtLocation(paramSymbol!, paramSymbol!.valueDeclaration!);

      const paramDoc = getDocumentation(paramSymbol!, checker) as ParameterDocEntry;
      paramDoc.docType = 'parameter';
      paramDoc.type = checker.typeToString(paramType);
      paramDoc.variadic = false;

      funcDoc.parameters.push(paramDoc);
    }

    return funcDoc;
  }

  return undefined;
}
