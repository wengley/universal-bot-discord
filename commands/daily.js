// daily.js

// REMOVA A LINHA 'const db = require('quick.db');'

// Define o tempo de espera (cooldown) para 24 horas em milissegundos
const tempoEspera = 86400000; // (24 horas * 60 min * 60 seg * 1000 ms)

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: "daily",
    description: "Reivindica sua recompensa diária em moedas.",
    aliases: ["diario"],
    category: 'Economia',
    data: new SlashCommandBuilder().setName('daily').setDescription('Reivindica sua recompensa diária em moedas.'),
    
    // ATENÇÃO: Adiciona 'db' como o quarto argumento
    async execute(message, args, client, db) { 
        
        // Coloque essa checagem de segurança (opcional, mas bom)
        if (!db) return message.reply("❌ O sistema de economia está temporariamente indisponível.");
        
        // Chave única do usuário para o banco de dados (ID do usuário)
        const userId = message.author.id;
        
        // Valor da recompensa diária
        const recompensa = 500; 

        // 1. Verificar o último uso (Cooldown)
        // Busca o timestamp da última vez que o usuário usou o comando
        const ultimaVez = await db.get(`daily_${userId}`); // Usa .get em vez de .fetch
        
        // O RESTANTE DO SEU CÓDIGO AQUI...
        if (ultimaVez !== null && tempoEspera - (Date.now() - ultimaVez) > 0) {
            
            // Se ainda está em cooldown, calcula o tempo restante
            const tempoRestante = tempoEspera - (Date.now() - ultimaVez);
            
            // Converte o tempo restante em horas, minutos e segundos
            let horas = Math.floor(tempoRestante / 3600000);
            let minutos = Math.floor((tempoRestante % 3600000) / 60000);
            let segundos = Math.floor((tempoRestante % 60000) / 1000);

            // Responde informando o tempo restante
            return message.reply(`⏰ Você já resgatou sua recompensa diária! Tente novamente em **${horas}h ${minutos}m ${segundos}s**.`);
            
        } else {
            
            // 2. Conceder a Recompensa
            
            // Adiciona a recompensa ao saldo do usuário
            await db.add(`saldo_${userId}`, recompensa);
            
            // Registra o novo timestamp de uso (agora)
            await db.set(`daily_${userId}`, Date.now());
            
            // Responde com sucesso
            message.reply(`🎉 Você resgatou **${recompensa} moedas** como recompensa diária!`);
        }
    },
};