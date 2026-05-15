import type { ConfigTypeRecord, ExportLanguage } from '../../../../../shared/contracts';
import { EXPORT_LANGUAGE_OPTIONS } from '../constants';

interface ExportConfigModalProps {
  types: ConfigTypeRecord[];
  typeSelection: Record<string, boolean>;
  languageSelection: Record<ExportLanguage, boolean>;
  isExporting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onToggleType: (typeId: string) => void;
  onToggleLanguage: (language: ExportLanguage) => void;
}

function ExportConfigModal({
  types,
  typeSelection,
  languageSelection,
  isExporting,
  onClose,
  onSubmit,
  onToggleType,
  onToggleLanguage
}: ExportConfigModalProps) {
  return (
    <div className="custom-export-modal-mask" onClick={onClose}>
      <div
        className="custom-export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="导出设置"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="custom-export-head">
          <h3 className="custom-export-title">导出设置</h3>
        </div>

        <div className="custom-export-body">
          <section className="custom-export-section">
            <h4 className="custom-export-section-title">配置类型（控制配置表JSON导出）</h4>
            <div className="custom-export-list">
              {types.length === 0 ? (
                <div className="custom-prop-empty-inline">暂无配置类型。</div>
              ) : (
                types.map((type) => (
                  <label key={type.id} className="custom-export-item">
                    <input type="checkbox" checked={Boolean(typeSelection[type.id])} onChange={() => onToggleType(type.id)} />
                    <span>{type.name}</span>
                  </label>
                ))
              )}
            </div>
          </section>

          <section className="custom-export-section">
            <h4 className="custom-export-section-title">编程语言（控制类型脚本导出）</h4>
            <div className="custom-export-list">
              {EXPORT_LANGUAGE_OPTIONS.map((language) => (
                <label key={language.key} className="custom-export-item">
                  <input
                    type="checkbox"
                    checked={Boolean(languageSelection[language.key])}
                    onChange={() => onToggleLanguage(language.key)}
                  />
                  <span>{language.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="custom-export-actions">
          <button type="button" className="custom-btn" onClick={onClose} disabled={isExporting}>
            取消
          </button>
          <button type="button" className="custom-btn" onClick={onSubmit} disabled={isExporting}>
            {isExporting ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportConfigModal;
