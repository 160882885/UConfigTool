import type {
  ConfigEnumSchemaRecord,
  ConfigFieldDef,
  ConfigFieldValue
} from '../../../../../shared/contracts';

import {
  isFloatType,
  isIntType,
  isValidFloatInput,
  isValidIntegerInput
} from '../fieldUtils';
import AutoGrowTextarea from './AutoGrowTextarea';

interface ConfigFieldScalarInputProps {
  field: ConfigFieldDef;
  value: unknown;
  path: string[];
  enumSchemaByNodeId: Map<string, ConfigEnumSchemaRecord>;
  writeValue: (path: string[], nextValue: ConfigFieldValue) => void;
}

function ConfigFieldScalarInput({
  field,
  value,
  path,
  enumSchemaByNodeId,
  writeValue
}: ConfigFieldScalarInputProps) {
  if (field.type === 'bool') {
    return (
      <label className="custom-checkbox-wrap">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => {
            writeValue(path, event.currentTarget.checked);
          }}
        />
        <span>启用</span>
      </label>
    );
  }

  if (field.type === 'enum') {
    const enumTypeId = field.enumTypeNodeId ?? '';
    const enumSchema = enumTypeId ? enumSchemaByNodeId.get(enumTypeId) ?? null : null;

    return (
      <select
        className="custom-select"
        value={String(value ?? '')}
        onChange={(event) => {
          writeValue(path, event.currentTarget.value);
        }}
      >
        <option value="">请选择</option>
        {enumSchema?.items.map((item) => (
          <option key={item.id} value={item.value}>
            {item.value || '未命名项'}
          </option>
        )) ?? null}
      </select>
    );
  }

  if (field.type === 'string') {
    return (
      <AutoGrowTextarea
        value={String(value)}
        placeholder="请输入内容"
        onChange={(nextValue) => {
          writeValue(path, nextValue);
        }}
      />
    );
  }

  return (
    <input
      className="custom-input"
      type={isIntType(field.type) || isFloatType(field.type) ? 'number' : 'text'}
      step={isFloatType(field.type) ? 'any' : undefined}
      value={String(value)}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        if (isIntType(field.type) && !isValidIntegerInput(nextValue)) {
          return;
        }
        if (isFloatType(field.type) && !isValidFloatInput(nextValue)) {
          return;
        }
        writeValue(path, nextValue);
      }}
    />
  );
}

export default ConfigFieldScalarInput;
