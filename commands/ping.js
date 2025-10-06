module.exports = {
    name: 'ping',
    description: 'Mostra a latência do bot e da API.',
    
    async execute(message, args) {
        // Latência do Bot (medida ao editar a mensagem)
        const sent = await message.reply('🏓 Ping...');
        
        // Latência da API do Discord
        const apiLatency = Math.round(message.client.ws.ping);

        // Latência de Edição (tempo que o Discord levou para enviar a mensagem)
        const botLatency = sent.createdTimestamp - message.createdTimestamp;

        sent.edit(`🏓 Pong!\n` + 
                  `🤖 Latência do Bot: **${botLatency}ms**\n` +
                  `📡 Latência da API: **${apiLatency}ms**`);
    },
};