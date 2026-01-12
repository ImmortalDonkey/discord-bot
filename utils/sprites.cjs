const path = require('path');
const fs = require('fs');

const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

function normalizeSpriteName(name) {
  return String(name)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getPokemonSpritePath(pokemonKey) {
  const displayName = normalizeSpriteName(pokemonKey);

  // try exact match first
  const direct = path.join(SPRITES_DIR, `${displayName}.png`);
  if (fs.existsSync(direct)) return direct;

  // fallback: loose match (safe)
  const files = fs.readdirSync(SPRITES_DIR);
  const found = files.find(f =>
    f.toLowerCase().includes(displayName.toLowerCase())
  );

  if (found) return path.join(SPRITES_DIR, found);

  return null;
}

module.exports = { getPokemonSpritePath };
