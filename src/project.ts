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
import emit from './emit';

function absolutePaths(input: {[key: string]: any}, basePath: string, keys: string[]) {
  for(const key of keys) {
    if(!path.isAbsolute(input[key])) {
      input[key] = path.join(basePath, input[key]);
    }
  }
}

export interface NodePackage {
  name: string;
  version: string;
  description: string;
  author: string;
}

export interface ProjectConfig {
  excludePrivate: boolean;
  excludeProtected: boolean;
  moduleName: string;
  source: string;
  destination: string;
  theme: string;
  title: string;
}

export default class Project {
  static async fromConfigFile(docConfigFile: string, logger: winston.LoggerInstance) {
    const project = new Project(path.dirname(docConfigFile), logger);

    logger.verbose(`reading ${project.packageFile}`);
    const nodePkgJson = await fs.readFile(project.packageFile, 'utf8');
    project.nodePackage = JSON.parse(nodePkgJson);

    logger.verbose(`reading ${docConfigFile}`);
    const tsdocConfigJson = await fs.readFile(docConfigFile, 'utf8');
    const tsdocConfig = {
      excludePrivate: false,
      excludeProtected: false,
      moduleName: project.nodePackage!.name,
      title: project.nodePackage!.name,
      ...JSON.parse(tsdocConfigJson),
    } as ProjectConfig;

    absolutePaths(tsdocConfig, project.basePath, [
      'source',
      'destination',
      'theme',
    ]);

    project.config = tsdocConfig;

    logger.verbose(`reading ${project.tsConfigFile}`);
    const tsConfigJson = await fs.readFile(project.tsConfigFile, 'utf8');
    const tsConfig = ts.parseConfigFileTextToJson(project.tsConfigFile, tsConfigJson);
    const compilerOptions = tsConfig.config.compilerOptions;

    switch((compilerOptions.module || 'CommonJS').toLowerCase()) {
      case 'commonjs': compilerOptions.module = ts.ModuleKind.CommonJS; break;
      case 'amd': compilerOptions.module = ts.ModuleKind.AMD; break;
      case 'umd': compilerOptions.module = ts.ModuleKind.UMD; break;
      case 'system': compilerOptions.module = ts.ModuleKind.System; break;
      case 'es2015': compilerOptions.module = ts.ModuleKind.ES2015; break;
      case 'esnext': compilerOptions.module = ts.ModuleKind.ESNext; break;
    }

    switch((compilerOptions.moduleResolution || 'node').toLowerCase()) {
      case 'classic': compilerOptions.moduleResolution = ts.ModuleResolutionKind.Classic; break;
      case 'node': compilerOptions.moduleResolution = ts.ModuleResolutionKind.NodeJs; break;
    }

    project.compilerOptions = compilerOptions;

    return project;
  }

  nodePackage?: NodePackage;

  compilerOptions?: ts.CompilerOptions;

  config?: ProjectConfig;

  docs = [] as DocEntry[];

  files = [] as DocEntry[];

  get packageFile() {
    return path.join(this.basePath, 'package.json');
  }

  get tsConfigFile() {
    return path.join(this.basePath, 'tsconfig.json');
  }

  private constructor(readonly basePath: string, readonly logger: winston.LoggerInstance) {}

  async generateDocumentation() {
    const inputPath = this.config!.source;
    const fileNames = await fs.readdir(inputPath);

    const program = ts.createProgram(
      fileNames.map(fileName => path.join(inputPath, fileName)),
      this.compilerOptions!,
    );
    const checker = program.getTypeChecker();

    this.logger.info('parsing source files');
    for(const sourceFile of program.getSourceFiles()) {
      if(!sourceFile.isDeclarationFile) {
        const relativePath = path.relative(inputPath, sourceFile.fileName);
        this.logger.verbose(`parsing ${relativePath}`);

        const sourceSymbol = checker.getSymbolAtLocation(sourceFile);

        const fileDoc = getDocumentation(sourceSymbol!, checker) as FileDocEntry;
        fileDoc.docType = 'file';
        fileDoc.fileName = relativePath;
        fileDoc.moduleName = relativePath == 'index.ts' ?
          this.config!.moduleName :
          this.config!.moduleName + '/' + relativePath.replace(/\.ts$/, '')
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
              this.docs.push(doc);
              fileDoc.exports.push(doc);
            }
          } else if(expSymbol.declarations) {
            for(const decl of expSymbol.declarations) {
              const doc = visit(decl);
              if(doc) {
                doc.srcFile = fileDoc;
                doc.exportName = checker.symbolToString(expSymbol);
                doc.id = `${idPrefix}${doc.exportName}`;
                this.docs.push(doc);
                fileDoc.exports.push(doc);
              }
            }
          }
        }

        sortEntriesByName(fileDoc.exports);
        this.files.push(fileDoc);
      }
    }

    if(this.config!.excludePrivate) {
      excludePrivates(this.docs);
    }

    sortEntriesByName(this.docs);
    sortEntriesByName(this.files);

    await emit(this);

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
  }
}
