/**
 * Roles configuration for #roles channel
 * - rarityRoles → top-level rarity group toggles
 * - pokemonRoles → individual Pokémon toggles (grouped)
 */

module.exports = {

  // ──────────────────────────────
  // RARITY GROUP ROLES
  // ──────────────────────────────
  rarityRoles: [
    {
      label: "Roamer of the Month",
      env: "ROLE_ROAMER_MONTH"
    },
    {
      label: "Paradox",
      env: "ROLE_PARADOX"
    },
    {
      label: "Legendary",
      env: "ROLE_LEGENDARY"
    },
    {
      label: "Rare",
      env: "ROLE_RARE"
    },
    {
      label: "Common",
      env: "ROLE_COMMON"
    }
  ],

  // ──────────────────────────────
  // INDIVIDUAL POKÉMON ROLES
  // ──────────────────────────────
  pokemonRoles: [

    // ───────── ROAMER OF THE MONTH ─────────
    { label: "Clone Venusaur", env: "ROLE_POKEMON_CLONE_VENUSAUR", group: "roamerMonth" },
    { label: "Clone Charizard", env: "ROLE_POKEMON_CLONE_CHARIZARD", group: "roamerMonth" },
    { label: "Clone Blastoise", env: "ROLE_POKEMON_CLONE_BLASTOISE", group: "roamerMonth" },

    { label: "Ancient Jigglypuff", env: "ROLE_POKEMON_ANCIENT_JIGGLYPUFF", group: "roamerMonth" },
    { label: "Ancient Alakazam", env: "ROLE_POKEMON_ANCIENT_ALAKAZAM", group: "roamerMonth" },
    { label: "Ancient Gengar", env: "ROLE_POKEMON_ANCIENT_GENGAR", group: "roamerMonth" },

    { label: "Crystal Onix", env: "ROLE_POKEMON_CRYSTAL_ONIX", group: "roamerMonth" },
    { label: "Pink Rhyhorn", env: "ROLE_POKEMON_PINK_RHYHORN", group: "roamerMonth" },
    { label: "Snorlax (Snowman)", env: "ROLE_POKEMON_SNORLAX_SNOWMAN", group: "roamerMonth" },

    { label: "Mewtwo (Shadow)", env: "ROLE_POKEMON_MEWTWO_SHADOW", group: "roamerMonth" },
    { label: "Golden Sudowoodo", env: "ROLE_POKEMON_GOLDEN_SUDOWOODO", group: "roamerMonth" },
    { label: "XD001", env: "ROLE_POKEMON_XD001", group: "roamerMonth" },
    { label: "Reddy", env: "ROLE_POKEMON_REDDY", group: "roamerMonth" },

    { label: "Meta Groudon", env: "ROLE_POKEMON_META_GROUDON", group: "roamerMonth" },
    { label: "Rayquaza (Illusion)", env: "ROLE_POKEMON_RAYQUAZA_ILLUSION", group: "roamerMonth" },
    { label: "Dialga (Primal)", env: "ROLE_POKEMON_DIALGA_PRIMAL", group: "roamerMonth" },
    { label: "Z2", env: "ROLE_POKEMON_Z2", group: "roamerMonth" },

    // ───────── PARADOX ─────────
    { label: "Walking Wake", env: "ROLE_POKEMON_WALKING_WAKE", group: "paradox" },
    { label: "Gouging Fire", env: "ROLE_POKEMON_GOUGING_FIRE", group: "paradox" },
    { label: "Raging Bolt", env: "ROLE_POKEMON_RAGING_BOLT", group: "paradox" },

    { label: "Iron Leaves", env: "ROLE_POKEMON_IRON_LEAVES", group: "paradox" },
    { label: "Iron Boulder", env: "ROLE_POKEMON_IRON_BOULDER", group: "paradox" },
    { label: "Iron Crown", env: "ROLE_POKEMON_IRON_CROWN", group: "paradox" },

    // ───────── LEGENDARY ─────────
    { label: "Raikou", env: "ROLE_POKEMON_RAIKOU", group: "legendary" },
    { label: "Entei", env: "ROLE_POKEMON_ENTEI", group: "legendary" },
    { label: "Suicune", env: "ROLE_POKEMON_SUICUNE", group: "legendary" },

    { label: "Latias", env: "ROLE_POKEMON_LATIAS", group: "legendary" },
    { label: "Latios", env: "ROLE_POKEMON_LATIOS", group: "legendary" },

    { label: "Glastrier", env: "ROLE_POKEMON_GLASTRIER", group: "legendary" },
    { label: "Spectrier", env: "ROLE_POKEMON_SPECTRIER", group: "legendary" },

    { label: "Koraidon", env: "ROLE_POKEMON_KORAIDON", group: "legendary" },
    { label: "Miraidon", env: "ROLE_POKEMON_MIRAIDON", group: "legendary" },

    // ───────── RARE ─────────
    { label: "Cyclizar", env: "ROLE_POKEMON_CYCLIZAR", group: "rare" },
    { label: "Gimmighoul (Roaming)", env: "ROLE_POKEMON_GIMMIGHOUL_ROAMING", group: "rare" },

    // ───────── COMMON ─────────
    { label: "Zygarde (Cell)", env: "ROLE_POKEMON_ZYGARDE_CELL", group: "common" },
    { label: "Bramblin", env: "ROLE_POKEMON_BRAMBLIN", group: "common" },
    { label: "Bombirdier", env: "ROLE_POKEMON_BOMBIRDIER", group: "common" },
    { label: "Varoom", env: "ROLE_POKEMON_VAROOM", group: "common" }
  ]
};
