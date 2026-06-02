import Handlebars from 'handlebars';

import type { ExportLanguage } from '../../../shared/contracts';

import { renderTableJson } from './jsonRenderer';
import { buildEnumTemplateModel, buildGeneratorContext, buildTypeTemplateModel, getEnumScriptFileName, getTypeScriptFileName } from './modelBuilders';
import type { ExportEnumRecord, ExportTypeRecord } from './models';

const handlebars = Handlebars.create();

const CSHARP_TEMPLATE = handlebars.compile(
  `using System;

{{#if hasNamespace}}
namespace {{namespaceName}}
{
  public class {{className}}{{#if hasBaseType}} : {{baseFullTypeName}}{{/if}}
  {
{{#if hasFields}}
{{#each fields}}
    public {{csType}} {{fieldName}};
{{/each}}
{{else}}
    // Empty config type
{{/if}}
  }
}
{{else}}
public class {{className}}{{#if hasBaseType}} : {{baseClassName}}{{/if}}
{
{{#if hasFields}}
{{#each fields}}
  public {{csType}} {{fieldName}};
{{/each}}
{{else}}
  // Empty config type
{{/if}}
}
{{/if}}
`,
  { noEscape: true }
);

const LUA_TEMPLATE = handlebars.compile(
  `---@class {{fullTypeName}}{{#if hasBaseType}}: {{baseFullTypeName}}{{/if}}
{{#each fields}}
---@field {{fieldName}} {{luaTypeHint}}
{{/each}}
local {{className}} = {
{{#each fields}}
  {{luaFieldKeyExpr}} = {{luaDefaultLiteral}},
{{/each}}
}

return {{className}}
`,
  { noEscape: true }
);

const TYPESCRIPT_TEMPLATE = handlebars.compile(
  `export interface {{className}}{{#if hasBaseType}} extends {{baseClassName}}{{/if}} {
{{#if hasFields}}
{{#each fields}}
  {{fieldName}}: {{tsType}};
{{/each}}
{{else}}
  // Empty config type
{{/if}}
}
`,
  { noEscape: true }
);

const PYTHON_TEMPLATE = handlebars.compile(
  `from dataclasses import dataclass, field
from typing import Any, List

@dataclass
class {{className}}{{#if hasBaseType}}({{baseClassName}}){{/if}}:
{{#if hasFields}}
{{#each fields}}
    {{fieldName}}: {{pyType}} = {{pyDefaultLiteral}}
{{/each}}
{{else}}
    pass
{{/if}}
`,
  { noEscape: true }
);

const JAVA_TEMPLATE = handlebars.compile(
  `{{#if hasNamespace}}package {{namespaceName}};

{{/if}}public class {{className}}{{#if hasBaseType}} extends {{baseClassName}}{{/if}} {
{{#if hasFields}}
{{#each fields}}
  private {{javaType}} {{fieldName}};
{{/each}}
{{else}}
  // Empty config type
{{/if}}
}
`,
  { noEscape: true }
);

const GO_TEMPLATE = handlebars.compile(
  `package config

type {{className}} struct {
{{#if hasBaseType}}
  {{baseClassName}}
{{/if}}
{{#if hasFields}}
{{#each fields}}
  {{propertyName}} {{goType}} ` + "`json:\"{{fieldName}}\"`" + `
{{/each}}
{{/if}}
}
`,
  { noEscape: true }
);

const CPP_TEMPLATE = handlebars.compile(
  `#pragma once
#include <string>
#include <vector>
#include <unordered_map>

struct {{className}}{{#if hasBaseType}} : public {{baseClassName}}{{/if}} {
{{#if hasFields}}
{{#each fields}}
  {{cppType}} {{fieldName}};
{{/each}}
{{else}}
  // Empty config type
{{/if}}
};
`,
  { noEscape: true }
);

const RUST_TEMPLATE = handlebars.compile(
  `#[derive(Debug, Clone, Default)]
pub struct {{className}} {
{{#if hasBaseType}}
    pub base: {{baseClassName}},
{{/if}}
{{#if hasFields}}
{{#each fields}}
    pub {{fieldName}}: {{rustType}},
{{/each}}
{{/if}}
}
`,
  { noEscape: true }
);

const CSHARP_ENUM_TEMPLATE = handlebars.compile(
  `{{#if hasNamespace}}
namespace {{namespaceName}}
{
  public enum {{enumName}} {
{{#if hasItems}}
{{#each items}}
    {{key}},
{{/each}}
{{else}}
    None
{{/if}}
  }
}
{{else}}
public enum {{enumName}} {
{{#if hasItems}}
{{#each items}}
  {{key}},
{{/each}}
{{else}}
  None
{{/if}}
}
{{/if}}
`,
  { noEscape: true }
);

