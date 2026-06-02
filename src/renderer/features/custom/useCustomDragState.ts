import { useState } from 'react';
import type { DragEvent } from 'react';

interface UseCustomDragStateResult {
  draggingFieldId: string | null;
  dragOverFieldId: string | null;
  dragOverPosition: 'before' | 'after' | null;
  dragOverArrayIndex: number | null;
  dragOverArrayListKey: string | null;
  dragOverArrayPosition: 'before' | 'after' | null;
  clearArrayDragState: () => void;
  clearFieldDragState: () => void;
  handleArrayItemDragOver: (listKey: string, index: number, event: DragEvent<HTMLDivElement>) => void;
  handleArrayItemDragStart: (listKey: string, index: number, event: DragEvent<HTMLButtonElement>) => void;
  handleFieldDragOver: (fieldId: string, event: DragEvent<HTMLDivElement>) => void;
  handleFieldDragStart: (fieldId: string, event: DragEvent<HTMLButtonElement>) => void;
  reorderArrayItems: <T>(
    listKey: string,
    targetIndex: number,
    items: T[],
    commit: (next: T[]) => void,
    event?: DragEvent<HTMLElement>
  ) => void;
  reorderFieldItems: <T extends { id: string }>(
    fieldId: string,
    items: T[],
    commit: (next: T[]) => void,
    event: DragEvent<HTMLDivElement>
  ) => void;
}

function useCustomDragState(): UseCustomDragStateResult {
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);
  const [draggingArrayListKey, setDraggingArrayListKey] = useState<string | null>(null);
  const [draggingArrayIndex, setDraggingArrayIndex] = useState<number | null>(null);
  const [dragOverArrayListKey, setDragOverArrayListKey] = useState<string | null>(null);
  const [dragOverArrayIndex, setDragOverArrayIndex] = useState<number | null>(null);
  const [dragOverArrayPosition, setDragOverArrayPosition] = useState<'before' | 'after' | null>(null);

  const clearFieldDragState = () => {
    setDraggingFieldId(null);
    setDragOverFieldId(null);
    setDragOverPosition(null);
  };

  const handleFieldDragStart = (fieldId: string, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', fieldId);
    setDraggingFieldId(fieldId);
    setDragOverFieldId(null);
    setDragOverPosition(null);
  };

  const handleFieldDragOver = (fieldId: string, event: DragEvent<HTMLDivElement>) => {
    if (!draggingFieldId || draggingFieldId === fieldId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position: 'before' | 'after' = event.clientY < midpoint ? 'before' : 'after';
    if (dragOverFieldId !== fieldId || dragOverPosition !== position) {
      setDragOverFieldId(fieldId);
      setDragOverPosition(position);
    }
  };

  const reorderFieldItems = <T extends { id: string }>(
    fieldId: string,
    items: T[],
    commit: (next: T[]) => void,
    event: DragEvent<HTMLDivElement>
  ) => {
    if (!draggingFieldId || !dragOverPosition || draggingFieldId === fieldId) {
      clearFieldDragState();
      return;
    }
    event.preventDefault();

    const next = [...items];
    const fromIndex = next.findIndex((field) => field.id === draggingFieldId);
    const targetIndex = next.findIndex((field) => field.id === fieldId);
    if (fromIndex < 0 || targetIndex < 0) {
      clearFieldDragState();
      return;
    }

    const [moving] = next.splice(fromIndex, 1);
    const adjustedTargetIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = dragOverPosition === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;
    const safeInsertIndex = Math.max(0, Math.min(insertIndex, next.length));
    next.splice(safeInsertIndex, 0, moving);
    commit(next);
    clearFieldDragState();
  };

  const clearArrayDragState = () => {
    setDraggingArrayListKey(null);
    setDraggingArrayIndex(null);
    setDragOverArrayListKey(null);
    setDragOverArrayIndex(null);
    setDragOverArrayPosition(null);
  };

  const handleArrayItemDragStart = (listKey: string, index: number, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${listKey}:${index}`);
    setDraggingArrayListKey(listKey);
    setDraggingArrayIndex(index);
    setDragOverArrayListKey(null);
    setDragOverArrayIndex(null);
    setDragOverArrayPosition(null);
  };

  const handleArrayItemDragOver = (listKey: string, index: number, event: DragEvent<HTMLDivElement>) => {
    if (draggingArrayListKey !== listKey || draggingArrayIndex === null || draggingArrayIndex === index) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position: 'before' | 'after' = event.clientY < midpoint ? 'before' : 'after';
    if (dragOverArrayListKey !== listKey || dragOverArrayIndex !== index || dragOverArrayPosition !== position) {
      setDragOverArrayListKey(listKey);
      setDragOverArrayIndex(index);
      setDragOverArrayPosition(position);
    }
  };

  const reorderArrayItems = <T,>(
    listKey: string,
    targetIndex: number,
    items: T[],
    commit: (next: T[]) => void,
    event?: DragEvent<HTMLElement>
  ) => {
    if (
      draggingArrayListKey !== listKey ||
      draggingArrayIndex === null ||
      dragOverArrayPosition === null ||
      draggingArrayIndex < 0 ||
      draggingArrayIndex >= items.length ||
      targetIndex < 0 ||
      targetIndex >= items.length
    ) {
      clearArrayDragState();
      return;
    }

    if (event) {
      event.preventDefault();
    }

    const fromIndex = draggingArrayIndex;
    const next = [...items];
    const [moving] = next.splice(fromIndex, 1);
    const adjustedTargetIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = dragOverArrayPosition === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;
    const safeInsertIndex = Math.max(0, Math.min(insertIndex, next.length));
    next.splice(safeInsertIndex, 0, moving);
    commit(next);
    clearArrayDragState();
  };

  return {
    draggingFieldId,
    dragOverFieldId,
    dragOverPosition,
    dragOverArrayIndex,
    dragOverArrayListKey,
    dragOverArrayPosition,
    clearArrayDragState,
    clearFieldDragState,
    handleArrayItemDragOver,
    handleArrayItemDragStart,
    handleFieldDragOver,
    handleFieldDragStart,
    reorderArrayItems,
    reorderFieldItems
  };
}

export { useCustomDragState };
