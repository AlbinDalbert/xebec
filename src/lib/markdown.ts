import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

/** Model output goes straight into the DOM, so it is always sanitized. */
export const renderMarkdown = (src: string) => DOMPurify.sanitize(marked.parse(src, { async: false }))
