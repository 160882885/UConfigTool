interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  altText?: string;
  altDanger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onAlt?: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  altText,
  altDanger = false,
  busy = false,
  onConfirm,
  onCancel,
  onAlt
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="custom-export-modal-mask" onClick={onCancel}>
      <div
        className="custom-export-modal custom-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="custom-export-head">
          <h3 className="custom-export-title">{title}</h3>
        </div>
        <div className="custom-export-body custom-confirm-body">
          <section className="custom-export-section">
            <div className="custom-prop-empty-inline">{message}</div>
          </section>
        </div>
        <div className="custom-export-actions">
          <button type="button" className="custom-btn" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          {altText && onAlt ? (
            <button type="button" className={`custom-btn${altDanger ? ' danger' : ''}`} onClick={onAlt} disabled={busy}>
              {altText}
            </button>
          ) : null}
          <button type="button" className="custom-btn" onClick={onConfirm} disabled={busy}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
