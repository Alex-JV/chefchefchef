// Rejoue l'import Notion avec le VRAI mécanisme de structuration (Edge Function
// parse-recipe → Claude), une fois Supabase déployé.
//
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... CCC_PASSWORD=... \
//     node scripts/import-notion.mjs            # écrit data/seed/recipes.generated.json
//   ... node scripts/import-notion.mjs --insert  # insère directement dans la base
//
// Sans --insert, rien n'est modifié : compare data/seed/recipes.generated.json
// avec data/seed/recipes.json, puis relance `node scripts/build-seed.mjs` si tu
// veux régénérer seed.sql à partir du résultat.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SUPABASE_URL, SUPABASE_ANON_KEY, CCC_PASSWORD, AUTH_EMAIL = 'cuisine@chefchefchef.local' } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !CCC_PASSWORD) {
  console.error('Variables requises : SUPABASE_URL, SUPABASE_ANON_KEY, CCC_PASSWORD');
  process.exit(1);
}
const insertMode = process.argv.includes('--insert');

const raw = fs.readFileSync(path.join(root, 'data/notion/recipes.txt'), 'utf8');
const blocks = raw.split(/^### /m).slice(1).map((b) => {
  const nl = b.indexOf('\n');
  return { title: b.slice(0, nl).trim(), text: b.trim() };
});

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { error: authError } = await supabase.auth.signInWithPassword({ email: AUTH_EMAIL, password: CCC_PASSWORD });
if (authError) { console.error('Connexion impossible :', authError.message); process.exit(1); }

const existingTags = new Set();
const out = [];
for (const b of blocks) {
  process.stdout.write(`→ ${b.title} … `);
  const { data, error } = await supabase.functions.invoke(process.env.PARSE_FUNCTION || 'parse-recipe', { body: { text: b.text, existing_tags: [...existingTags] } });
  if (error || data?.error) { console.log('ÉCHEC', error?.message || data?.error); continue; }
  const r = data.recipe;
  for (const t of r.tags || []) existingTags.add(t);
  out.push({ notion_title: b.title, ...r });
  console.log(r.ambiguous ? `ambigu (${r.ambiguity_reason})` : `${r.ingredients.length} ingrédients, ${r.steps.length} étapes`);
  if (insertMode) {
    const { ambiguity_reason, notion_title, ...row } = out[out.length - 1];
    const notes = ambiguity_reason ? [row.notes, `Import Notion — ambigu : ${ambiguity_reason}`].filter(Boolean).join('\n') : row.notes;
    const { error: insError } = await supabase.from('recipes').insert({ ...row, notes, source_text: b.text });
    if (insError) console.log('   insertion échouée :', insError.message);
  }
}
fs.writeFileSync(path.join(root, 'data/seed/recipes.generated.json'), JSON.stringify(out, null, 2));
console.log(`\n${out.length}/${blocks.length} recettes structurées → data/seed/recipes.generated.json`);
