import type { FeatureFlag } from '../../../../shared/contracts';

function findFeatureFlag(flags: FeatureFlag[], key: string): FeatureFlag | undefined {
  return flags.find((item) => item.key === key);
}

export {
  findFeatureFlag
};
