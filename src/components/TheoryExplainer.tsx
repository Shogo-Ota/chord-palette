import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { explainChords } from "../lib/explainChords";

interface TheoryExplainerProps {
  progression: string;
}

export default function TheoryExplainer({ progression }: TheoryExplainerProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // パレットが変わったら解説をリセット
  useEffect(() => {
    setExplanation(null);
    setError(null);
  }, [progression]);

  const handleExplain = async () => {
    setLoading(true);
    setError(null);
    setExplanation(null);
    try {
      const result = await explainChords(progression);
      setExplanation(result.explanation);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="theory-explainer">
      <button
        className="btn-explain"
        onClick={handleExplain}
        disabled={loading}
      >
        {loading ? "解析中…" : "🎵 AIで解説"}
      </button>

      <AnimatePresence>
        {error && (
          <motion.p
            className="explain-error"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {error}
          </motion.p>
        )}

        {explanation && (
          <motion.div
            className="explain-result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <p className="explain-text">{explanation}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
