function getQuizResultMessageKey(correctCount, wrongCount) {
  if (wrongCount === 0) return 'quizResultAllCorrect'
  if (wrongCount === 1) return 'quizResultOneWrong'
  return wrongCount > correctCount ? 'quizResultNeedsReview' : 'quizResultLightReview'
}

export default function QuizResultSummary({ correctCount, totalCount, t }) {
  const safeTotal = Math.max(Number(totalCount) || 0, 0)
  const safeCorrect = Math.max(0, Math.min(Number(correctCount) || 0, safeTotal))
  const wrongCount = Math.max(safeTotal - safeCorrect, 0)
  const correctPercent = safeTotal > 0 ? (safeCorrect / safeTotal) * 100 : 0
  const wrongPercent = safeTotal > 0 ? (wrongCount / safeTotal) * 100 : 0
  const roundedCorrectPercent = Math.round(correctPercent)

  return (
    <div className="quiz-result-summary">
      <div className="quiz-result-counts">
        <span className="quiz-result-count correct">
          <strong>{safeCorrect}</strong>
          {t('quizCorrectCount')}
        </span>
        <span className="quiz-result-count wrong">
          <strong>{wrongCount}</strong>
          {t('quizWrongCount')}
        </span>
        <span className="quiz-result-count percent" aria-label={`${roundedCorrectPercent}%`}>
          <strong>{roundedCorrectPercent}%</strong>
        </span>
      </div>
      <div
        className="quiz-result-chart"
        aria-label={`${t('quizCorrectCount')}: ${safeCorrect}, ${t('quizWrongCount')}: ${wrongCount}`}
      >
        {safeCorrect > 0 && <span className="quiz-result-chart-correct" style={{ width: `${correctPercent}%` }} />}
        {wrongCount > 0 && <span className="quiz-result-chart-wrong" style={{ width: `${wrongPercent}%` }} />}
      </div>
      <p>{t(getQuizResultMessageKey(safeCorrect, wrongCount))}</p>
    </div>
  )
}
