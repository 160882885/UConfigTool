import * as RadixContextMenu from '@radix-ui/react-context-menu';
import { useState, type ReactNode } from 'react';

export type ContextMenuItem =
  | {
      type?: 'item';
      key: string;
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      shortcut?: string;
    }
  | {
      type: 'separator';
      key: string;
    }
  | {
      type: 'label';
      key: string;
      label: string;
    }
  | {
      type: 'submenu';
      key: string;
      label: string;
      items: ContextMenuItem[];
      disabled?: boolean;
    };

interface ContextMenuProps {
  items: ContextMenuItem[];
  children: ReactNode;
  disabled?: boolean;
}

function renderMenuItems(items: ContextMenuItem[]): ReactNode {
  return items.map((item) => {
    if (item.type === 'separator') {
      return <RadixContextMenu.Separator key={item.key} className="context-menu-separator" />;
    }

    if (item.type === 'label') {
      return (
        <RadixContextMenu.Label key={item.key} className="context-menu-label">
          {item.label}
        </RadixContextMenu.Label>
      );
    }

    if (item.type === 'submenu') {
      return (
        <RadixContextMenu.Sub key={item.key}>
          <RadixContextMenu.SubTrigger className="context-menu-item" disabled={item.disabled}>
            <span>{item.label}</span>
            <span className="context-menu-sub-glyph">›</span>
          </RadixContextMenu.SubTrigger>

          <RadixContextMenu.Portal>
          <RadixContextMenu.SubContent className="context-menu-content" sideOffset={4} collisionPadding={8}>
            {renderMenuItems(item.items)}
          </RadixContextMenu.SubContent>
          </RadixContextMenu.Portal>
        </RadixContextMenu.Sub>
      );
    }

    return (
      <RadixContextMenu.Item
        key={item.key}
        className={`context-menu-item${item.danger ? ' danger' : ''}`}
        disabled={item.disabled}
        onSelect={(event) => {
          event.stopPropagation();
          item.onSelect();
        }}
      >
        <span>{item.label}</span>
        {item.shortcut ? <span className="context-menu-shortcut">{item.shortcut}</span> : null}
      </RadixContextMenu.Item>
    );
  });
}

function ContextMenu({ items, children, disabled = false }: ContextMenuProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return <>{children}</>;
  }

  return (
    <RadixContextMenu.Root open={open} onOpenChange={setOpen}>
      <RadixContextMenu.Trigger asChild disabled={disabled}>
        {children}
      </RadixContextMenu.Trigger>

      <RadixContextMenu.Portal>
        <RadixContextMenu.Content
          className="context-menu-content"
          collisionPadding={8}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {renderMenuItems(items)}
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}

export default ContextMenu;
