export class UniversalThinkParser {
  constructor() {
    this.thinking = ''
    this.text = ''
    this._inThink = false
    this._pastThink = false
    this._buf = ''

    this._openTag = '<think>'
    this._closeTag = '</think>'
  }

  process(delta) {
    if (delta.reasoning_content != null) {
      const tc = delta.reasoning_content ?? ''
      const tx = delta.content ?? ''
      this.thinking += tc
      this.text += tx
      return { thinking: tc || null, text: tx || null }
    }

    const raw = delta.content ?? ''
    if (!raw) return { thinking: null, text: null }

    if (this._pastThink) {
      this.text += raw
      return { thinking: null, text: raw }
    }

    let thinkOut = ''
    let textOut = ''

    for (const ch of raw) {
      this._buf += ch

      if (this._inThink) {
        if (this._buf.endsWith(this._closeTag)) {
          const content = this._buf.slice(0, -this._closeTag.length)
          thinkOut += content
          this.thinking += content
          this._buf = ''
          this._inThink = false
          this._pastThink = true
        } else if (this._buf.length > 100) {
          const safe = this._buf.slice(0, -this._closeTag.length)
          thinkOut += safe
          this.thinking += safe
          this._buf = this._buf.slice(-this._closeTag.length)
        }
      } else {
        if (this._buf.endsWith(this._openTag)) {
          const before = this._buf.slice(0, -this._openTag.length).trim()
          if (before) { textOut += before; this.text += before }
          this._buf = ''
          this._inThink = true
        } else if (this._buf.length > 15) {
          const safe = this._buf.slice(0, -this._openTag.length)
          textOut += safe
          this.text += safe
          this._buf = this._buf.slice(-this._openTag.length)
        }
      }
    }

    return {
      thinking: thinkOut || null,
      text: textOut || null,
    }
  }

  flush() {
    if (!this._buf) return { thinking: null, text: null }
    const out = this._buf; this._buf = ''
    if (this._inThink) { this.thinking += out; return { thinking: out, text: null } }
    this.text += out; return { thinking: null, text: out }
  }
}
