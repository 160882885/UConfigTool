export {
  mapCSharpType,
  mapCppType,
  mapGoType,
  mapJavaType,
  mapRustType
} from './typeMappersNative';
export {
  mapLuaDefaultLiteral,
  mapLuaTypeHint,
  mapPythonDefaultLiteral,
  mapPythonType,
  mapTypeScriptType
} from './typeMappersScript';

function toLuaFieldKeyExpr(fieldName: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) {
    return fieldName;
  }
  return `[${JSON.stringify(fieldName)}]`;
}

export {
  toLuaFieldKeyExpr
};
