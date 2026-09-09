// React escapes labels; only HTTP(S) URLs become links.
export function MessageBody({ body }: { body: string }) {
  return <p>{body.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part
    try {
      const url = new URL(part)
      return <a key={index} href={url.href} rel="noopener noreferrer">{part}</a>
    } catch { return part }
  })}</p>
}
