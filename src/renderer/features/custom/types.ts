import type { ConfigFieldDef } from '../../../../shared/contracts';

export type NodeMeta =
  | {
      kind: 'group';
      typeId: string;
    }
  | {
      kind: 'config';
      typeId: string;
      tableId: string;
    };

export type SchemaDraft = {
  typeId: string;
  name: string;
  className: string;
  namespace: string;
  fields: ConfigFieldDef[];
  dirty: boolean;
};

export type PendingNodeSwitch = {
  nextNodeId: string | null;
};

export type PendingDelete = {
  meta: NodeMeta;
  message: string;
};

export type TreeOrderPayload = {
  typeOrderIds: string[];
  tableOrderByType: Record<string, string[]>;
};
