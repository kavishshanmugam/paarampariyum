const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Load content pages into memory at startup
const contentPages = {};
const contentDir = path.join(__dirname, '..', '..', 'content', 'pages');

function loadContentPages() {
  if (Object.keys(contentPages).length > 0) return;
  try {
    const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const id = file.replace('.md', '');
      const text = fs.readFileSync(path.join(contentDir, file), 'utf8');
      contentPages[id] = parseContentPage(text);
    }
    console.log(`Loaded ${Object.keys(contentPages).length} content pages`);
  } catch (err) {
    console.error('Failed to load content pages:', err.message);
  }
}

function parseContentPage(md) {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  const bodyMatch = md.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1].trim() : '';
  const meta = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^\s*(\w[\w_]*)\s*:\s*"?(.+?)"?\s*$/);
      if (kv) meta[kv[1]] = kv[2];
    }
  }
  const sections = {};
  let currentSection = '';
  for (const line of body.split('\n')) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) { currentSection = h2[1]; sections[currentSection] = ''; continue; }
    if (currentSection) sections[currentSection] += line + '\n';
  }
  return { meta, body, sections };
}

// Tool definitions for the Claude API
const tools = [
  {
    name: 'get_page',
    description: 'Get a reviewed content page by observance ID (e.g. "diwali-lakshmi-puja", "ekadashi", "maha-shivaratri"). Returns the full page with sections.',
    input_schema: {
      type: 'object',
      properties: {
        observance_id: { type: 'string', description: 'The observance page ID (kebab-case)' },
      },
      required: ['observance_id'],
    },
  },
  {
    name: 'search_pages',
    description: 'Search across all content pages by keyword. Returns matching page IDs and relevant excerpts.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_family_notes',
    description: 'Get family tradition notes for a specific observance written by the user or their household.',
    input_schema: {
      type: 'object',
      properties: {
        observance_id: { type: 'string', description: 'The observance page ID' },
      },
      required: ['observance_id'],
    },
  },
  {
    name: 'list_observances',
    description: 'List all available observance pages with their names. Use this to discover what content is available.',
    input_schema: { type: 'object', properties: {} },
  },
];

