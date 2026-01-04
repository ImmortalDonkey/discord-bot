/**
 * Pokémon → role resolver
 * Mirrors rarity role logic, but for individual Pokémon
 *
 * Env format:
 *   ROLE_POKEMON_IRON_CROWN=123
 *   ROLE_POKEMON_SNORLAX_SNOWMAN=456
 */
function getPokemonRole(pokemonName) {
  if (!pokemonName) return null;

  const envKey =
    "ROLE_POKEMON_" +
    pokemonName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_");

  return process.env[envKey] || null;
}

module.exports = {
  getPokemonRole
};