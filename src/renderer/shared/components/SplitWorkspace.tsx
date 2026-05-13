import type { CSSProperties, ReactNode } from 'react';

import { useSplitPane } from '../hooks/useSplitPane';

interface SplitWorkspaceProps {
  left: ReactNode;
  right: ReactNode;
  initialRatio?: number;
  minRatio?: number;
  maxRatio?: number;
  className?: string;
}

function SplitWorkspace({
  left,
  right,
  initialRatio = 50,
  minRatio = 20,
  maxRatio = 80,
  className = ''
}: SplitWorkspaceProps) {
  const { splitRatio, isDraggingSplit, splitRef, handleSplitDragStart } = useSplitPane({
    initialRatio,
    minRatio,
    maxRatio
  });

  const layoutStyle: CSSProperties = {
    gridTemplateColumns: `calc(${splitRatio}% - 5px) 10px calc(${100 - splitRatio}% - 5px)`
  };

  return (
    <div ref={splitRef} className={`split-workspace json-layout ${className}`.trim()} style={layoutStyle}>
      <section className="tool-block split-pane json-pane">{left}</section>

      <div
        className={`divider ${isDraggingSplit ? 'active' : ''}`}
        role="separator"
        aria-label="拖拽调整左右模块宽度"
        aria-orientation="vertical"
        onPointerDown={handleSplitDragStart}
      >
        <span className="divider-handle" />
      </div>

      <section className="tool-block split-pane json-pane">{right}</section>
    </div>
  );
}

export default SplitWorkspace;
