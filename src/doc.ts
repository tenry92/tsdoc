export interface DocEntry {
  description: string;
  docType?: string;
  exportName?: string;
  id?: string;
  name: string;
  see?: string[];
  since?: string;
  srcFile?: FileDocEntry;
  throws: ThrowsEntry[];
}

export interface FileDocEntry extends DocEntry {
  docType: 'file';
  fileName: string;
  exports: DocEntry[];
  moduleName: string;
}

export interface ThrowsEntry {
  description: string;
  type: string;
}

export interface FunctionDocEntry extends ClassMemberEntry {
  docType: 'function' | 'method';
  parameters: ParameterDocEntry[];
  returnType: string;
  signature: string;
  // types: any; // get<T extends AbstractComponent>(cls: ComponentClass<T>)
  // async: boolean;
}

export interface ClassDocEntry extends DocEntry {
  docType: 'class';
  example?: string;
  methods: MethodDocEntry[];
  properties: PropertyDocEntry[];
  // abstract: boolean;
}

export interface InterfaceDocEntry extends DocEntry {
  docType: 'interface';
  methods: MethodDocEntry[];
  properties: PropertyDocEntry[];
  // abstract: boolean;
}

export interface ClassMemberEntry extends DocEntry {
  access: 'public' | 'protected' | 'private';
  // static: boolean;
}

export interface MethodDocEntry extends ClassMemberEntry, FunctionDocEntry {
  docType: 'method';
}

export interface ParameterDocEntry extends DocEntry {
  default?: string;
  docType: 'parameter';
  type: string;
  variadic: boolean;
}

export interface PropertyDocEntry extends ClassMemberEntry {
  docType: 'property';
  initialValue?: string;
  readonly: boolean;
  type: string;
}

export interface VarirableDocEntry extends DocEntry {
  docType: 'variable';
  type: string;
}

export function sortEntriesByName(entries: DocEntry[]) {
  entries.sort((a, b) => {
    if(a.name < b.name) {
      return -1;
    }

    return 1;
  });

  return entries;
}

export function isClassDocEntry(entry: DocEntry): entry is ClassDocEntry {
  return entry.docType == 'class';
}

export function isClassMemberDocEntry(entry: DocEntry): entry is ClassMemberEntry {
  return ['method', 'property'].includes(entry.docType!);
}

export function excludePrivates<T extends DocEntry>(entries: T[]) {
  return entries.filter(entry =>
    !isClassMemberDocEntry(entry) || entry.access != 'private',
  ).map(entry => {
    if(isClassDocEntry(entry)) {
      entry.methods = excludePrivates(entry.methods);
      entry.properties = excludePrivates(entry.properties);
    }

    return entry;
  });
}
