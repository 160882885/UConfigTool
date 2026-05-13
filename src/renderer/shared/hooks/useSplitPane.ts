import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface UseSplitPaneOptions {
  initialRatio?: number;
  minRatio?: number;
  maxRatio?: number;
}

interface UseSplitPaneResult {
  splitRatio: number;
  isDraggingSplit: boolean;
  splitRef: React.RefObject<HTMLDivElement | null>;
  handleSplitDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function useSplitPane(options: UseSplitPaneOptions = {}): UseSplitPaneResult {
  const { initialRatio = 50, minRatio = 20, maxRatio = 80 } = options;

  // splitRatio 控制左右区域占比（百分比）。
  const [splitRatio, setSplitRatio] = useState(initialRatio);

  // isDraggingSplit 用于驱动拖拽态样式。
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  // splitRef 指向实际布局容器，用于计算宽度和位移比例。
  const splitRef = useRef<HTMLDivElement | null>(null);

  const handleSplitDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!splitRef.current) {
      return;
    }

    event.preventDefault();
    const splitRect = splitRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startRatio = splitRatio;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const ratioOffset = (deltaX / splitRect.width) * 100;
      const nextRatio = Math.min(maxRatio, Math.max(minRatio, startRatio + ratioOffset));
      setSplitRatio(nextRatio);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setIsDraggingSplit(false);
    };

    // 拖拽期间禁选文字并修改全局鼠标样式，提升手感。
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    setIsDraggingSplit(true);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return {
    splitRatio,
    isDraggingSplit,
    splitRef,
    handleSplitDragStart
  };
}

export {
  useSplitPane
};
