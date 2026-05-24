import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { title: "コードを選ぶ", body: "下の「コード」パネルからダイアトニックコードをタップして追加します。" },
  { title: "パレットに並ぶ", body: "選んだコードが上のパレットに並びます。タップで編集・差し替えできます。" },
  { title: "▶ で試聴", body: "BPM とドラムを設定して ▶ を押すと、進行を試聴できます。" },
];

interface OnboardingOverlayProps {
  onDismiss: () => void;
}

export default function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onDismiss();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="onboarding-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="onboarding-card"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="onboarding-steps">
            {STEPS.map((_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? "active" : ""}`} />
            ))}
          </div>
          <h2 className="onboarding-title">{current.title}</h2>
          <p className="onboarding-body">{current.body}</p>
          <div className="onboarding-actions">
            <button type="button" className="onboarding-skip" onClick={onDismiss}>
              スキップ
            </button>
            <button type="button" className="onboarding-next" onClick={handleNext}>
              {isLast ? "はじめる" : "次へ"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
