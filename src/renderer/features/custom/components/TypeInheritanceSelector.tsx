type NodeOption = {
  id: string;
  name: string;
};

interface TypeInheritanceSelectorProps {
  selectedBaseTypeName: string;
  isOpen: boolean;
  keyword: string;
  candidates: NodeOption[];
  onToggle: () => void;
  onKeywordChange: (value: string) => void;
  onSelect: (nodeId?: string) => void;
}

function TypeInheritanceSelector({
  selectedBaseTypeName,
  isOpen,
  keyword,
  candidates,
  onToggle,
  onKeywordChange,
  onSelect
}: TypeInheritanceSelectorProps) {
  return (
    <div className="custom-prop-row">
      <label className="custom-prop-label">{'继承类型'}</label>
      <div className="custom-inherit-select">
        <button
          type="button"
          className="custom-inherit-trigger"
          onClick={onToggle}
        >
          <span>{selectedBaseTypeName}</span>
          <span className="custom-inherit-trigger-arrow">{isOpen ? '^' : 'v'}</span>
        </button>
        {isOpen ? (
          <div className="custom-inherit-dropdown">
            <input
              className="custom-input custom-inherit-search"
              value={keyword}
              placeholder={'搜索配置表类型'}
              onChange={(event) => {
                onKeywordChange(event.currentTarget.value);
              }}
            />
            <div className="custom-inherit-options">
              <button
                type="button"
                className="custom-inherit-option"
                onClick={() => {
                  onSelect(undefined);
                }}
              >
                {'无'}
              </button>
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="custom-inherit-option"
                  onClick={() => {
                    onSelect(candidate.id);
                  }}
                >
                  {candidate.name}
                </button>
              ))}
              {candidates.length === 0 ? (
                <div className="custom-prop-empty-inline">{'未找到匹配的配置表类型。'}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default TypeInheritanceSelector;
