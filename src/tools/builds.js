function formatBuildResponse(name) {
  const url = `https://overframe.gg/search/?query=${encodeURIComponent(name)}`;
  return [
    `**Builds communautaires pour ${name}**`,
    ``,
    `🔍 Overframe.gg : ${url}`,
    ``,
    `_Les builds les mieux notés apparaissent en haut du fil. Filtre par patch pour voir les builds récents._`,
  ].join('\n');
}

module.exports = { formatBuildResponse };
