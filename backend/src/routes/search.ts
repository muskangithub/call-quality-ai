import { Router, type Request, type Response } from "express";
import { semanticSearch } from "../services/search.js";

const router = Router();

// ─── GET /api/search?q=... ────────────────────────────────────────────────────
// Natural-language semantic search across all completed calls.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = (req.query["q"] as string | undefined)?.trim();

  if (!query) {
    res.status(400).json({ error: "Query parameter 'q' is required" });
    return;
  }

  try {
    const results = await semanticSearch(query, 10);
    res.json({ query, results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
