import { KEYS } from "../utils/musicTheory";
import type { PaletteChord } from "../utils/musicTheory";

interface OnChordPaneProps {
  targetChord: PaletteChord | null;
  onBassSelect: (bassNote: number, noteName: string) => void;
}

export default function OnChordPane({ targetChord, onBassSelect }: OnChordPaneProps) {
  const bassNotes = KEYS.map((key, index) => ({
    name: key,
    midi: 60 + index,
  }));

  if (!targetChord) {
    return (
      <section className="onchord-pane empty-state">
        <div className="pane-info-row">
          <span className="pane-info-label">On-Chord</span>
          <p className="section-desc">直前に追加したコードのベース音を変更します</p>
        </div>
        <div className="onchord-empty">
          <p>オンコードを設定するには、まずパレットにコードを追加してください。</p>
        </div>
      </section>
    );
  }

  const originalName = targetChord.displayName.split("/")[0];

  return (
    <section className="onchord-pane">
      <div className="pane-info-row">
        <span className="pane-info-label">On-Chord</span>
        <p className="section-desc">直前に追加したコードのベース音を変更します</p>
      </div>

      <div className="onchord-target">
        <span className="onchord-label">対象コード:</span>
        <span className="onchord-current">{targetChord.displayName}</span>
      </div>

      <div className="bass-grid">
        {bassNotes.map((note) => {
          const isActive =
            targetChord.bassNoteOverride !== undefined
              ? targetChord.bassNoteOverride % 12 === note.midi % 12
              : targetChord.rootNote % 12 === note.midi % 12;

          return (
            <button
              key={note.midi}
              className={`bass-btn ${isActive ? "active" : ""}`}
              onClick={() => onBassSelect(note.midi, note.name)}
              title={`${originalName}/${note.name} を設定`}
            >
              <span className="bass-slash">/</span>
              <span className="bass-name">{note.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
