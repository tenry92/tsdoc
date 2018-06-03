import * as ts from 'typescript';

import {
  ClassDocEntry,
  MethodDocEntry,
  ParameterDocEntry,
  PropertyDocEntry,
  sortEntriesByName,
} from '../doc';

import {getDocumentation} from '../docblock';

export default function (node: ts.ClassDeclaration, checker: ts.TypeChecker) {
  const symbol = checker.getSymbolAtLocation(node.name!);

  if(symbol) {
    const entry = {} as ClassDocEntry;
    const type = checker.getDeclaredTypeOfSymbol(symbol);

    // console.log(symbol.getJsDocTags());

    entry.docType = 'class';
    entry.name = checker.typeToString(type);
    entry.description = '';
    entry.methods = [];
    entry.properties = [];

    for(const member of node.members) {
      const memberSymbol = checker.getSymbolAtLocation(member.name!);

      if(!memberSymbol) {
        continue;
      }

      const memberType = checker.getTypeOfSymbolAtLocation(memberSymbol, memberSymbol.valueDeclaration!);
      const modifiers = ts.getCombinedModifierFlags(member);

      let access: 'public' | 'protected' | 'private' = 'public';

      if((modifiers & ts.ModifierFlags.Protected) != 0) {
        access = 'protected';
      } else if((modifiers & ts.ModifierFlags.Private) != 0) {
        access = 'private';
      }

      if(ts.isMethodDeclaration(member)) {
        // console.log(checker.symbolToString(memberSymbol), checker.typeToString(methodType));

        // e.g. <T extends AbstractComponent>(componentClass: ComponentClass<T>) => any
        const signatureText = checker.typeToString(memberType);

        const signature = checker.getSignatureFromDeclaration(member);
        const signatureType = signature!.getReturnType();
        // const signatureType = checker.getTypeOfSymbolAtLocation(returnSymbol, returnSymbol.valueDeclaration!);

        const methodDoc = getDocumentation(memberSymbol, checker) as MethodDocEntry;
        methodDoc.docType = 'method';
        methodDoc.parameters = [];
        methodDoc.returnType = checker.typeToString(signatureType);
        methodDoc.access = access;
        methodDoc.signature = signatureText;

        for(const parameter of member.parameters) {
          const paramSymbol = checker.getSymbolAtLocation(parameter.name);
          const paramType = checker.getTypeOfSymbolAtLocation(paramSymbol!, paramSymbol!.valueDeclaration!);
          // console.log('paramDocs:', paramSymbol.getJsDocTags());

          const paramDoc = getDocumentation(paramSymbol!, checker) as ParameterDocEntry;
          paramDoc.docType = 'parameter';
          paramDoc.type = checker.typeToString(paramType);
          paramDoc.variadic = false;

          methodDoc.parameters.push(paramDoc);
        }

        entry.methods.push(methodDoc);
      } else if(ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) {
        const propDoc = getDocumentation(memberSymbol, checker) as PropertyDocEntry;
        propDoc.docType = 'property';
        propDoc.readonly = (modifiers & ts.ModifierFlags.Readonly) != 0;
        propDoc.type = checker.typeToString(memberType);
        propDoc.access = access;

        entry.properties.push(propDoc);
      }

      sortEntriesByName(entry.methods);
      sortEntriesByName(entry.properties);

      // if(property.getFlags() & ts.SymbolFlags.Method) {
      //   const methodDoc = {} as MethodDocEntry;
      //   const methodType = checker.getDeclaredTypeOfSymbol(property);

      //   methodDoc.name = property.getName();
      //   methodDoc.description = '';
      //   methodDoc.returnType = checker.typeToString(methodType);

      //   entry.methods.push(methodDoc);
      // } else if(property.getFlags() & ts.SymbolFlags.Property) {
      //   const propDoc = {} as PropertyDocEntry;
      //   const propType = checker.getDeclaredTypeOfSymbol(property);
      //   property.
      //   const propNode = checker.typeToTypeNode(propType);
      //   console.log(ts.getCombinedModifierFlags(propNode));

      //   propDoc.name = property.getName();
      //   propDoc.description = '';
      //   propDoc.type = checker.typeToString(propType);

      //   entry.properties.push(propDoc);
      // }
    }

    return entry;
  }

  return undefined;
}
