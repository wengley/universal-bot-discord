// balance.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: "balance",
    description: "Verifica o saldo de moedas do usuário.",
    aliases: ["bal", "saldo"],
    category: 'Economia',
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Verifica o saldo de moedas do usuário.')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuário a consultar (padrão: você)').setRequired(false)),
    
    // ATENÇÃO: Recebe o objeto 'db' (QuickDB) do index.js
    async execute(message, args, client, db) {
        
        // Checagem de segurança, caso o db não seja passado
        if (!db) {
            return message.reply("❌ O sistema de economia está temporariamente indisponível.");
        }

        // Define o usuário alvo:
        // Se alguém for mencionado, usa o mencionado. Caso contrário, usa o autor da mensagem.
        const targetUser = message.mentions.users.first() || message.author;
        const userId = targetUser.id;
        
        // Busca o saldo do usuário no banco de dados
        // Se não houver saldo, ele retorna 0 (padrão Quick.db)
        const saldo = await db.get(`saldo_${userId}`) || 0; 
        
        // Formata e envia a resposta
        if (targetUser.id === message.author.id) {
            // Resposta se o usuário checar o próprio saldo
            message.reply(`💵 Seu saldo atual é de **${saldo.toLocaleString()} moedas**.`);
        } else {
            // Resposta se o usuário checar o saldo de outra pessoa
            message.reply(`💵 O saldo de **${targetUser.username}** é de **${saldo.toLocaleString()} moedas**.`);
        }
    },
};