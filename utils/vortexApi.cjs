// utils/vortexApi.cjs
const fetch = require('node-fetch');

const API_URL = 'https://api.pokemon-vortex.com/get/roamers/all/';
const API_KEY = process.env.VORTEX_API_KEY;

if (!API_KEY) {
  throw new Error('❌ VORTEX_API_KEY is not set');
}

async function fetchRoamers() {
  const res = await fetch(`${API_URL}?key=${API_KEY}`, {
    headers: {
      'User-Agent': 'Roaming-Companion/1.0'
    },
    timeout: 10000
  });

  if (!res.ok) {
    throw new Error(`Vortex API error: ${res.status}`);
  }

  return res.json();
}

module.exports = { fetchRoamers };
