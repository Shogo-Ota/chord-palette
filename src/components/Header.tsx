import { KEYS, type Key } from "../utils/musicTheory";

interface HeaderProps {
  selectedKey: Key;
  onKeyChange: (key: Key) => void;
}

export default function Header({ selectedKey, onKeyChange }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-icon">♪</div>
          <div>
            <h1 className="header-title">Chord Palette <span className="version-tag">ver.2.2.1</span></h1>
            <p className="header-subtitle">直感的コード進行ビルダー</p>
          </div>
        </div>
        <div className="key-selector">
          <label htmlFor="key-select" className="key-label">Key</label>
          <select
            id="key-select"
            value={selectedKey}
            onChange={(e) => onKeyChange(e.target.value as Key)}
            className="key-select"
          >
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k} Major
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
