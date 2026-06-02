import type { ExportLanguage } from '../../../shared/contracts';

import { SCRIPT_EXT_BY_LANGUAGE, type EnumTemplateModel, type ExportEnumRecord, type ExportTypeRecord, type GeneratorContext, type TemplateFieldModel, type TypeTemplateModel } from './models';
import { resolveClassName, resolveEnumName, resolveExportFieldName, sanitizeIdentifier, sanitizeNamespace, toPascalCase } from './naming';
import {
  mapCSharpType,
  mapCppType,
  mapGoType,
  mapJavaType,
  mapLuaDefaultLiteral,
  mapLuaTypeHint,
  mapPythonDefaultLiteral,
  mapPythonType,
  mapRustType,
  mapTypeScriptType,
  toLuaFieldKeyExpr
} from './typeMappers';

function buildGeneratorContext(types: ExportTypeRecord[], enums: ExportEnumRecord[]): GeneratorContext {
  const classNameByTypeId = new Map<string, string>();
  const namespaceByTypeId = new Map<string, string>();
  const fullTypeNameByTypeId = new Map<string, string>();
  const enumNameByEnumId = new Map<string, string>();

  for (const type of types) {
    const className = resolveClassName(type);
    const namespaceName = sanitizeNamespace(type.namespace);
    classNameByTypeId.set(type.id, className);
    namespaceByTypeId.set(type.id, namespaceName);
    fullTypeNameByTypeId.set(type.id, namespaceName ? `${namespaceName}.${className}` : className);
  }

  for (const enumRecord of enums) {
    enumNameByEnumId.set(enumRecord.id, resolveEnumName(enumRecord));
  }

  return {
    classNameByTypeId,
    namespaceByTypeId,
    fullTypeNameByTypeId,
    enumNameByEnumId
  };
}

function buildTypeTemplateModel(type: ExportTypeRecord, context: GeneratorContext): TypeTemplateModel {
  const className = context.classNameByTypeId.get(type.id) ?? resolveClassName(type);
  const namespaceName = context.namespaceByTypeId.get(type.id) ?? sanitizeNamespace(type.namespace);
  const baseClassName = type.baseTypeNodeId ? context.classNameByTypeId.get(type.baseTypeNodeId) ?? '' : '';
  const baseFullTypeName = type.baseTypeNodeId ? context.fullTypeNameByTypeId.get(type.baseTypeNodeId) ?? baseClassName : '';

  const fields: TemplateFieldModel[] = type.fields.map((field, index) => {
    const fieldName = resolveExportFieldName(field, index);
    return {
      fieldName,
      propertyName: toPascalCase(fieldName),
      csType: mapCSharpType(field.type, field, context),
      luaTypeHint: mapLuaTypeHint(field.type, field, context),
      luaFieldKeyExpr: toLuaFieldKeyExpr(fieldName),
      luaDefaultLiteral: mapLuaDefaultLiteral(field.type),
      tsType: mapTypeScriptType(field.type, field, context),
      pyType: mapPythonType(field.type, field, context),
      pyDefaultLiteral: mapPythonDefaultLiteral(field.type),
      javaType: mapJavaType(field.type, field, context),
      goType: mapGoType(field.type, field, context),
      cppType: mapCppType(field.type, field, context),
      rustType: mapRustType(field.type, field, context)
    };
  });

  return {
    className,
    namespaceName,
    hasNamespace: namespaceName.length > 0,
    fullTypeName: namespaceName ? `${namespaceName}.${className}` : className,
    baseClassName,
    baseFullTypeName,
    hasBaseType: baseClassName.length > 0,
    hasFields: fields.length > 0,
    fields
  };
}

function getTypeScriptFileName(type: ExportTypeRecord, language: ExportLanguage): string {
  const className = resolveClassName(type);
  return `${className}${SCRIPT_EXT_BY_LANGUAGE[language]}`;
}

function buildEnumTemplateModel(enumRecord: ExportEnumRecord): EnumTemplateModel {
  const namespaceName = sanitizeNamespace(enumRecord.namespace);
  const items = enumRecord.items.map((item, index) => {
    const fallback = `Item_${index + 1}`;
    const key = sanitizeIdentifier(item.value) || fallback;
    return {
      key,
      value: item.value
    };
  });

  return {
    enumName: resolveEnumName(enumRecord),
    namespaceName,
    hasNamespace: namespaceName.length > 0,
    hasItems: items.length > 0,
    items
  };
}

function getEnumScriptFileName(enumRecord: ExportEnumRecord, language: ExportLanguage): string {
  const enumName = resolveEnumName(enumRecord);
  return `${enumName}${SCRIPT_EXT_BY_LANGUAGE[language]}`;
}

export {
  buildEnumTemplateModel,
  buildGeneratorContext,
  buildTypeTemplateModel,
  getEnumScriptFileName,
  getTypeScriptFileName,
  resolveClassName,
  resolveEnumName,
  resolveExportFieldName
};
