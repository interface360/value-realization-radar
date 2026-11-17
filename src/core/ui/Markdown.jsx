import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cx } from './cx.js'

// Dark-theme Markdown renderer shared by the Docs viewer and the Assistant.
// Custom link schemes:
//   doc:<page>#<anchor>  → onDocLink(page, anchor)
//   account:<id>         → onAccountLink(id)
//   other.md / other.md#x → onDocLink (relative doc links)

export function Markdown({ children, onDocLink, onAccountLink, className, compact = false }) {
  const components = {
    a({ href = '', children: text }) {
      const doc = /^doc:([^#]+)(?:#(.*))?$/.exec(href)
      const relative = !doc && /^([A-Za-z0-9_-]+)\.md(?:#(.*))?$/.exec(href)
      const anchorOnly = !doc && !relative && href.startsWith('#') ? href.slice(1) : null
      const account = /^account:(.+)$/.exec(href)
      if ((doc || relative || anchorOnly != null) && onDocLink) {
        const [page, anchor] = doc ? [doc[1], doc[2]] : relative ? [relative[1], relative[2]] : [null, anchorOnly]
        return (
          <button type="button" onClick={() => onDocLink(page, anchor)} className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200">
            {text}
          </button>
        )
      }
      if (account) {
        return onAccountLink ? (
          <button type="button" onClick={() => onAccountLink(account[1])} className="font-medium text-cyan-200 underline decoration-cyan-400/40 underline-offset-2 hover:text-white">
            {text}
          </button>
        ) : (
          <span className="font-medium text-slate-100">{text}</span>
        )
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className="text-cyan-300 hover:text-cyan-200">
          {text}
        </a>
      )
    },
    table: ({ children: c }) => (
      <div className="not-prose my-3 overflow-x-auto rounded-lg ring-1 ring-white/10">
        <table className="w-full text-left text-xs">{c}</table>
      </div>
    ),
    thead: ({ children: c }) => <thead className="bg-white/5 text-slate-400">{c}</thead>,
    th: ({ children: c }) => <th className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>,
    td: ({ children: c }) => <td className="border-t border-white/5 px-3 py-1.5 align-top text-slate-300">{c}</td>,
  }

  return (
    <div
      className={cx(
        'prose prose-invert max-w-none prose-headings:scroll-mt-4 prose-headings:text-slate-100 prose-a:no-underline prose-strong:text-slate-100 prose-code:rounded prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:text-cyan-100 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-slate-950/80 prose-pre:ring-1 prose-pre:ring-white/10 prose-blockquote:border-cyan-400/40 prose-blockquote:text-slate-300 prose-hr:border-white/10',
        compact ? 'prose-sm prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5' : 'prose-sm sm:prose-base',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url) => url}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