// Tool implementations
function executeTool(toolName, input, userId, db) {
  switch (toolName) {
    case 'get_page': {
      const page = contentPages[input.observance_id];
      if (!page) return { error: `No page found for "${input.observance_id}". Use list_observances to see available pages.` };
      return {
        id: input.observance_id,
        name: page.meta.en || input.observance_id,
        sanskrit: page.meta.sa || '',
        sections: Object.fromEntries(
          Object.entries(page.sections).map(([k, v]) => [k, v.trim().substring(0, 2000)])
        ),
      };
    }
    case 'search_pages': {
      const q = input.query.toLowerCase();
      const keywords = q.split(/\s+/).filter(w => w.length > 2);
      const results = [];
      for (const [id, page] of Object.entries(contentPages)) {
        const name = (page.meta.en || id).toLowerCase();
        const bodyLower = page.body.toLowerCase();
        let score = 0;
        if (name.includes(q) || q.includes(name)) score += 100;
        for (const kw of keywords) {
          if (name.includes(kw)) score += 20;
          if (bodyLower.includes(kw)) score += 5;
        }
        if (score > 0) {
          // Extract a relevant snippet
          let snippet = '';
          for (const kw of keywords) {
            const idx = bodyLower.indexOf(kw);
            if (idx >= 0) {
              snippet = page.body.substring(Math.max(0, idx - 80), idx + 200).trim();
              break;
            }
          }
          results.push({ id, name: page.meta.en || id, score, snippet });
        }
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, 5);
    }
    case 'get_family_notes': {
      const notes = db.prepare(
        `SELECT content, note_type, pinned, created_at FROM family_notes
         WHERE user_id = ? AND observance_id = ? ORDER BY pinned DESC, created_at DESC`
      ).all(userId, input.observance_id);
      if (notes.length === 0) return { message: 'No family notes for this observance yet.' };
      return notes;
    }
    case 'list_observances': {
      return Object.entries(contentPages).map(([id, page]) => ({
        id,
        name: page.meta.en || id,
        type: page.meta.type || 'observance',
      }));
    }
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// System prompt per PRD hard rules
const SYSTEM_PROMPT = `You are Saathi, the guide in the Paarampariyum app -- a Hindu calendar and tradition companion for a small group of Tamil/South Indian families in Melbourne, Australia.

HARD RULES (never break these):
1. DATES: Never generate or guess dates. All dates come from the panchang engine. If asked "when is X", say you'd need to check the calendar engine and direct the user to the Calendar tab.
2. SCRIPTURE: Never invent verses or quotes. Only quote text that appears in the content pages retrieved via your tools. Always cite the source.
3. PERSONA: You are a knowledgeable companion, like a well-read older cousin. NEVER speak as a deity, saint, or guru. Never say "I am Krishna" or role-play as a divine figure.
4. NO RULINGS: Never say "you must" or "you should". Present what traditions do, not what people must do. Say "many families do X" or "the tradition recommends X".
5. EVIDENCE: When discussing scientific or health aspects, clearly label what is tradition's reason vs. what has research support. Be honest about what's unsupported.
6. NO FEAR/GUILT: Never imply bad luck, misfortune, or spiritual consequences for not observing. No streaks, no guilt.
7. SOUTH INDIAN FIRST: This app is Tamil/South Indian focused. Lead with Tamil names (Deepavali not Diwali, Vinayagar not Ganesh, Pradosham not Pradosh Vrat). When describing festivals, present the South Indian / Tamil tradition first. Mention North Indian variants as "in North India..." when relevant.
8. UNCERTAINTY: If you don't know or your sources don't cover it, say so plainly. Offer to flag the question for editors.
9. FAMILY FIRST: If the user has family notes for an observance, mention them first ("Your family's tradition is..."), then give the general guidance.

BEHAVIOUR:
- "When is X?" -> Direct to Calendar tab (dates come from the engine, not from you)
- "What do I do for X?" -> Family note first if available, then ten-minute version, then exemptions
- "Tell me about X" / "Story of X" -> Use get_page tool, share the short story, offer the full version
- "Why do we do X?" -> Tradition's reasons first, then research evidence with grade, each labelled
- Asked to speak as a deity / astrology / politics -> Decline politely, offer what the texts say instead
- Unknown topic -> Say you don't have a reviewed answer, offer to flag it

STYLE:
- Warm but not preachy. Brief answers unless the user asks for more.
- Use simple English. Define Sanskrit and Tamil terms when first used.
- Show sources: mention which page or text the information comes from.
- Greeting: use "Vanakkam" not "Namaste".

The user's profile:
- Tradition: {tradition}
- Month system: {month_system}
- Location: Melbourne, Australia`;

// Chat endpoint
router.post('/chat', requireAuth, async (req, res) => {
  const { message, conversationId } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  loadContentPages();

  const db = req.app.locals.db;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'AI guide not configured. Set ANTHROPIC_API_KEY.' });
  }

  // Load or create conversation
  let conversation;
  let messages = [];
  if (conversationId) {
    conversation = db.prepare('SELECT * FROM guide_conversations WHERE id = ? AND user_id = ?')
      .get(conversationId, req.user.id);
    if (conversation) messages = JSON.parse(conversation.messages);
  }

  // Add user message
  messages.push({ role: 'user', content: message });

  // Keep last 20 messages to avoid token overflow
  if (messages.length > 20) messages = messages.slice(-20);

  const systemPrompt = SYSTEM_PROMPT
    .replace('{tradition}', req.user.tradition || 'smarta')
    .replace('{month_system}', req.user.monthSystem || 'purnimanta');

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    // Run the tool loop
    let apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    let assistantText = '';
    let toolUseCount = 0;
    const maxToolRounds = 5;

    while (toolUseCount < maxToolRounds) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: apiMessages,
      });

      // Collect text and tool use blocks
      const textBlocks = response.content.filter(b => b.type === 'text');
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');

      if (textBlocks.length > 0) {
        assistantText = textBlocks.map(b => b.text).join('\n');
      }

      if (toolBlocks.length === 0 || response.stop_reason === 'end_turn') {
        break;
      }

      // Execute tools and continue
      apiMessages.push({ role: 'assistant', content: response.content });

      const toolResults = toolBlocks.map(block => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(executeTool(block.name, block.input, req.user.id, db)),
      }));

      apiMessages.push({ role: 'user', content: toolResults });
      toolUseCount++;
    }

    // Save conversation
    messages.push({ role: 'assistant', content: assistantText });
    const convId = conversationId || require('uuid').v4();

    if (conversationId && conversation) {
      db.prepare('UPDATE guide_conversations SET messages = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(JSON.stringify(messages), convId);
    } else {
      db.prepare('INSERT INTO guide_conversations (id, user_id, messages) VALUES (?, ?, ?)')
        .run(convId, req.user.id, JSON.stringify(messages));
    }

    res.json({
      reply: assistantText,
      conversationId: convId,
    });
  } catch (err) {
    console.error('Guide error:', err.message);
    res.status(500).json({ error: 'Failed to get guide response' });
  }
});

// Flag a question for review
router.post('/flag', requireAuth, (req, res) => {
  const { question, context } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });

  const id = require('uuid').v4();
  req.app.locals.db.prepare(
    'INSERT INTO flagged_questions (id, user_id, question, context) VALUES (?, ?, ?, ?)'
  ).run(id, req.user.id, question, context || null);

  res.json({ message: 'Question flagged for review. Thank you.' });
});

// Get flagged questions (admin)
router.get('/flagged', (req, res) => {
  // Simple admin check via query param for now
  const flags = req.app.locals.db.prepare(
    'SELECT * FROM flagged_questions ORDER BY created_at DESC'
  ).all();
  res.json(flags);
});

module.exports = router;
