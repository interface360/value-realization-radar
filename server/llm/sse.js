// Parse a Server-Sent Events response body into JSON payloads.
export async function* readSse(body) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    let idx
    while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const event = buffer.slice(0, idx)
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '')
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue
      try {
        yield JSON.parse(data)
      } catch {
        // ignore keep-alives / malformed frames
      }
    }
  }
}
