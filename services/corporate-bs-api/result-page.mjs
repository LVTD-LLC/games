const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

export function resultPage(result, origin) {
  const url = `${origin}/corporate-bs-meter/result/${result.id}/`;
  const caption = `${result.name} scored ${result.score.toFixed(1)}/100 on the Corporate BS Meter. ${result.title}.\n\n“${result.phrase}”\n\nCan you out-BS this?`;
  const text = `${caption} ${url}`;
  const shortPhrase =
    result.phrase.length > 115
      ? result.phrase.slice(0, 112) + '…'
      : result.phrase;
  const xText = `${result.score.toFixed(1)}/100 on the Corporate BS Meter. ${result.title}.\n“${shortPhrase}”\nCan you out-BS this?`;
  const link = (label, href, id) =>
    `<a class="share-option" id="${id}" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true">↗</span></a>`;
  return `<article class="attempt">
    <header class="attempt-heading"><p class="eyebrow">Filed under: business as usual</p><h1>Corporate BS Meter<span class="accent">.</span></h1><p class="attempt-byline">An official-looking assessment of some very unofficial nonsense.</p></header>
    <section class="result-card" aria-labelledby="result-verdict">
      <div class="result-summary"><div class="score-box"><span class="score-label">BS rating</span><div class="attempt-score">${result.score.toFixed(1)}</div><span class="score-total">out of 100</span></div><div class="verdict-copy"><span class="verdict-tag">The board has spoken</span><h2 id="result-verdict">${escape(result.title)}</h2><p>${escape(result.line)}</p><p class="attribution">Submitted by <strong>${escape(result.name)}</strong></p></div></div>
      <blockquote class="attempt-phrase">“${escape(result.phrase)}”</blockquote>
      <a class="challenge-button" href="/corporate-bs-meter/?challenge=${escape(result.id)}">Can you out-BS this? <span aria-hidden="true">↗</span></a>
    </section>
    <section class="share-panel" aria-labelledby="share-heading">
      <div class="share-heading"><h2 id="share-heading">Circulate the memo.</h2><p>Share this result. No meeting required.</p></div>
      <div class="share-primary"><button id="detail-copy" type="button" hidden>Copy result &amp; link <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><button id="detail-native" type="button" hidden>More share options <span aria-hidden="true">↗</span></button></div>
      <div class="share-grid">
        ${link('X', `https://twitter.com/intent/tweet?${new URLSearchParams({ text: xText, url })}`, 'detail-x')}
        ${link('Threads', `https://www.threads.com/intent/post?${new URLSearchParams({ text })}`, 'detail-threads')}
        ${link('WhatsApp', `https://api.whatsapp.com/send?${new URLSearchParams({ text })}`, 'detail-whatsapp')}
        ${link('LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`, 'detail-linkedin')}
      </div>
      <p id="detail-share-status" class="share-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <div id="detail-copy-fallback"><label for="detail-share-text">Result and link to share</label><textarea id="detail-share-text" rows="5" readonly>${escape(text)}</textarea></div>
      <span id="detail-share-caption" hidden>${escape(caption)}</span>
      <a id="detail-permalink" class="permalink" href="${escape(url)}">Permanent link to this result <span aria-hidden="true">↗</span></a>
    </section>
    <p class="result-disclaimer">A playful AI rating, not a fact-check.</p>
  </article>`;
}
