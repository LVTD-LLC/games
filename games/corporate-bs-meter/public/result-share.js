// Progressive enhancement for public result pages; no session or API calls needed.
const copy = document.getElementById('detail-copy');
const native = document.getElementById('detail-native');
const status = document.getElementById('detail-share-status');
const fallback = document.getElementById('detail-copy-fallback');
const message = document.getElementById('detail-share-text');
const permalink = document.getElementById('detail-permalink');
copy.hidden = false;
fallback.hidden = true;
native.hidden = typeof navigator.share !== 'function';
async function copyResult() {
  try {
    await navigator.clipboard.writeText(message.value);
    fallback.hidden = true;
    return true;
  } catch {
    fallback.hidden = false;
    message.focus();
    message.select();
    return false;
  }
}
copy.addEventListener('click', async () => {
  status.textContent = (await copyResult())
    ? 'Result and challenge link copied.'
    : 'Select and copy the message below.';
});
document
  .getElementById('detail-linkedin')
  .addEventListener('click', async () => {
    // Keep the anchor's normal navigation; LinkedIn only accepts a URL, not post text.
    status.textContent = (await copyResult())
      ? 'Post text copied. Paste it into your LinkedIn post.'
      : 'Copy the message below to include it in your LinkedIn post.';
  });
native.addEventListener('click', async () => {
  status.textContent = '';
  try {
    await navigator.share({
      title: 'Corporate BS Meter',
      text: document.getElementById('detail-share-caption').textContent,
      url: permalink.href,
    });
  } catch (error) {
    if (error.name !== 'AbortError')
      status.textContent =
        'Sharing is unavailable here. Use a share link or copy the result.';
  }
});
