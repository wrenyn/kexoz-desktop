type FeedbackBannerProps = {
  infoMessage?: string
  errorMessage?: string
}

export default function FeedbackBanner({ infoMessage, errorMessage }: FeedbackBannerProps) {
  if (!infoMessage && !errorMessage) return null

  return (
    <div className={`ps-feedback ${errorMessage ? 'ps-feedback-error' : 'ps-feedback-info'}`} role="status">
      {errorMessage || infoMessage}
    </div>
  )
}
