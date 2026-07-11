const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'help',
    description: 'Mostra todos os comandos disponíveis, agrupados por categoria.',
    aliases: ['ajuda', 'comandos'],
    category: 'Utilidade',

    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra todos os comandos disponíveis, agrupados por categoria.'),

    async execute(message, args, client) {
        const prefix = '!';
        const categories = {};

        // Agrupa os comandos únicos (evita listar aliases como comandos separados)
        const seen = new Set();
        for (const command of client.commands.values()) {
            if (seen.has(command.name)) continue;
            seen.add(command.name);

            const cat = command.category || 'Outros';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(command);
        }

        const embed = new EmbedBuilder()
            .setColor(0x818cf8)
            .setTitle('📖 Central de Comandos')
            .setDescription(`Use \`${prefix}comando\` ou \`/comando\` — os dois funcionam igual.`)
            .setTimestamp()
            .setFooter({ text: `${seen.size} comandos disponíveis` });

        const order = ['Moderação', 'Economia', 'Diversão', 'Informação', 'Utilidade', 'Outros'];
        const icons = { 'Moderação': '🛡️', 'Economia': '💰', 'Diversão': '🎉', 'Informação': 'ℹ️', 'Utilidade': '🔧', 'Outros': '📦' };

        for (const cat of order) {
            if (!categories[cat]) continue;
            const lines = categories[cat]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(c => `**/${c.name}** — ${c.description || 'Sem descrição.'}`);
            embed.addFields({ name: `${icons[cat] || '📦'} ${cat}`, value: lines.join('\n').slice(0, 1024) });
        }

        await message.reply({ embeds: [embed] });
    },
};
