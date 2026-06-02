import type { ConfigFieldDef } from '../../../shared/contracts';

import type { GeneratorContext } from './models';

function resolveEnumTypeName(field: ConfigFieldDef, context: GeneratorContext): string | null {
  const enumTypeNodeId = typeof field.enumTypeNodeId === 'string' ? field.enumTypeNodeId : '';
  if (!enumTypeNodeId) {
    return null;
  }
  return context.enumNameByEnumId.get(enumTypeNodeId) ?? null;
}

function resolveNestedClassName(field: ConfigFieldDef, context: GeneratorContext): string | null {
  if (!field.nestedTypeId) {
    return null;
  }
  return context.classNameByTypeId.get(field.nestedTypeId) ?? null;
}

function resolveNestedFullTypeName(field: ConfigFieldDef, context: GeneratorContext): string | null {
  if (!field.nestedTypeId) {
    return null;
  }
  return context.fullTypeNameByTypeId.get(field.nestedTypeId) ?? null;
}

export {
  resolveEnumTypeName,
  resolveNestedClassName,
  resolveNestedFullTypeName
};
