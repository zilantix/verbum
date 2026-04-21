/**
 * Verbum — Bible Q&A on Cloudflare Workers AI
 *
 * DEPLOYMENT:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy
 *
 * wrangler.toml (create this next to worker.js):
 *
 *   name = "verbum"
 *   main = "worker.js"
 *   compatibility_date = "2024-11-01"
 *
 *   [ai]
 *   binding = "AI"
 *
 * That's it. No API keys needed — Workers AI is auto-authenticated
 * via the AI binding.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API endpoint for questions
    if (url.pathname === "/api/ask" && request.method === "POST") {
      return handleAsk(request, env);
    }

    // Serve the HTML page for everything else
    return new Response(HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
};

async function handleAsk(request, env) {
  try {
    const { question, translation = "ESV" } = await request.json();

    if (!question || question.trim().length < 3) {
      return json({ error: "Please enter a question." }, 400);
    }

    const systemPrompt = `You are a careful, reverent Bible study assistant. When a user asks a question, answer thoughtfully using Scripture as your primary source. You speak from within the historic Christian tradition, but present biblical teaching fairly without a denominational agenda.

CRITICAL CITATION RULES:
- Every substantive claim must be grounded in specific Bible passages.
- Quote verses in the ${translation} translation.
- Only cite verses you are confident actually say what you claim. If unsure of exact wording, give only the reference.
- Include 2 to 5 directly relevant verses.

You MUST respond with ONLY valid JSON in this exact structure — no markdown, no code fences, no preamble:

{
  "answer": "A thoughtful 2-3 paragraph answer. Plain prose. Reference verses in parentheses like (Romans 8:28) as you make points. No markdown headings or bullets.",
  "verses": [
    {"reference": "Book Chapter:Verse", "text": "The exact verse text in ${translation}."}
  ]
}

If the question is off-topic or inappropriate, put a gentle response in "answer" and an empty "verses" array.`;

    const aiResponse = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        max_tokens: 1500,
        temperature: 0.3
      }
    );

    const raw = (aiResponse.response || "").trim();

    // Extract JSON — handles cases where model wraps in fences or adds text
    let parsed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return json({ error: "Could not parse response. Please try again." }, 502);
      }
      parsed = JSON.parse(match[0]);
    }

    return json(parsed);
  } catch (err) {
    return json({ error: err.message || "An error occurred." }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Verbum — Ask the Bible</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Cinzel:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #1a1410;
    --ink-soft: #3a2e24;
    --parchment: #f4ead5;
    --parchment-warm: #ebdcb8;
    --parchment-deep: #d9c59a;
    --gold: #a07b2c;
    --gold-bright: #c9a158;
    --crimson: #7a1e1e;
    --shadow: rgba(40, 25, 10, 0.18);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    background: var(--parchment);
    color: var(--ink);
    font-family: 'EB Garamond', 'Cormorant Garamond', Georgia, serif;
    font-size: 18px;
    line-height: 1.6;
    min-height: 100vh;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      radial-gradient(ellipse at 20% 30%, rgba(160, 123, 44, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 70%, rgba(122, 30, 30, 0.05) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 100%, rgba(60, 40, 20, 0.12) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }

  body::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.3 0 0 0 0 0.15 0 0 0 0 0.15 0'/></filter><rect width='200' height='200' filter='url(%23n)'/></svg>");
    opacity: 0.4;
    pointer-events: none;
    z-index: 1;
    mix-blend-mode: multiply;
  }

  main {
    position: relative;
    z-index: 2;
    max-width: 860px;
    margin: 0 auto;
    padding: 60px 32px 120px;
  }

  header.masthead {
    text-align: center;
    padding: 40px 0 56px;
    border-bottom: 1px solid var(--parchment-deep);
    margin-bottom: 48px;
  }

  .ornament {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    margin-bottom: 24px;
    color: var(--gold);
  }

  .ornament hr {
    flex: 0 0 80px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold), transparent);
    border: none;
  }

  .ornament svg { width: 28px; height: 28px; fill: var(--gold); }

  h1 {
    font-family: 'Cinzel', serif;
    font-weight: 600;
    font-size: clamp(42px, 8vw, 72px);
    letter-spacing: 0.08em;
    color: var(--ink);
    line-height: 1;
    margin-bottom: 14px;
    text-shadow: 0 1px 0 rgba(255,240,210,0.4);
  }

  .tagline {
    font-style: italic;
    font-size: 18px;
    color: var(--ink-soft);
    max-width: 480px;
    margin: 0 auto;
  }

  .drop-cap::first-letter {
    font-family: 'Cinzel', serif;
    font-size: 4.2em;
    float: left;
    line-height: 0.85;
    margin: 6px 10px 0 0;
    color: var(--crimson);
    font-weight: 600;
  }

  form.ask {
    position: relative;
    background: linear-gradient(180deg, var(--parchment-warm), var(--parchment));
    border: 1px solid var(--parchment-deep);
    padding: 28px 28px 20px;
    box-shadow:
      0 1px 0 rgba(255,240,210,0.6) inset,
      0 20px 40px -20px var(--shadow);
    margin-bottom: 48px;
  }

  form.ask::before, form.ask::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border: 1px solid var(--gold);
    opacity: 0.5;
  }
  form.ask::before { top: 8px; left: 8px; border-right: none; border-bottom: none; }
  form.ask::after { bottom: 8px; right: 8px; border-left: none; border-top: none; }

  label.lbl {
    display: block;
    font-family: 'Cinzel', serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 12px;
  }

  textarea {
    width: 100%;
    min-height: 80px;
    background: transparent;
    border: none;
    resize: vertical;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 22px;
    line-height: 1.5;
    color: var(--ink);
    outline: none;
    font-style: italic;
  }

  textarea::placeholder {
    color: rgba(58, 46, 36, 0.5);
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px dashed var(--parchment-deep);
  }

  .translation-select {
    font-family: 'EB Garamond', serif;
    background: transparent;
    border: 1px solid var(--parchment-deep);
    padding: 6px 12px;
    font-size: 14px;
    color: var(--ink-soft);
    cursor: pointer;
    letter-spacing: 0.05em;
  }

  button.submit {
    font-family: 'Cinzel', serif;
    background: var(--ink);
    color: var(--parchment);
    border: none;
    padding: 12px 28px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.25s ease;
  }

  button.submit:hover:not(:disabled) {
    background: var(--crimson);
    letter-spacing: 0.36em;
    padding: 12px 32px;
  }

  button.submit:disabled { opacity: 0.4; cursor: wait; }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
  }

  .chip {
    font-family: 'EB Garamond', serif;
    font-style: italic;
    font-size: 14px;
    padding: 6px 14px;
    border: 1px solid rgba(160, 123, 44, 0.4);
    background: rgba(255, 245, 220, 0.5);
    color: var(--ink-soft);
    cursor: pointer;
    border-radius: 20px;
    transition: all 0.2s ease;
  }

  .chip:hover {
    background: var(--gold);
    color: var(--parchment);
    border-color: var(--gold);
  }

  .response-card {
    position: relative;
    background: linear-gradient(180deg, rgba(255,248,228,0.6), transparent);
    padding: 40px 8px 20px;
    margin-bottom: 32px;
    border-top: 2px solid var(--gold);
    animation: fadeUp 0.7s ease;
  }

  .response-card::before {
    content: '\u2766';
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--parchment);
    color: var(--gold);
    padding: 0 16px;
    font-size: 22px;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .question-echo {
    font-style: italic;
    font-size: 16px;
    color: var(--ink-soft);
    text-align: center;
    margin-bottom: 28px;
  }

  .question-echo::before { content: '\u201C'; color: var(--gold); font-size: 24px; margin-right: 8px; vertical-align: -4px; }
  .question-echo::after { content: '\u201D'; color: var(--gold); font-size: 24px; margin-left: 8px; vertical-align: -4px; }

  .answer {
    font-size: 19px;
    line-height: 1.75;
    color: var(--ink);
    text-align: justify;
    hyphens: auto;
  }

  .answer p { margin-bottom: 1em; }

  .verses {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--parchment-deep);
  }

  .verses-title {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--gold);
    text-align: center;
    margin-bottom: 20px;
  }

  blockquote.verse {
    position: relative;
    background: rgba(235, 220, 184, 0.35);
    border-left: 3px solid var(--crimson);
    padding: 16px 20px 16px 24px;
    margin-bottom: 14px;
    font-style: italic;
    color: var(--ink);
    font-size: 18px;
    line-height: 1.6;
  }

  blockquote.verse cite {
    display: block;
    margin-top: 8px;
    font-style: normal;
    font-family: 'Cinzel', serif;
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--crimson);
    font-weight: 500;
  }

  .loading {
    text-align: center;
    padding: 48px 20px;
    font-style: italic;
    color: var(--ink-soft);
  }

  .loading-ornament {
    font-size: 28px;
    color: var(--gold);
    animation: spin 3s linear infinite;
    display: inline-block;
    margin-bottom: 12px;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .error {
    padding: 20px;
    background: rgba(122, 30, 30, 0.08);
    border-left: 3px solid var(--crimson);
    color: var(--crimson);
    font-style: italic;
    margin-bottom: 20px;
  }

  footer.note {
    text-align: center;
    padding-top: 60px;
    font-size: 13px;
    color: var(--ink-soft);
    font-style: italic;
  }

  @media (max-width: 640px) {
    main { padding: 32px 20px 80px; }
    textarea { font-size: 19px; }
    .answer { font-size: 17px; }
    blockquote.verse { font-size: 16px; padding: 14px 16px; }
    .controls { flex-direction: column; align-items: stretch; }
    button.submit { width: 100%; }
  }
</style>
</head>
<body>

<main>
  <header class="masthead">
    <div class="ornament">
      <hr/>
      <svg viewBox="0 0 24 24"><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z"/></svg>
      <hr/>
    </div>
    <h1>Verbum</h1>
    <p class="tagline">Ask the Scriptures &mdash; receive answer, with every verse attested.</p>
  </header>

  <form class="ask" id="askForm">
    <label class="lbl" for="question">Pose your question</label>
    <textarea id="question" placeholder="What does the Bible say about forgiveness?" required autocomplete="off"></textarea>

    <div class="controls">
      <select class="translation-select" id="translation">
        <option value="ESV">English Standard Version (ESV)</option>
        <option value="KJV">King James Version (KJV)</option>
        <option value="NIV">New International Version (NIV)</option>
        <option value="NASB">New American Standard Bible (NASB)</option>
        <option value="NKJV">New King James Version (NKJV)</option>
      </select>
      <button type="submit" class="submit" id="submitBtn">Inquire</button>
    </div>

    <div class="suggestions">
      <span class="chip" data-q="What does the Bible say about loving your enemies?">On loving enemies</span>
      <span class="chip" data-q="How should Christians deal with anxiety and fear?">On anxiety</span>
      <span class="chip" data-q="What is the meaning of grace?">On grace</span>
      <span class="chip" data-q="What does Jesus teach about prayer?">On prayer</span>
      <span class="chip" data-q="How does the Bible describe true wisdom?">On wisdom</span>
    </div>
  </form>

  <div class="response" id="response"></div>

  <footer class="note">
    <div class="ornament">
      <hr/>
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg>
      <hr/>
    </div>
    <p>Powered by Cloudflare Workers AI. Verify all passages in your own Bible.</p>
  </footer>
</main>

<script>
  const form = document.getElementById('askForm');
  const questionEl = document.getElementById('question');
  const translationEl = document.getElementById('translation');
  const submitBtn = document.getElementById('submitBtn');
  const responseEl = document.getElementById('response');

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      questionEl.value = chip.dataset.q;
      questionEl.focus();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionEl.value.trim();
    if (!question) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Seeking\u2026';

    responseEl.innerHTML = \`
      <div class="loading">
        <div class="loading-ornament">\u2766</div>
        <div>Searching the Scriptures\u2026</div>
      </div>
    \`;

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, translation: translationEl.value })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Request failed');
      }

      renderAnswer(question, data);
    } catch (err) {
      responseEl.innerHTML = \`
        <div class="error">
          Alas, the request could not be completed: \${escapeHtml(err.message)}. Please try again.
        </div>
      \`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Inquire';
    }
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderAnswer(question, data) {
    const paragraphs = String(data.answer || '')
      .split(/\\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);

    const answerHtml = paragraphs
      .map((p, i) => \`<p class="\${i === 0 ? 'drop-cap' : ''}">\${escapeHtml(p)}</p>\`)
      .join('');

    const versesHtml = (data.verses && data.verses.length)
      ? \`
        <div class="verses">
          <div class="verses-title">Scriptures cited</div>
          \${data.verses.map(v => \`
            <blockquote class="verse">
              \${escapeHtml(v.text)}
              <cite>\${escapeHtml(v.reference)} &middot; \${escapeHtml(translationEl.value)}</cite>
            </blockquote>
          \`).join('')}
        </div>
      \`
      : '';

    responseEl.innerHTML = \`
      <article class="response-card">
        <div class="question-echo">\${escapeHtml(question)}</div>
        <div class="answer">\${answerHtml}</div>
        \${versesHtml}
      </article>
    \`;

    responseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

</body>
</html>`;
