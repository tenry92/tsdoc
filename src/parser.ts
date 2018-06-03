import {promises as fs} from 'fs';
import * as path from 'path';

import * as ts from 'typescript';
import * as winston from 'winston';

import classDoc from './parsers/class';
import funcDoc from './parsers/function';
import interfaceDoc from './parsers/interface';
import varDoc from './parsers/variable';

import {DocEntry, FileDocEntry, excludePrivates, sortEntriesByName} from './doc';
import {getDocumentation} from './docblock';
import Project from './project';

interface ParserOutput {
  docs: DocEntry[];
  files: DocEntry[];
}

export default class Parser {
  constructor(readonly project: Project) {}

  async parse() {
    const output = {
      docs: [],
      files: [],
    } as ParserOutput;

    const inputPath = this.project.config!.source;
    const fileNames = await fs.readdir(inputPath);

    const program = ts.createProgram(
      fileNames.map(fileName => path.join(inputPath, fileName)),
      this.project.compilerOptions!,
    );
    const checker = program.getTypeChecker();

    this.project.logger.info('parsing source files');
    for(const sourceFile of program.getSourceFiles()) {
      if(!sourceFile.isDeclarationFile) {
        const relativePath = path.relative(inputPath, sourceFile.fileName);
        this.project.logger.verbose(`parsing ${relativePath}`);

        const sourceSymbol = checker.getSymbolAtLocation(sourceFile);

        const fileDoc = getDocumentation(sourceSymbol!, checker) as FileDocEntry;
        fileDoc.docType = 'file';
        fileDoc.fileName = relativePath;
        fileDoc.moduleName = relativePath == 'index.ts' ?
          this.project.config!.moduleName :
          this.project.config!.moduleName + '/' + relativePath.replace(/\.ts$/, '')
        ;
        fileDoc.exports = [];

        const idPrefix = fileDoc.moduleName.replace(/\//g, '-') + '-';

        const expSymbols = checker.getExportsOfModule(sourceSymbol!);

        for(const expSymbol of expSymbols) {
          if(expSymbol.valueDeclaration) {
            const doc = visit(expSymbol.valueDeclaration);
            if(doc) {
              doc.srcFile = fileDoc;
              doc.exportName = checker.symbolToString(expSymbol);
              doc.id = `${idPrefix}${doc.exportName}`;
              output.docs.push(doc);
              fileDoc.exports.push(doc);
            }
          } else if(expSymbol.declarations) {
            for(const decl of expSymbol.declarations) {
              const doc = visit(decl);
              if(doc) {
                doc.srcFile = fileDoc;
                doc.exportName = checker.symbolToString(expSymbol);
                doc.id = `${idPrefix}${doc.exportName}`;
                output.docs.push(doc);
                fileDoc.exports.push(doc);
              }
            }
          }
        }

        sortEntriesByName(fileDoc.exports);
        output.files.push(fileDoc);
      }
    }

    if(this.project.config!.excludePrivate) {
      excludePrivates(output.docs);
    }

    sortEntriesByName(output.docs);
    sortEntriesByName(output.files);

    function visit(node: ts.Declaration) {
      let doc: DocEntry | undefined;
      if(ts.isClassDeclaration(node)) {
        doc = classDoc(node, checker);
      } else if(ts.isFunctionDeclaration(node)) {
        doc = funcDoc(node, checker);
      } else if(ts.isInterfaceDeclaration(node)) {
        doc = interfaceDoc(node, checker);
      } else if(ts.isVariableDeclaration(node)) {
        doc = varDoc(node, checker);
      } else if(ts.isEnumDeclaration(node)) {
        // todo
      }

      return doc;
    }

    return output;
  }
}
