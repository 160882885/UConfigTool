interface MessageDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
}

function MessageDialog({ open, title, message, confirmText = '确定', onConfirm }: MessageDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="custom-export-modal-mask" onClick={onConfirm}>
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
          <button type="button" className="custom-btn" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MessageDialog;