const LUA_ENUM_TEMPLATE = handlebars.compile(
  `local {{enumName}} = {
{{#if hasItems}}
{{#each items}}
  {{key}} = {{@index}},
{{/each}}
{{else}}
  None = 0,
{{/if}}
}

return {{enumName}}
`,
  { noEscape: true }
);

const TYPESCRIPT_ENUM_TEMPLATE = handlebars.compile(
  `export enum {{enumName}} {
{{#if hasItems}}
{{#each items}}
  {{key}} = {{@index}},
{{/each}}
{{else}}
  None = 0
{{/if}}
}
`,
  { noEscape: true }
);

const PYTHON_ENUM_TEMPLATE = handlebars.compile(
  `from enum import IntEnum

class {{enumName}}(IntEnum):
{{#if hasItems}}
{{#each items}}
    {{key}} = {{@index}}
{{/each}}
{{else}}
    NONE = 0
{{/if}}
`,
  { noEscape: true }
);

const JAVA_ENUM_TEMPLATE = handlebars.compile(
  `{{#if hasNamespace}}package {{namespaceName}};

{{/if}}public enum {{enumName}} {
{{#if hasItems}}
{{#each items}}
  {{key}}{{#unless @last}},{{else}};{{/unless}}
{{/each}}
{{else}}
  NONE;
{{/if}}
}
`,
  { noEscape: true }
);

const GO_ENUM_TEMPLATE = handlebars.compile(
  `package config

type {{enumName}} int

const (
{{#if hasItems}}
{{#each items}}
  {{key}} {{../enumName}} = {{@index}}
{{/each}}
{{else}}
  {{enumName}}None {{enumName}} = 0
{{/if}}
)
`,
  { noEscape: true }
);

const CPP_ENUM_TEMPLATE = handlebars.compile(
  `#pragma once

enum class {{enumName}} {
{{#if hasItems}}
{{#each items}}
  {{key}},
{{/each}}
{{else}}
  None
{{/if}}
};
`,
  { noEscape: true }
);

const RUST_ENUM_TEMPLATE = handlebars.compile(
  `#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum {{enumName}} {
{{#if hasItems}}
{{#each items}}
    {{key}},
{{/each}}
{{else}}
    None,
{{/if}}
}
`,
  { noEscape: true }
);

function renderTypeScript(
  type: ExportTypeRecord,
  language: ExportLanguage,
  allTypes: ExportTypeRecord[],
  allEnums: ExportEnumRecord[] = []
): string {
  const context = buildGeneratorContext(allTypes, allEnums);
  const model = buildTypeTemplateModel(type, context);

  if (language === 'csharp') {
    return CSHARP_TEMPLATE(model);
  }
  if (language === 'lua') {
    return LUA_TEMPLATE(model);
  }
  if (language === 'typescript') {
    return TYPESCRIPT_TEMPLATE(model);
  }
  if (language === 'python') {
    return PYTHON_TEMPLATE(model);
  }
  if (language === 'java') {
    return JAVA_TEMPLATE(model);
  }
  if (language === 'go') {
    return GO_TEMPLATE(model);
  }
  if (language === 'cpp') {
    return CPP_TEMPLATE(model);
  }
  return RUST_TEMPLATE(model);
}

function renderEnumScript(enumRecord: ExportEnumRecord, language: ExportLanguage): string {
  const model = buildEnumTemplateModel(enumRecord);

  if (language === 'csharp') {
    return CSHARP_ENUM_TEMPLATE(model);
  }
  if (language === 'lua') {
    return LUA_ENUM_TEMPLATE(model);
  }
  if (language === 'typescript') {
    return TYPESCRIPT_ENUM_TEMPLATE(model);
  }
  if (language === 'python') {
    return PYTHON_ENUM_TEMPLATE(model);
  }
  if (language === 'java') {
    return JAVA_ENUM_TEMPLATE(model);
  }
  if (language === 'go') {
    return GO_ENUM_TEMPLATE(model);
  }
  if (language === 'cpp') {
    return CPP_ENUM_TEMPLATE(model);
  }
  return RUST_ENUM_TEMPLATE(model);
}

export {
  getEnumScriptFileName,
  getTypeScriptFileName,
  renderEnumScript,
  renderTableJson,
  renderTypeScript
};
