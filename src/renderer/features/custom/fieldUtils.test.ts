import { describe, expect, it } from 'vitest';

import { cloneFields, normalizeSchemaDraftRuntime } from './fieldUtils';

describe('fieldUtils runtime guards', () => {
  it('normalizes invalid schema fields without throwing', () => {
    const draft = {
      nodeId: 'type-1',
      className: 'DemoClass',
      namespace: '',
      fields: [null, undefined, { id: 'f1', tag: 'a', fieldName: 'b', type: 'string' }] as unknown as never[],
      dirty: false
    };

    const normalized = normalizeSchemaDraftRuntime(draft as never);
    expect(normalized.fields).toHaveLength(3);
    expect(normalized.fields[0].id).toBe('field_invalid_1');
    expect(normalized.fields[1].id).toBe('field_invalid_2');
    expect(normalized.fields[2].id).toBe('f1');
  });

  it('clones fields with normalization to avoid renderer crashes', () => {
    const cloned = cloneFields([undefined, { id: 'f2', tag: 'x', fieldName: 'y', type: 'string' }] as never);
    expect(cloned).toHaveLength(2);
    expect(cloned[0].id).toBe('field_invalid_1');
    expect(cloned[1].id).toBe('f2');
  });
});
