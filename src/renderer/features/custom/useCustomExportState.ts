import { useEffect, useState } from 'react';

import type { ExportLanguage } from '../../../../shared/contracts';
import { appBridge } from '../../shared/api/appBridge';

import { EXPORT_LANGUAGE_OPTIONS } from './constants';
import { INITIAL_EXPORT_LANGUAGE_SELECTION } from './runtime';

type TypeNodeOption = {
  id: string;
  name: string;
};

interface UseCustomExportStateOptions {
  typeNodesForExport: TypeNodeOption[];
  setErrorMessage: (message: string | null) => void;
  setInfoDialogMessage: (message: string | null) => void;
}

function useCustomExportState({
  typeNodesForExport,
  setErrorMessage,
  setInfoDialogMessage
}: UseCustomExportStateOptions) {
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTypeSelection, setExportTypeSelection] = useState<Record<string, boolean>>({});
  const [exportLanguageSelection, setExportLanguageSelection] = useState<Record<ExportLanguage, boolean>>(INITIAL_EXPORT_LANGUAGE_SELECTION);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setExportTypeSelection((previous) => {
      const next: Record<string, boolean> = {};
      for (const typeNode of typeNodesForExport) {
        next[typeNode.id] = previous[typeNode.id] ?? true;
      }
      return next;
    });
  }, [typeNodesForExport]);

  const submitExport = async () => {
    const selectedTypeNodeIds = typeNodesForExport.filter((node) => exportTypeSelection[node.id]).map((node) => node.id);
    const selectedLanguages = EXPORT_LANGUAGE_OPTIONS.filter((item) => exportLanguageSelection[item.key]).map((item) => item.key);
    if (selectedLanguages.length === 0) {
      setInfoDialogMessage('请至少选择一种导出语言。');
      return;
    }

    setIsExporting(true);
    try {
      await appBridge.exportConfigs({
        selectedTypeNodeIds,
        selectedLanguages
      });
      setShowExportModal(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导出失败。');
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportLanguageSelection,
    exportTypeSelection,
    isExporting,
    setExportLanguageSelection,
    setExportTypeSelection,
    setShowExportModal,
    showExportModal,
    submitExport
  };
}

export { useCustomExportState };
