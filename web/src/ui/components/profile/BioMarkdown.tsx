import Markdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'

export function BioMarkdown({ value, className = '' }: { value: string; className?: string }) {
  return (
    <div className={`bio-markdown ${className}`}>
      <Markdown remarkPlugins={[remarkBreaks]} skipHtml>{value}</Markdown>
    </div>
  )
}
