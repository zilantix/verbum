/**
 * Verbum — Bible Q&A on Cloudflare Workers AI
 * v3: adds "Make a Kids' Comic" feature with 4-panel SVG storybook comics
 *
 * Endpoints:
 *   POST /api/ask    — streams a scripture-grounded Q&A answer
 *   POST /api/comic  — returns a 4-panel comic script (non-streaming JSON)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask" && request.method === "POST") {
      return handleAsk(request, env);
    }
    if (url.pathname === "/api/comic" && request.method === "POST") {
      return handleComic(request, env);
    }

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

    const systemPrompt = `You are a careful, reverent Bible study assistant. Answer using Scripture as your primary source.

CITATION RULES:
- Ground every substantive claim in specific Bible passages.
- Quote verses in the ${translation} translation.
- Only cite verses you are confident actually say what you claim. If unsure, give only the reference.
- Include 2 to 4 directly relevant verses.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown, no preamble:

{
  "answer": "A thoughtful 2-3 paragraph answer in plain prose. Reference verses in parentheses like (Romans 8:28). No markdown.",
  "verses": [
    {"reference": "Book Chapter:Verse", "text": "Exact verse text in ${translation}."}
  ]
}

Keep the answer concise — aim for 150-250 words total.`;

    const aiStream = await env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct-fast",
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        max_tokens: 800,
        temperature: 0.3,
        stream: true
      }
    );

    return new Response(aiStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (err) {
    return json({ error: err.message || "An error occurred." }, 500);
  }
}

async function handleComic(request, env) {
  try {
    const { question, answer } = await request.json();
    if (!question) {
      return json({ error: "Missing question." }, 400);
    }

    // Enumerate exactly what the frontend can render so the model stays on-rails
    const SCENES = ["desert", "sea", "garden", "temple", "home", "mountain", "boat", "town", "sky", "path"];
    const CHARACTERS = ["jesus", "disciple", "child", "parent", "angel", "crowd", "shepherd", "king"];
    const EMOTIONS = ["happy", "sad", "worried", "surprised", "peaceful", "confused"];

    const systemPrompt = `You are a children's Bible storyteller. Given a Bible question and answer, create a simple 4-panel comic strip that helps kids understand the lesson. The comic should be universal — engaging for ages 4 to 12.

RULES:
- EXACTLY 4 panels — a beginning, two middles, an end.
- Each panel advances the story. Show, don't just tell.
- Use only these scenes: ${SCENES.join(", ")}
- Use only these character types: ${CHARACTERS.join(", ")}
- Use only these emotions: ${EMOTIONS.join(", ")}
- Each panel needs 1-3 characters max (not every panel needs dialogue).
- Captions are short narrator text (under 15 words).
- Dialogue is even shorter (under 10 words per line), and feels natural for kids.
- End with a clear, hopeful takeaway that mirrors the lesson.
- Title should be joyful and simple (under 6 words).

OUTPUT — respond with ONLY valid JSON, no markdown, no code fences:

{
  "title": "Short joyful title",
  "panels": [
    {
      "scene": "one of the allowed scenes",
      "characters": [
        {"type": "one of the allowed characters", "emotion": "one of the allowed emotions", "position": "left" | "center" | "right"}
      ],
      "caption": "Narrator sentence.",
      "dialogue": [
        {"speaker": "character type from this panel", "text": "Short line of speech."}
      ]
    }
  ]
}

Keep it joyful, simple, and true to Scripture.`;

    const aiResponse = await env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct-fast",
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `QUESTION: ${question}\n\nANSWER: ${answer || '(none provided)'}\n\nCreate a 4-panel comic.` }
        ],
        max_tokens: 1200,
        temperature: 0.7
      }
    );

    const raw = (aiResponse.response || "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let script;
    try {
      script = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) return json({ error: "Could not parse comic script." }, 502);
      script = JSON.parse(match[0]);
    }

    // Sanitize — keep values within the allowed sets so the renderer never crashes
    script.panels = (script.panels || []).slice(0, 4).map(p => ({
      scene: SCENES.includes(p.scene) ? p.scene : "sky",
      characters: (p.characters || []).slice(0, 3).map(c => ({
        type: CHARACTERS.includes(c.type) ? c.type : "disciple",
        emotion: EMOTIONS.includes(c.emotion) ? c.emotion : "peaceful",
        position: ["left", "center", "right"].includes(c.position) ? c.position : "center"
      })),
      caption: String(p.caption || "").slice(0, 120),
      dialogue: (p.dialogue || []).slice(0, 2).map(d => ({
        speaker: String(d.speaker || ""),
        text: String(d.text || "").slice(0, 80)
      }))
    }));

    return json(script);
  } catch (err) {
    return json({ error: err.message || "Comic generation failed." }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
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
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Cinzel:wght@400;500;600;700&family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
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

  textarea::placeholder { color: rgba(58, 46, 36, 0.5); }

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
    animation: fadeUp 0.4s ease;
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
    min-height: 20px;
  }

  .answer p { margin-bottom: 1em; }

  .answer.streaming::after {
    content: '\u258B';
    display: inline-block;
    color: var(--gold);
    animation: blink 1s step-end infinite;
    margin-left: 2px;
    font-weight: normal;
  }

  @keyframes blink { 50% { opacity: 0; } }

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
    animation: fadeUp 0.4s ease;
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

  .thinking {
    text-align: center;
    padding: 24px 20px;
    font-style: italic;
    color: var(--ink-soft);
    font-size: 15px;
  }

  .thinking-ornament {
    font-size: 22px;
    color: var(--gold);
    animation: spin 2s linear infinite;
    display: inline-block;
    margin-right: 10px;
    vertical-align: -3px;
  }

  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

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

  /* ═══════════════════════════════════════════════════════════
     COMIC STYLES — kid-friendly zone
     ═══════════════════════════════════════════════════════════ */

  .comic-launch {
    margin-top: 36px;
    padding-top: 28px;
    border-top: 1px dashed var(--parchment-deep);
    text-align: center;
  }

  button.comic-btn {
    font-family: 'Fredoka', sans-serif;
    font-weight: 600;
    font-size: 16px;
    background: linear-gradient(135deg, #c9a158 0%, #a07b2c 100%);
    color: #fff;
    border: none;
    padding: 14px 28px;
    border-radius: 999px;
    cursor: pointer;
    letter-spacing: 0.02em;
    box-shadow: 0 6px 20px -8px rgba(160, 123, 44, 0.6);
    transition: all 0.25s ease;
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  button.comic-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px -8px rgba(160, 123, 44, 0.7);
  }

  button.comic-btn:disabled { opacity: 0.6; cursor: wait; }

  .comic-btn-hint {
    font-family: 'EB Garamond', serif;
    font-style: italic;
    font-size: 13px;
    color: var(--ink-soft);
    margin-top: 10px;
  }

  .comic-stage {
    margin-top: 36px;
    padding: 32px 20px;
    background: linear-gradient(180deg, #fff8e4 0%, #f4ead5 100%);
    border: 2px solid var(--gold);
    border-radius: 12px;
    box-shadow: 0 20px 40px -20px var(--shadow);
    animation: fadeUp 0.6s ease;
  }

  .comic-title {
    font-family: 'Fredoka', sans-serif;
    font-weight: 700;
    font-size: clamp(24px, 5vw, 34px);
    text-align: center;
    color: var(--crimson);
    margin-bottom: 24px;
    text-shadow: 2px 2px 0 var(--gold-bright);
  }

  .comic-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 18px;
  }

  @media (max-width: 600px) {
    .comic-grid { grid-template-columns: 1fr; }
  }

  .panel {
    background: #fff;
    border: 3px solid var(--ink);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 4px 4px 0 var(--ink);
    position: relative;
  }

  .panel svg { display: block; width: 100%; height: auto; }

  .panel-caption {
    font-family: 'Fredoka', sans-serif;
    font-size: 14px;
    padding: 10px 14px;
    background: #fff7e0;
    border-top: 3px solid var(--ink);
    color: var(--ink);
    line-height: 1.4;
    font-weight: 500;
  }

  .comic-footer {
    text-align: center;
    margin-top: 24px;
    font-family: 'Fredoka', sans-serif;
    font-size: 14px;
    color: var(--ink-soft);
  }

  .comic-footer button {
    font-family: 'Fredoka', sans-serif;
    font-size: 13px;
    background: transparent;
    border: 1px solid var(--gold);
    color: var(--ink-soft);
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    margin-left: 10px;
    transition: all 0.2s;
  }

  .comic-footer button:hover {
    background: var(--gold);
    color: #fff;
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

  // Store the last Q&A so the comic generator has context
  let lastContext = { question: '', answer: '' };

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
      <article class="response-card">
        <div class="question-echo">\${escapeHtml(question)}</div>
        <div class="thinking"><span class="thinking-ornament">\u2766</span>Opening the Scriptures\u2026</div>
        <div class="answer streaming" id="liveAnswer" style="display:none;"></div>
        <div id="liveVerses"></div>
        <div id="comicZone"></div>
      </article>
    \`;
    responseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const thinking = responseEl.querySelector('.thinking');
    const answerEl = document.getElementById('liveAnswer');
    const versesEl = document.getElementById('liveVerses');
    const comicZone = document.getElementById('comicZone');

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, translation: translationEl.value })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || \`HTTP \${res.status}\`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let firstTokenReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const chunk = JSON.parse(payload);
            const token = chunk.response || '';
            if (!token) continue;

            if (!firstTokenReceived) {
              firstTokenReceived = true;
              thinking.style.display = 'none';
              answerEl.style.display = 'block';
            }

            fullText += token;
            renderProgressive(fullText, answerEl, versesEl);
          } catch (e) { /* ignore */ }
        }
      }

      answerEl.classList.remove('streaming');
      const finalAnswer = renderFinal(fullText, answerEl, versesEl);

      // Save context and offer kids' comic
      lastContext = { question, answer: finalAnswer || '' };
      renderComicLauncher(comicZone);

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
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function extractAnswer(text) {
    const m = text.match(/"answer"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)/);
    if (!m) return '';
    return m[1].replace(/\\\\n/g, '\\n').replace(/\\\\"/g, '"').replace(/\\\\\\\\/g, '\\\\');
  }

  function extractVerses(text) {
    const verses = [];
    const re = /\\{\\s*"reference"\\s*:\\s*"([^"]+)"\\s*,\\s*"text"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*\\}/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      verses.push({
        reference: match[1],
        text: match[2].replace(/\\\\"/g, '"').replace(/\\\\\\\\/g, '\\\\')
      });
    }
    return verses;
  }

  function renderProgressive(text, answerEl, versesEl) {
    const answer = extractAnswer(text);
    if (answer) {
      const paragraphs = answer.split(/\\n{2,}/).map(p => p.trim()).filter(Boolean);
      answerEl.innerHTML = paragraphs
        .map((p, i) => \`<p class="\${i === 0 ? 'drop-cap' : ''}">\${escapeHtml(p)}</p>\`)
        .join('');
    }
    const verses = extractVerses(text);
    if (verses.length > 0 && (!versesEl.dataset.count || parseInt(versesEl.dataset.count) !== verses.length)) {
      versesEl.dataset.count = verses.length;
      versesEl.innerHTML = \`
        <div class="verses">
          <div class="verses-title">Scriptures cited</div>
          \${verses.map(v => \`
            <blockquote class="verse">
              \${escapeHtml(v.text)}
              <cite>\${escapeHtml(v.reference)} &middot; \${escapeHtml(translationEl.value)}</cite>
            </blockquote>
          \`).join('')}
        </div>
      \`;
    }
  }

  function renderFinal(text, answerEl, versesEl) {
    try {
      const cleaned = text.replace(/^\\s*\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`\\s*$/i, '').trim();
      const match = cleaned.match(/\\{[\\s\\S]*\\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.answer) {
          const paragraphs = parsed.answer.split(/\\n{2,}/).map(p => p.trim()).filter(Boolean);
          answerEl.innerHTML = paragraphs
            .map((p, i) => \`<p class="\${i === 0 ? 'drop-cap' : ''}">\${escapeHtml(p)}</p>\`)
            .join('');
        }
        if (parsed.verses && parsed.verses.length) {
          versesEl.innerHTML = \`
            <div class="verses">
              <div class="verses-title">Scriptures cited</div>
              \${parsed.verses.map(v => \`
                <blockquote class="verse">
                  \${escapeHtml(v.text)}
                  <cite>\${escapeHtml(v.reference)} &middot; \${escapeHtml(translationEl.value)}</cite>
                </blockquote>
              \`).join('')}
            </div>
          \`;
        }
        return parsed.answer || '';
      }
    } catch (e) { /* progressive is fine */ }
    return extractAnswer(text);
  }

  // ═════════════════════════════════════════════════════════
  // COMIC GENERATION & RENDERING
  // ═════════════════════════════════════════════════════════

  function renderComicLauncher(zone) {
    zone.innerHTML = \`
      <div class="comic-launch">
        <button class="comic-btn" id="comicBtn">
          <span>\u2728</span> Make a Kids' Comic
        </button>
        <div class="comic-btn-hint">A 4-panel storybook version for younger readers</div>
      </div>
    \`;
    document.getElementById('comicBtn').addEventListener('click', generateComic);
  }

  async function generateComic() {
    const btn = document.getElementById('comicBtn');
    const zone = document.getElementById('comicZone');
    btn.disabled = true;
    btn.innerHTML = '<span>\u2728</span> Drawing the story\u2026';

    try {
      const res = await fetch('/api/comic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastContext)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Comic request failed');
      }
      const script = await res.json();
      renderComic(zone, script);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = '<span>\u2728</span> Try again';
      const hint = zone.querySelector('.comic-btn-hint');
      if (hint) hint.textContent = 'Something went wrong: ' + err.message;
    }
  }

  function renderComic(zone, script) {
    const panels = (script.panels || []).slice(0, 4);
    const title = script.title || 'A Bible Story';

    zone.innerHTML = \`
      <div class="comic-stage">
        <div class="comic-title">\${escapeHtml(title)}</div>
        <div class="comic-grid">
          \${panels.map((p, i) => \`
            <div class="panel">
              \${renderPanelSVG(p, i)}
              <div class="panel-caption">\${escapeHtml(p.caption || '')}</div>
            </div>
          \`).join('')}
        </div>
        <div class="comic-footer">
          Made with love from Scripture
          <button id="comicAgain">Make another</button>
        </div>
      </div>
    \`;

    document.getElementById('comicAgain').addEventListener('click', generateComic);
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Scene library ─────────────────────────────────────────
  const scenes = {
    desert: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#fbc968"/><stop offset="1" stop-color="#f28d4b"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <circle cx="320" cy="70" r="38" fill="#ffe59e"/>
      <path d="M0 220 Q100 190 200 215 T400 210 L400 300 L0 300 Z" fill="#d89555"/>
      <path d="M0 260 Q120 240 250 255 T400 255 L400 300 L0 300 Z" fill="#a86b33"/>
    \`,
    sea: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#7cc5f0"/><stop offset="1" stop-color="#c9e8f5"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <ellipse cx="90" cy="70" rx="40" ry="14" fill="#fff" opacity="0.8"/>
      <ellipse cx="300" cy="50" rx="50" ry="16" fill="#fff" opacity="0.6"/>
      <rect y="180" width="400" height="120" fill="#2e7bb8"/>
      <path d="M0 200 Q50 192 100 200 T200 200 T300 200 T400 200 L400 210 L0 210 Z" fill="#4a96d0"/>
      <path d="M0 230 Q60 222 120 230 T240 230 T360 230 L400 230 L400 240 L0 240 Z" fill="#3a86c2"/>
    \`,
    garden: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#bfe7f7"/><stop offset="1" stop-color="#e6f5d9"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <circle cx="340" cy="60" r="32" fill="#ffe59e"/>
      <rect y="200" width="400" height="100" fill="#7cb956"/>
      <g fill="#4a8b3f">
        <circle cx="60" cy="195" r="25"/><circle cx="80" cy="185" r="22"/><rect x="68" y="195" width="6" height="20" fill="#6b4423"/>
        <circle cx="340" cy="195" r="25"/><circle cx="360" cy="185" r="22"/><rect x="348" y="195" width="6" height="20" fill="#6b4423"/>
      </g>
      <g fill="#e94c6f"><circle cx="140" cy="230" r="4"/><circle cx="260" cy="235" r="4"/><circle cx="180" cy="238" r="4"/></g>
      <g fill="#ffd54f"><circle cx="220" cy="232" r="4"/><circle cx="300" cy="240" r="4"/></g>
    \`,
    temple: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#ffe0a8"/><stop offset="1" stop-color="#f4c78a"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <rect y="220" width="400" height="80" fill="#c9a26c"/>
      <g fill="#e8d4a0" stroke="#8a6b3a" stroke-width="2">
        <rect x="120" y="100" width="160" height="120"/>
        <polygon points="110,100 290,100 200,60"/>
        <rect x="140" y="130" width="20" height="90" fill="#c9a26c"/>
        <rect x="180" y="130" width="20" height="90" fill="#c9a26c"/>
        <rect x="220" y="130" width="20" height="90" fill="#c9a26c"/>
        <rect x="260" y="130" width="20" height="90" fill="#c9a26c"/>
      </g>
    \`,
    home: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#ffc89a"/><stop offset="1" stop-color="#ffe5b8"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <rect y="230" width="400" height="70" fill="#b8855a"/>
      <g>
        <rect x="100" y="130" width="200" height="110" fill="#e8c299" stroke="#8a5a36" stroke-width="3"/>
        <polygon points="85,130 315,130 200,70" fill="#a85a3a" stroke="#6b3420" stroke-width="3"/>
        <rect x="180" y="170" width="40" height="70" fill="#6b3420"/>
        <rect x="120" y="150" width="30" height="30" fill="#c9e6f5" stroke="#6b3420" stroke-width="2"/>
        <rect x="250" y="150" width="30" height="30" fill="#c9e6f5" stroke="#6b3420" stroke-width="2"/>
      </g>
    \`,
    mountain: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#a8c8f0"/><stop offset="1" stop-color="#e8d4b0"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <polygon points="0,300 100,130 200,220 300,100 400,260 400,300" fill="#6b7f9a"/>
      <polygon points="0,300 80,180 160,240 260,150 340,230 400,300" fill="#8a9db8"/>
      <polygon points="100,130 120,155 80,155" fill="#fff"/>
      <polygon points="300,100 325,135 275,135" fill="#fff"/>
      <rect y="260" width="400" height="40" fill="#6b5a3a"/>
    \`,
    boat: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#5a6b8a"/><stop offset="1" stop-color="#8aa5c2"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <rect y="180" width="400" height="120" fill="#2e4566"/>
      <path d="M0 200 Q50 190 100 200 T200 200 T300 200 T400 200 L400 215 L0 215 Z" fill="#3d5a82"/>
      <g transform="translate(120, 155)">
        <path d="M0 40 L160 40 L140 70 L20 70 Z" fill="#8a5a36" stroke="#4a2f1d" stroke-width="3"/>
        <rect x="75" y="-30" width="5" height="70" fill="#6b3420"/>
        <polygon points="80,-30 80,30 130,0" fill="#f4ead5" stroke="#8a6b3a" stroke-width="2"/>
      </g>
    \`,
    town: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#f4d38a"/><stop offset="1" stop-color="#f4ead5"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <rect y="240" width="400" height="60" fill="#c9a26c"/>
      <g stroke="#6b4423" stroke-width="2">
        <rect x="30" y="170" width="70" height="70" fill="#e8c299"/>
        <polygon points="25,170 105,170 65,140" fill="#a85a3a"/>
        <rect x="130" y="150" width="80" height="90" fill="#d4a56f"/>
        <polygon points="125,150 215,150 170,115" fill="#8a4a2f"/>
        <rect x="240" y="170" width="70" height="70" fill="#e8c299"/>
        <polygon points="235,170 315,170 275,140" fill="#a85a3a"/>
        <rect x="335" y="155" width="55" height="85" fill="#d4a56f"/>
        <polygon points="330,155 395,155 362,125" fill="#8a4a2f"/>
      </g>
    \`,
    sky: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#fff3b8"/><stop offset="0.5" stop-color="#ffd88a"/><stop offset="1" stop-color="#ffb482"/>
        </linearGradient>
        <radialGradient id="glow\${pid}"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <circle cx="200" cy="120" r="120" fill="url(#glow\${pid})"/>
      <g fill="#fff" opacity="0.9">
        <ellipse cx="60" cy="80" rx="30" ry="10"/>
        <ellipse cx="330" cy="60" rx="40" ry="12"/>
        <ellipse cx="100" cy="200" rx="35" ry="10"/>
      </g>
      <g fill="#ffe0a0" opacity="0.6">
        <polygon points="200,60 205,75 220,75 208,85 213,100 200,92 187,100 192,85 180,75 195,75"/>
      </g>
    \`,
    path: (pid) => \`
      <defs>
        <linearGradient id="sky\${pid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#c9e6f5"/><stop offset="1" stop-color="#f4ead5"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky\${pid})"/>
      <rect y="220" width="400" height="80" fill="#8ab456"/>
      <path d="M150 300 Q180 260 200 240 T240 200 L260 200 Q240 240 220 260 T190 300 Z" fill="#d4b57a" stroke="#8a6b3a" stroke-width="2"/>
      <g fill="#4a8b3f">
        <circle cx="50" cy="215" r="20"/><rect x="46" y="215" width="8" height="15" fill="#6b4423"/>
        <circle cx="350" cy="215" r="18"/><rect x="346" y="215" width="8" height="15" fill="#6b4423"/>
      </g>
    \`
  };

  // ─── Character library ─────────────────────────────────────
  // Each character is a function returning SVG at position (x, y, scale)
  const colors = {
    jesus: { robe: '#e8d4a0', sash: '#c73a3a', skin: '#e8c299', hair: '#6b4423' },
    disciple: { robe: '#8aa5c2', sash: '#c9a26c', skin: '#e8c299', hair: '#4a3a24' },
    child: { robe: '#f4a56f', sash: '#ffd54f', skin: '#ffd8b0', hair: '#8a5a36' },
    parent: { robe: '#a85a7a', sash: '#6b4a8a', skin: '#e8c299', hair: '#4a2f1d' },
    angel: { robe: '#ffffff', sash: '#ffd54f', skin: '#ffe5c8', hair: '#ffd54f' },
    crowd: { robe: '#9a8a6b', sash: '#8a5a36', skin: '#d4a56f', hair: '#4a3a24' },
    shepherd: { robe: '#6b8a5a', sash: '#8a5a36', skin: '#e8c299', hair: '#6b4423' },
    king: { robe: '#6a2e8a', sash: '#ffd54f', skin: '#e8c299', hair: '#4a2f1d' }
  };

  function mouth(emotion) {
    switch (emotion) {
      case 'happy': return '<path d="M-5 3 Q0 7 5 3" stroke="#4a2f1d" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
      case 'sad': return '<path d="M-5 5 Q0 1 5 5" stroke="#4a2f1d" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
      case 'worried': return '<path d="M-4 4 L4 4" stroke="#4a2f1d" stroke-width="1.5" stroke-linecap="round"/>';
      case 'surprised': return '<ellipse cx="0" cy="4" rx="2" ry="3" fill="#4a2f1d"/>';
      case 'peaceful': return '<path d="M-4 3 Q0 5 4 3" stroke="#4a2f1d" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
      case 'confused': return '<path d="M-4 4 Q-2 2 0 4 Q2 6 4 4" stroke="#4a2f1d" stroke-width="1.5" fill="none"/>';
      default: return '<path d="M-4 3 Q0 5 4 3" stroke="#4a2f1d" stroke-width="1.5" fill="none"/>';
    }
  }

  function eyes(emotion) {
    if (emotion === 'surprised') {
      return '<circle cx="-5" cy="-3" r="2.5" fill="#fff" stroke="#4a2f1d" stroke-width="1"/><circle cx="5" cy="-3" r="2.5" fill="#fff" stroke="#4a2f1d" stroke-width="1"/><circle cx="-5" cy="-3" r="1" fill="#4a2f1d"/><circle cx="5" cy="-3" r="1" fill="#4a2f1d"/>';
    }
    if (emotion === 'sad' || emotion === 'worried') {
      return '<path d="M-7 -4 Q-5 -2 -3 -4" stroke="#4a2f1d" stroke-width="1.5" fill="none"/><path d="M3 -4 Q5 -2 7 -4" stroke="#4a2f1d" stroke-width="1.5" fill="none"/>';
    }
    return '<circle cx="-5" cy="-3" r="1.5" fill="#4a2f1d"/><circle cx="5" cy="-3" r="1.5" fill="#4a2f1d"/>';
  }

  function drawCharacter(type, emotion, x, y, scale = 1) {
    const c = colors[type] || colors.disciple;
    const extras = [];

    // Character-specific adornments
    if (type === 'jesus') {
      extras.push(\`<circle cx="\${x}" cy="\${y - 60 * scale}" r="\${16 * scale}" fill="none" stroke="#ffd54f" stroke-width="2" stroke-dasharray="2,2"/>\`);
    }
    if (type === 'king') {
      extras.push(\`<polygon points="\${x - 12 * scale},\${y - 60 * scale} \${x - 6 * scale},\${y - 72 * scale} \${x},\${y - 62 * scale} \${x + 6 * scale},\${y - 72 * scale} \${x + 12 * scale},\${y - 60 * scale} \${x + 12 * scale},\${y - 54 * scale} \${x - 12 * scale},\${y - 54 * scale}" fill="#ffd54f" stroke="#8a5a36" stroke-width="1"/>\`);
    }
    if (type === 'angel') {
      extras.push(\`<ellipse cx="\${x - 18 * scale}" cy="\${y - 30 * scale}" rx="\${14 * scale}" ry="\${22 * scale}" fill="#fff" stroke="#ffd54f" stroke-width="1.5" transform="rotate(-25 \${x - 18 * scale} \${y - 30 * scale})"/>\`);
      extras.push(\`<ellipse cx="\${x + 18 * scale}" cy="\${y - 30 * scale}" rx="\${14 * scale}" ry="\${22 * scale}" fill="#fff" stroke="#ffd54f" stroke-width="1.5" transform="rotate(25 \${x + 18 * scale} \${y - 30 * scale})"/>\`);
      extras.push(\`<circle cx="\${x}" cy="\${y - 68 * scale}" r="\${10 * scale}" fill="none" stroke="#ffd54f" stroke-width="2"/>\`);
    }
    if (type === 'shepherd') {
      extras.push(\`<path d="M \${x + 20 * scale} \${y - 50 * scale} Q \${x + 30 * scale} \${y - 55 * scale} \${x + 32 * scale} \${y - 40 * scale}" fill="none" stroke="#6b4423" stroke-width="3"/>\`);
      extras.push(\`<line x1="\${x + 20 * scale}" y1="\${y - 50 * scale}" x2="\${x + 22 * scale}" y2="\${y + 10 * scale}" stroke="#6b4423" stroke-width="3"/>\`);
    }
    if (type === 'child') {
      // smaller head
      scale *= 0.8;
    }
    if (type === 'crowd') {
      // crowd = 3 small heads behind each other
      return \`
        <g>
          <circle cx="\${x - 14}" cy="\${y - 30}" r="10" fill="\${c.skin}" stroke="#4a2f1d" stroke-width="1.2"/>
          <circle cx="\${x}" cy="\${y - 34}" r="11" fill="\${c.skin}" stroke="#4a2f1d" stroke-width="1.2"/>
          <circle cx="\${x + 14}" cy="\${y - 30}" r="10" fill="\${c.skin}" stroke="#4a2f1d" stroke-width="1.2"/>
          <path d="M \${x - 30} \${y + 30} Q \${x} \${y - 20} \${x + 30} \${y + 30} Z" fill="\${c.robe}" stroke="#4a2f1d" stroke-width="1.5"/>
        </g>
      \`;
    }

    const headR = 18 * scale;
    const bodyH = 50 * scale;

    return \`
      <g>
        \${extras.join('')}
        <!-- body (robe as triangle) -->
        <path d="M \${x - 22 * scale} \${y + bodyH * 0.5} L \${x + 22 * scale} \${y + bodyH * 0.5} L \${x + 16 * scale} \${y - bodyH * 0.4} L \${x - 16 * scale} \${y - bodyH * 0.4} Z"
              fill="\${c.robe}" stroke="#4a2f1d" stroke-width="1.5"/>
        <!-- sash -->
        <rect x="\${x - 20 * scale}" y="\${y - 5 * scale}" width="\${40 * scale}" height="\${7 * scale}" fill="\${c.sash}" stroke="#4a2f1d" stroke-width="1"/>
        <!-- head -->
        <circle cx="\${x}" cy="\${y - bodyH * 0.4 - headR * 0.6}" r="\${headR}" fill="\${c.skin}" stroke="#4a2f1d" stroke-width="1.5"/>
        <!-- hair -->
        <path d="M \${x - headR} \${y - bodyH * 0.4 - headR * 0.6} Q \${x - headR} \${y - bodyH * 0.4 - headR * 1.5} \${x} \${y - bodyH * 0.4 - headR * 1.5} Q \${x + headR} \${y - bodyH * 0.4 - headR * 1.5} \${x + headR} \${y - bodyH * 0.4 - headR * 0.6} Q \${x + headR * 0.6} \${y - bodyH * 0.4 - headR * 0.9} \${x} \${y - bodyH * 0.4 - headR * 0.9} Q \${x - headR * 0.6} \${y - bodyH * 0.4 - headR * 0.9} \${x - headR} \${y - bodyH * 0.4 - headR * 0.6} Z"
              fill="\${c.hair}"/>
        <!-- face features -->
        <g transform="translate(\${x}, \${y - bodyH * 0.4 - headR * 0.6})">
          \${eyes(emotion)}
          \${mouth(emotion)}
        </g>
      </g>
    \`;
  }

  // ─── Speech bubble ─────────────────────────────────────────
  function drawBubble(text, x, y, pointTo) {
    if (!text) return '';
    // Wrap text crudely
    const words = text.split(/\\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 18) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = (line + ' ' + w).trim();
      }
    }
    if (line) lines.push(line);
    const maxLines = Math.min(3, lines.length);
    const displayLines = lines.slice(0, maxLines);
    const w = Math.max(...displayLines.map(l => l.length)) * 7 + 20;
    const h = maxLines * 14 + 12;

    // Clamp within 400x300 canvas
    const bx = Math.max(5, Math.min(400 - w - 5, x - w / 2));
    const by = Math.max(5, Math.min(220, y - h - 20));

    const tail = \`M \${bx + w / 2} \${by + h} L \${pointTo.x} \${pointTo.y} L \${bx + w / 2 + 10} \${by + h}\`;

    return \`
      <g>
        <path d="\${tail}" fill="#fff" stroke="#1a1410" stroke-width="2"/>
        <rect x="\${bx}" y="\${by}" width="\${w}" height="\${h}" rx="8" fill="#fff" stroke="#1a1410" stroke-width="2"/>
        <text x="\${bx + w / 2}" y="\${by + 14}" text-anchor="middle" font-family="Fredoka, sans-serif" font-size="11" fill="#1a1410" font-weight="500">
          \${displayLines.map((l, i) => \`<tspan x="\${bx + w / 2}" dy="\${i === 0 ? 0 : 14}">\${escapeHtml(l)}</tspan>\`).join('')}
        </text>
      </g>
    \`;
  }

  // ─── Panel composition ─────────────────────────────────────
  function renderPanelSVG(panel, idx) {
    const pid = 'p' + idx;
    const sceneFn = scenes[panel.scene] || scenes.sky;

    const positions = { left: 100, center: 200, right: 300 };
    const chars = (panel.characters || []).slice(0, 3);

    // Map character -> position on canvas
    const charRender = chars.map(c => {
      const x = positions[c.position] || 200;
      const y = 200;
      return { svg: drawCharacter(c.type, c.emotion, x, y), x, y, type: c.type };
    });

    // Render dialogue bubbles matching speaker to their character position
    const bubbles = (panel.dialogue || []).slice(0, 2).map((d, di) => {
      const match = charRender.find(cr => cr.type === d.speaker) || charRender[0];
      if (!match) return '';
      const offsetY = di * 10;
      return drawBubble(d.text, match.x, match.y - 60 + offsetY, { x: match.x, y: match.y - 80 });
    }).join('');

    return \`
      <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        \${sceneFn(pid)}
        \${charRender.map(c => c.svg).join('')}
        \${bubbles}
      </svg>
    \`;
  }
</script>

</body>
</html>`;
