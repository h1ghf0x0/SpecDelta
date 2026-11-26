import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ChangedParagraphInput {
  oldText: string;
  newText: string;
  riskFlags: string[];
}

interface SectionDiffInput {
  sectionCode: string;
  division: string;
  title: string;
  status: 'modified' | 'added' | 'deleted';
  changedParagraphs: ChangedParagraphInput[];
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

app.post('/api/scope-brief', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(400).json({
        error:
          'GEMINI_API_KEY is not configured in Settings > Secrets. Add a Gemini API key to generate AI Scope Impact Briefs, or continue using 100% local deterministic risk flags.',
      });
      return;
    }

    const sections = req.body?.sections as SectionDiffInput[] | undefined;
    if (!Array.isArray(sections) || sections.length === 0) {
      res.status(400).json({ error: 'No changed specification sections provided.' });
      return;
    }

    const totalChangedCount =
      typeof req.body?.totalChangedCount === 'number' && req.body.totalChangedCount >= sections.length
        ? Math.round(req.body.totalChangedCount)
        : sections.length;

    // Prioritize highest-risk and largest-delta sections before capping payload to 25
    const ranked = [...sections].sort((a, b) => {
      const aRisks = a.changedParagraphs.reduce((sum, p) => sum + p.riskFlags.length, 0);
      const bRisks = b.changedParagraphs.reduce((sum, p) => sum + p.riskFlags.length, 0);
      if (aRisks !== bRisks) return bRisks - aRisks;
      return b.changedParagraphs.length - a.changedParagraphs.length;
    });

    const selected = ranked.slice(0, 25);

    // Only transmit compact changed paragraphs (never full spec manuals)
    const condensed = selected.map((s) => ({
      sectionCode: s.sectionCode,
      division: s.division,
      title: s.title,
      status: s.status,
      changes: s.changedParagraphs.slice(0, 8).map((p) => ({
        oldText: p.oldText.slice(0, 700),
        newText: p.newText.slice(0, 700),
        riskFlags: p.riskFlags,
      })),
    }));

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `You are a senior commercial construction chief estimator reviewing isolated specification changes between an original Project Manual and an Addendum.
Analyze ONLY the following changed specification excerpts (the top ${condensed.length} risk-ranked sections out of ${totalChangedCount} changed sections) and produce an executive 5-bullet (or fewer if fewer than 5 distinct changes exist) Cost & Scope Impact Brief for bid day.
Focus strictly on hard cost drivers, material/tolerance upgrades (PSI, mil, gauge), scope transfers (furnish vs. install, by Owner), allowances, warranties, and lead-time risks.
Do not invent sections or values that are not present in the provided JSON.

Changed Excerpts:
${JSON.stringify(condensed, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'Return concise, concrete estimator guidance grounded strictly in the supplied changed specification excerpts. Keep the executive summary under 45 words and produce up to 5 actionable bullets.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: 'One concise 1-2 sentence bid-day summary of overall cost and scope exposure.',
            },
            bullets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sectionCode: {
                    type: Type.STRING,
                    description: 'CSI section code such as 03 30 00 or 08 71 00.',
                  },
                  impactCategory: {
                    type: Type.STRING,
                    description: 'Short category like Material Upgrade, Scope Shift, Allowance, Warranty, or Lead Time.',
                  },
                  headline: {
                    type: Type.STRING,
                    description: 'Crisp 6-10 word estimator takeaway.',
                  },
                  detail: {
                    type: Type.STRING,
                    description: 'Specific quantitative or contractual delta from old to new text.',
                  },
                },
                required: ['sectionCode', 'impactCategory', 'headline', 'detail'],
              },
            },
          },
          required: ['executiveSummary', 'bullets'],
        },
      },
    });

    const raw = (response.text ?? '{}').trim();
    const parsed = JSON.parse(raw);
    res.json({
      ...parsed,
      sectionsSentCount: condensed.length,
      totalChangedSections: totalChangedCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate Scope Impact Brief.';
    const status = message.includes('403') || message.includes('PERMISSION_DENIED') ? 403 : 500;
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SpecDelta server listening on http://localhost:${PORT}`);
  });
}

startServer();
