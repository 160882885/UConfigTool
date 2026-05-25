import type { ConfigFieldDef, ConfigNodeKind } from '../../../../shared/contracts';

export type SchemaDraft = {
  nodeId: string;
  className: string;
  namespace: string;
  exportAsTableList: boolean;
  exportTableListFileName: string;
  fields: ConfigFieldDef[];
  dirty: boolean;
};

export type PendingNodeSwitch = {
  nextNodeId: string | null;
};

export type PendingDelete = {
  nodeIds: string[];
  message: string;
};

export type ConfigNodeModel = {
  id: string;
  parentId: string | null;
  kind: ConfigNodeKind;
  name: string;
  order: number;
};
