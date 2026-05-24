import { KEYS, type Key } from "../utils/musicTheory";

interface HeaderProps {
  selectedKey: Key;
  onKeyChange: (key: Key) => void;
  onUndo: () => void;
  onSaveToHistory: () => void;
  onClear: () => void;
  canUndo: boolean;
  canSave: boolean;
  canClear: boolean;
}

export default function Header({
  selectedKey,
  onKeyChange,
  onUndo,
  onSaveToHistory,
  onClear,
  canUndo,
  canSave,
  canClear,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-icon" aria-hidden="true">♪</div>
          <h1 className="header-title">Chord Palette</h1>
        </div>

        <div className="key-selector">
          <label htmlFor="key-select" className="key-label">
            Key
          </label>
          <select
            id="key-select"
            value={selectedKey}
            onChange={(e) => onKeyChange(e.target.value as Key)}
            className="key-select"
            aria-label={`キー ${selectedKey} Major`}
            title={`${selectedKey} Major`}
          >
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="header-actions">
          <button className="btn-header-action" onClick={onUndo} disabled={!canUndo} title="戻る" aria-label="戻る">
            <span className="btn-icon" aria-hidden="true">↩</span>
            <span className="btn-text">戻る</span>
          </button>
          <button className="btn-header-action" onClick={onSaveToHistory} disabled={!canSave} title="保存" aria-label="保存">
            <span className="btn-icon" aria-hidden="true">💾</span>
            <span className="btn-text">保存</span>
          </button>
          <button className="btn-header-action btn-clear-text" onClick={onClear} disabled={!canClear} title="クリア" aria-label="クリア">
            <span className="btn-icon" aria-hidden="true">✕</span>
            <span className="btn-text">クリア</span>
          </button>
        </div>
      </div>
    </header>
  );
}
